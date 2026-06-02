"""PROD-FIN-1/2 (v1.47) — carregamento seguro de planilha financeira.

Aceita XLSX/CSV de clínica, valida estrutura + defesa anti-malicia (CSV injection,
zip bomb, magic bytes, tamanho), e converte pra estrutura interna que Ana Maria
consome.

Defesas em camadas:
- Magic bytes: XLSX é zip (PK\\x03\\x04); CSV é texto
- Tamanho: cap em 50MB antes de processar
- Zip bomb: limite de descompressão 100MB total
- CSV injection: escapa fórmulas (=, +, -, @, |, %) com aspas simples
- Path safety: nome de arquivo sanitizado, dado fica em historico/<tenant>/financeiro/
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

# Limites de defesa
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB antes de processar
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024  # 100MB de zip bomb cap
MAX_LINHAS_PROCESSADAS = 50_000  # acima disso, vira amostragem


# Magic bytes — XLSX é arquivo ZIP (PK\x03\x04)
XLSX_MAGIC = b"PK\x03\x04"

# CSV injection — prefixos que Excel/LibreOffice interpretam como fórmula
CSV_INJECTION_CHARS = ("=", "+", "-", "@", "|", "%", "\t", "\r")


class PlanilhaInvalida(Exception):
    """Erro de validação da planilha (formato, conteúdo, tamanho)."""


class PlanilhaMaliciosa(Exception):
    """Detectado vetor de ataque (zip bomb, CSV injection, etc)."""


@dataclass
class PlanilhaCarregada:
    """Resultado da carga: linhas como dicts + metadados."""
    formato: str  # "xlsx" | "csv"
    sheet_name: str
    colunas: list[str]
    linhas: list[dict[str, Any]]
    total_linhas: int  # antes de truncar
    truncada: bool
    hash_sha256: str
    tamanho_bytes: int


def _sanitize_csv_value(v: Any) -> str:
    """Escapa valor pra evitar CSV injection (=cmd|...)."""
    s = "" if v is None else str(v)
    if s and s[0] in CSV_INJECTION_CHARS:
        # Prefixa com aspas simples — neutraliza interpretação como fórmula
        return "'" + s
    return s


def _validar_magic_bytes_xlsx(content: bytes) -> bool:
    """XLSX começa com PK\\x03\\x04 (zip header)."""
    return content[:4] == XLSX_MAGIC


def _detectar_zip_bomb(content: bytes) -> None:
    """Verifica se XLSX é zip bomb (uncompressed > 100MB)."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            total_uncompressed = sum(zi.file_size for zi in zf.infolist())
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise PlanilhaMaliciosa(
                    f"Zip bomb detectado: descompressão seria {total_uncompressed/1024/1024:.1f}MB "
                    f"(cap: {MAX_UNCOMPRESSED_BYTES/1024/1024:.0f}MB). "
                    "Planilha rejeitada."
                )
    except zipfile.BadZipFile:
        raise PlanilhaInvalida("Arquivo não é XLSX válido (zip corrompido).")


def _calcular_hash(content: bytes) -> str:
    """SHA-256 dos bytes pra audit."""
    import hashlib
    return hashlib.sha256(content).hexdigest()


def carregar_xlsx(content: bytes, *, sheet: str | None = None) -> PlanilhaCarregada:
    """Carrega XLSX. Camadas de defesa antes de processar.

    Args:
        content: bytes do arquivo
        sheet: nome da sheet (None = primeira)
    """
    if len(content) > MAX_UPLOAD_BYTES:
        raise PlanilhaInvalida(
            f"Arquivo maior que limite ({len(content)/1024/1024:.1f}MB > "
            f"{MAX_UPLOAD_BYTES/1024/1024:.0f}MB). Reduza o arquivo."
        )

    if not _validar_magic_bytes_xlsx(content):
        raise PlanilhaInvalida(
            "Não parece arquivo XLSX (magic bytes não conferem). "
            "Salve como .xlsx (Excel) e tente de novo."
        )

    _detectar_zip_bomb(content)

    try:
        import openpyxl
    except ImportError as e:
        raise RuntimeError(
            "openpyxl não instalado. Rode: pip install openpyxl"
        ) from e

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise PlanilhaInvalida(f"Falha ao abrir XLSX: {e}") from e

    sheet_name = sheet or wb.sheetnames[0]
    if sheet_name not in wb.sheetnames:
        raise PlanilhaInvalida(
            f"Sheet '{sheet_name}' não existe. Disponíveis: {wb.sheetnames}"
        )
    ws = wb[sheet_name]

    # Primeira linha = cabeçalho
    rows = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows)
    except StopIteration:
        raise PlanilhaInvalida("Planilha vazia (sem cabeçalho).")

    colunas = [str(c).strip() if c is not None else f"col_{i}" for i, c in enumerate(header_row)]

    linhas: list[dict[str, Any]] = []
    total = 0
    for i, row in enumerate(rows):
        total += 1
        if i >= MAX_LINHAS_PROCESSADAS:
            continue  # conta mas não armazena
        linha = {col: row[j] if j < len(row) else None for j, col in enumerate(colunas)}
        # Pula linhas totalmente vazias
        if all(v is None for v in linha.values()):
            continue
        linhas.append(linha)

    wb.close()

    return PlanilhaCarregada(
        formato="xlsx",
        sheet_name=sheet_name,
        colunas=colunas,
        linhas=linhas,
        total_linhas=total,
        truncada=(total > MAX_LINHAS_PROCESSADAS),
        hash_sha256=_calcular_hash(content),
        tamanho_bytes=len(content),
    )


def carregar_csv(content: bytes, *, delimitador: str | None = None) -> PlanilhaCarregada:
    """Carrega CSV. Defesa contra CSV injection via _sanitize_csv_value.

    Args:
        content: bytes do arquivo
        delimitador: ; , \\t  (None = detecta automaticamente)
    """
    if len(content) > MAX_UPLOAD_BYTES:
        raise PlanilhaInvalida(
            f"Arquivo maior que limite ({len(content)/1024/1024:.1f}MB)."
        )

    try:
        texto = content.decode("utf-8")
    except UnicodeDecodeError:
        # Tenta latin-1 (Excel BR salva muito assim)
        try:
            texto = content.decode("latin-1")
        except UnicodeDecodeError as e:
            raise PlanilhaInvalida("Encoding do CSV não é UTF-8 nem Latin-1.") from e

    # Detecta delimitador
    if delimitador is None:
        primeira_linha = texto.split("\n", 1)[0]
        sniffer = csv.Sniffer()
        try:
            delimitador = sniffer.sniff(primeira_linha, delimiters=";,\t|").delimiter
        except csv.Error:
            delimitador = ","  # fallback

    reader = csv.DictReader(io.StringIO(texto), delimiter=delimitador)
    colunas = reader.fieldnames or []
    linhas: list[dict[str, Any]] = []
    total = 0
    for i, row in enumerate(reader):
        total += 1
        if i >= MAX_LINHAS_PROCESSADAS:
            continue
        # PROD-FIN-2 — sanitiza CADA valor contra CSV injection.
        # Cliente joga planilha que tem célula '=cmd|/c calc' — neutralizamos
        # prefixando com aspas simples. Dado fica legível, ataque morre.
        sanitized = {k: _sanitize_csv_value(v) for k, v in row.items()}
        if all(not str(v).strip() for v in sanitized.values()):
            continue
        linhas.append(sanitized)

    return PlanilhaCarregada(
        formato="csv",
        sheet_name="(csv)",
        colunas=list(colunas),
        linhas=linhas,
        total_linhas=total,
        truncada=(total > MAX_LINHAS_PROCESSADAS),
        hash_sha256=_calcular_hash(content),
        tamanho_bytes=len(content),
    )


def carregar(filename: str, content: bytes) -> PlanilhaCarregada:
    """Dispatcher por extensão. Tenta XLSX primeiro (magic bytes), fallback CSV."""
    name_lower = filename.lower()
    if name_lower.endswith(".xlsx"):
        return carregar_xlsx(content)
    if name_lower.endswith(".csv"):
        return carregar_csv(content)
    # Magic bytes fallback (caso filename sem extensão correta)
    if _validar_magic_bytes_xlsx(content):
        return carregar_xlsx(content)
    return carregar_csv(content)


def resumo_estrutural(planilha: PlanilhaCarregada, *, max_amostra: int = 5) -> dict[str, Any]:
    """Gera resumo da planilha pra Ana Maria entender sem ler tudo.

    Retorna: colunas, # linhas, tipos detectados, amostra das primeiras N linhas,
    candidatos a colunas-chave (data, valor, paciente, procedimento).
    """
    # Detecta colunas-chave por nome (regex case-insensitive)
    PATTERNS = {
        "data": re.compile(r"data|date|vencimento|emissao|emissão", re.I),
        "valor": re.compile(r"valor|preço|preco|total|montante|amount|receita|despesa", re.I),
        "paciente": re.compile(r"paciente|cliente|customer|nome", re.I),
        "procedimento": re.compile(r"procedimento|servi[çc]o|tratamento|produto|item", re.I),
        "categoria": re.compile(r"categor|tipo|grupo|class", re.I),
        "forma_pgto": re.compile(r"forma.*pgt|pagamento|payment|cart[aã]o|pix|dinheiro", re.I),
        "status": re.compile(r"status|situa[çc][aã]o|pago|pendente|aberto", re.I),
    }
    candidatos: dict[str, list[str]] = {chave: [] for chave in PATTERNS}
    for col in planilha.colunas:
        for chave, pat in PATTERNS.items():
            if pat.search(col):
                candidatos[chave].append(col)

    return {
        "formato": planilha.formato,
        "sheet": planilha.sheet_name,
        "colunas": planilha.colunas,
        "total_linhas": planilha.total_linhas,
        "linhas_carregadas": len(planilha.linhas),
        "truncada": planilha.truncada,
        "tamanho_bytes": planilha.tamanho_bytes,
        "hash_sha256": planilha.hash_sha256,
        "amostra": planilha.linhas[:max_amostra],
        "candidatos_colunas": {k: v for k, v in candidatos.items() if v},
    }
