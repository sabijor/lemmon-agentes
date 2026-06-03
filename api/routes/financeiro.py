"""PROD-FIN-1/2/4 (v1.47) — endpoints de planilha financeira.

POST /financeiro/upload — recebe XLSX/CSV, valida, criptografa (se chave setada),
salva em historico/<tenant>/financeiro/, retorna metadados + resumo estrutural.

GET /financeiro/listar — lista planilhas do tenant (sem conteúdo).

GET /financeiro/{file_id}/resumo — re-lê planilha salva, retorna resumo.

POST /financeiro/{file_id}/analisar — chama Ana Maria pra gerar análise.

Auth:
- Em prod (LEMMON_AUTH_TOKEN setado), exige Bearer.
- Em dev (LEMMON_TENANT_ID=default), permite (single-user local).
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from api.deps import HISTORICO_DIR
from api.security import auth_required
from core import audit
from core.planilha_loader import (
    PlanilhaInvalida,
    PlanilhaMaliciosa,
    carregar,
    resumo_estrutural,
)
from core.tenant import cifrar_texto, cripto_disponivel, decifrar_texto, tenant_id

# v1.46.2 auth opcional em dev — single-user pode usar sem token
router = APIRouter(dependencies=[Depends(auth_required)])


def _financeiro_dir() -> Path:
    """historico/<tenant>/financeiro/ — onde planilhas vivem cifradas."""
    p = HISTORICO_DIR / tenant_id() / "financeiro"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_filename(name: str) -> str:
    """Sanitiza nome de arquivo — alfanum + . _ -, removendo PII."""
    import re
    # Remove path components
    name = name.replace("..", "_").replace("/", "_").replace("\\", "_")
    # Mantém só caracteres seguros
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name[:80] or "planilha"


@router.post("/financeiro/upload")
async def upload_planilha(arquivo: UploadFile = File(...)):
    """Recebe XLSX/CSV da clínica.

    PROD-FIN-1: salva em historico/<tenant>/financeiro/<timestamp>_<nome>.xlsx
    PROD-FIN-2: defesas (magic bytes, zip bomb, CSV injection, tamanho cap)
    PROD-FIN-4: audit log dedicado (hash + tamanho + tenant)

    Cripta com Fernet se LEMMON_ENCRYPT_KEY setada.
    """
    # Lê tudo na memória — limite já é 50MB, então OK
    content = await arquivo.read()
    nome_safe = _safe_filename(arquivo.filename or "planilha.xlsx")

    # Camada de validação — defesa
    try:
        planilha = carregar(nome_safe, content)
    except PlanilhaMaliciosa as e:
        audit.registrar(
            "financeiro_upload_recusado_maliciosa",
            nome=nome_safe,
            tamanho=len(content),
            motivo=str(e),
        )
        raise HTTPException(status_code=400, detail=f"Arquivo recusado: {e}") from e
    except PlanilhaInvalida as e:
        audit.registrar(
            "financeiro_upload_invalido",
            nome=nome_safe,
            tamanho=len(content),
            motivo=str(e),
        )
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Persistência — salva BYTES originais (não os linhas carregadas) cifrados
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_id = f"{ts}_{nome_safe.rsplit('.', 1)[0]}"

    # Salvar bytes originais (criptografados se possível)
    raw_path = _financeiro_dir() / f"{file_id}.raw"
    if cripto_disponivel():
        # Cifra: header "ENC:" + base64 do Fernet token
        import base64
        cifrado = cifrar_texto(base64.b64encode(content).decode("ascii"))
        raw_path.write_text(cifrado, encoding="utf-8")
        cifrado_flag = True
    else:
        # Dev sem cripto: salva binário cru
        raw_path = raw_path.with_suffix(".bin")
        raw_path.write_bytes(content)
        cifrado_flag = False

    # Salvar metadados em JSON pra listagem rápida
    meta = {
        "file_id": file_id,
        "filename_original": arquivo.filename,
        "filename_safe": nome_safe,
        "uploaded_at": datetime.utcnow().isoformat() + "Z",
        "tamanho_bytes": len(content),
        "hash_sha256": planilha.hash_sha256,
        "cifrado": cifrado_flag,
        "formato": planilha.formato,
        "sheet": planilha.sheet_name,
        "total_linhas": planilha.total_linhas,
        "truncada": planilha.truncada,
        "colunas": planilha.colunas,
    }
    meta_path = _financeiro_dir() / f"{file_id}.meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # PROD-FIN-4 — audit detalhado (LGPD dado sensível)
    audit.registrar(
        "financeiro_upload",
        file_id=file_id,
        filename=arquivo.filename,
        tamanho=len(content),
        hash=planilha.hash_sha256[:16],
        formato=planilha.formato,
        linhas=planilha.total_linhas,
        cifrado=cifrado_flag,
    )

    return {
        "ok": True,
        "file_id": file_id,
        "resumo": resumo_estrutural(planilha),
        "cifrado": cifrado_flag,
        "aviso": None if cripto_disponivel() else (
            "⚠️ Cripto-at-rest desativada (LEMMON_ENCRYPT_KEY ausente). "
            "Planilha salva em texto claro no disco. Para dado sensível, "
            "configure LEMMON_ENCRYPT_KEY."
        ),
    }


@router.get("/financeiro/listar")
async def listar_planilhas():
    """Lista metadados de planilhas do tenant."""
    metas = []
    for meta_path in _financeiro_dir().glob("*.meta.json"):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            metas.append(meta)
        except Exception:
            continue
    # Ordena mais recente primeiro
    metas.sort(key=lambda m: m.get("uploaded_at", ""), reverse=True)
    return {"total": len(metas), "planilhas": metas}


def _ler_planilha_salva(file_id: str) -> bytes:
    """Re-lê bytes originais de uma planilha salva (decifrando se necessário)."""
    base = _financeiro_dir() / file_id
    raw_enc = base.with_suffix(".raw")
    raw_bin = base.with_suffix(".bin")
    if raw_enc.exists():
        import base64
        cifrado = raw_enc.read_text(encoding="utf-8")
        decifrado_b64 = decifrar_texto(cifrado)
        return base64.b64decode(decifrado_b64)
    if raw_bin.exists():
        return raw_bin.read_bytes()
    raise HTTPException(status_code=404, detail=f"Planilha {file_id} não encontrada.")


@router.get("/financeiro/{file_id}/resumo")
async def resumo_planilha(file_id: str):
    """Re-lê planilha salva e retorna resumo estrutural."""
    # Sanitize file_id (path traversal)
    import re
    if not re.match(r"^[a-zA-Z0-9_\-]+$", file_id):
        raise HTTPException(status_code=400, detail="file_id inválido")

    meta_path = _financeiro_dir() / f"{file_id}.meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Planilha {file_id} não encontrada.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    audit.registrar("financeiro_resumo_acesso", file_id=file_id)

    content = _ler_planilha_salva(file_id)
    planilha = carregar(meta["filename_safe"], content)
    return {"meta": meta, "resumo": resumo_estrutural(planilha)}


@router.post("/financeiro/{file_id}/analisar")
async def analisar_planilha(file_id: str):
    """PROD-FIN-3 — chama Ana Maria com planilha de contexto.

    Resumo estrutural + amostra das primeiras linhas vão pro prompt da Ana.
    Retorna análise em markdown (DRE simplificado, ticket médio, top procedimentos).
    """
    import re
    if not re.match(r"^[a-zA-Z0-9_\-]+$", file_id):
        raise HTTPException(status_code=400, detail="file_id inválido")

    meta_path = _financeiro_dir() / f"{file_id}.meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Planilha {file_id} não encontrada.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    content = _ler_planilha_salva(file_id)
    planilha = carregar(meta["filename_safe"], content)
    resumo = resumo_estrutural(planilha, max_amostra=20)  # mais amostra pra Ana

    audit.registrar(
        "financeiro_analise_solicitada",
        file_id=file_id,
        linhas=planilha.total_linhas,
    )

    # Monta contexto pra Ana Maria
    contexto = (
        f"Planilha: {meta['filename_original']}\n"
        f"Formato: {planilha.formato} | Sheet: {planilha.sheet_name}\n"
        f"Total linhas: {planilha.total_linhas}\n"
        f"Colunas: {', '.join(planilha.colunas)}\n"
        f"Colunas-chave detectadas: {resumo['candidatos_colunas']}\n\n"
        f"Amostra (primeiras 20 linhas):\n"
        f"{json.dumps(resumo['amostra'], ensure_ascii=False, indent=2, default=str)}\n"
    )

    pergunta = (
        "Analise essa planilha financeira da clínica. Produza:\n"
        "1. Visão geral (período coberto, volume de transações)\n"
        "2. DRE simplificado (receita total, despesa total, resultado) — se conseguir identificar\n"
        "3. Top 5 procedimentos/produtos por receita\n"
        "4. Ticket médio + tendência (se tiver data)\n"
        "5. Alertas: despesas fora do padrão, recebimentos atrasados, etc\n\n"
        "Use bullets e tabelas markdown. Seja objetivo. Se faltar coluna pra alguma análise, diga."
    )

    try:
        from agentes.ana_maria import AnaMaria
        ana = AnaMaria()
        res = ana.executar(briefing=pergunta, contexto_extra=contexto)
        output_humano = res.get("output_humano", "")
        custo = res.get("custo_total_usd", 0)
    except Exception as e:
        audit.registrar("financeiro_analise_erro", file_id=file_id, erro=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao chamar Ana Maria: {e}",
        ) from e

    audit.registrar(
        "financeiro_analise_concluida",
        file_id=file_id,
        custo_usd=custo,
        chars_output=len(output_humano),
    )

    return {
        "ok": True,
        "file_id": file_id,
        "analise": output_humano,
        "custo_usd": custo,
        "meta": meta,
    }
