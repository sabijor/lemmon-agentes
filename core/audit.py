"""Audit log estruturado — LGPD G-02 + V-01 trail.

Cada ação sensível grava uma linha JSON em `historico/<tenant>/audit.jsonl`:
- session_create, session_view, session_delete
- export_pdf, share_link_created, share_token_revoked
- login_success, login_fail (quando LEMMON_AUTH_TOKEN ativo)
- feedback_dado, prompt_injection_detected
- financeiro_upload, financeiro_analise (v1.47)

Formato: JSON Lines append-only.
v1.48 A3a-005 — adicionado:
- hash chain (cada linha tem `prev` = SHA-256 da linha anterior). Detecção de
  tampering: edição/remoção quebra a chain de forma rastreável.
- fsync por write — garante durabilidade mesmo com crash imediato.
- rotação diária — arquivo do dia atual em `audit.jsonl`, dias anteriores
  rotacionados pra `audit-YYYY-MM-DD.jsonl`. Audit nunca cresce indefinidamente.

NÃO inclua PII — só metadados (ids, timestamps, contagens).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime
from pathlib import Path
from threading import Lock

from .config import HISTORICO_DIR
from .tenant import tenant_id

_lock = Lock()

# v1.48 A3a-005 — cache em memória do hash da última linha (por path).
# Sem isso, cada registrar() teria que ler todo o arquivo pra achar a última linha.
_last_hash_cache: dict[str, str] = {}


def _audit_dir() -> Path:
    """Diretório do audit log do tenant atual."""
    p = HISTORICO_DIR / tenant_id()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _audit_path() -> Path:
    """Path do audit log ativo (dia atual)."""
    return _audit_dir() / "audit.jsonl"


def _rotated_path(day: str) -> Path:
    """Path do audit log rotacionado de um dia específico (YYYY-MM-DD)."""
    return _audit_dir() / f"audit-{day}.jsonl"


def _rotacionar_se_dia_mudou() -> None:
    """v1.48 A3a-005 — rotaciona audit.jsonl pra audit-YYYY-MM-DD.jsonl se mudou o dia.

    Roda no início de cada registrar(). Sem isso, audit cresce indefinidamente.
    """
    atual = _audit_path()
    if not atual.exists():
        return
    # Pega o timestamp da PRIMEIRA linha pra saber de quando é o arquivo atual
    try:
        with atual.open("r", encoding="utf-8") as fp:
            primeira_linha = fp.readline()
        if not primeira_linha:
            return
        primeiro_dado = json.loads(primeira_linha)
        primeiro_ts = primeiro_dado.get("ts", 0)
        if not isinstance(primeiro_ts, (int, float)):
            return
        dia_primeira = datetime.fromtimestamp(primeiro_ts).strftime("%Y-%m-%d")
        dia_hoje = datetime.now().strftime("%Y-%m-%d")
        if dia_primeira == dia_hoje:
            return  # ainda no mesmo dia, não rotaciona
        # Mudou o dia — renomeia
        destino = _rotated_path(dia_primeira)
        if not destino.exists():
            atual.rename(destino)
        else:
            # Já existe rotacionado do mesmo dia — anexa (raro, mas evita perda)
            with destino.open("a", encoding="utf-8") as fp_destino, atual.open("r", encoding="utf-8") as fp_atual:
                fp_destino.write(fp_atual.read())
            atual.unlink()
        # Reseta cache do path (nova chain pra próximo dia)
        _last_hash_cache.pop(str(atual), None)
    except Exception:
        # Best-effort — não bloqueia registro só por falha na rotação
        pass


def _carregar_last_hash(path: Path) -> str:
    """v1.48 A3a-005 — lê a última linha do arquivo pra recuperar hash atual.

    Chamado uma vez por processo (cache em memória). Após isso, mantém em memória.
    Permite continuar a chain após restart do backend.
    """
    path_str = str(path)
    if path_str in _last_hash_cache:
        return _last_hash_cache[path_str]
    if not path.exists():
        _last_hash_cache[path_str] = ""
        return ""
    try:
        # Lê só a última linha pra economizar IO
        with path.open("rb") as fp:
            # Vai pro fim e procura último \n
            fp.seek(0, 2)
            size = fp.tell()
            chunk_size = min(4096, size)
            fp.seek(max(0, size - chunk_size))
            chunk = fp.read()
            ultima_linha = chunk.rsplit(b"\n", 2)[-1] if b"\n" in chunk else chunk
            if not ultima_linha:
                _last_hash_cache[path_str] = ""
                return ""
            dado = json.loads(ultima_linha.decode("utf-8"))
            hash_atual = dado.get("hash", "")
            _last_hash_cache[path_str] = hash_atual
            return hash_atual
    except Exception:
        _last_hash_cache[path_str] = ""
        return ""


def _calcular_hash(linha_sem_hash: dict) -> str:
    """SHA-256 do JSON canônico da linha (sem o próprio campo 'hash')."""
    canonical = json.dumps(linha_sem_hash, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def registrar(evento: str, **detalhes) -> None:
    """Grava 1 linha JSON no audit log com hash chain.

    Args:
        evento: nome curto (snake_case) do tipo de evento
        **detalhes: campos extras (NÃO inclua PII — só ids, timestamps, contagens)

    v1.48 A3a-005 — agora com:
    - hash chain (`prev` = hash da linha anterior; `hash` = sha256 da linha atual)
    - fsync por write — durabilidade garantida
    - rotação diária — `audit.jsonl` é só do dia atual

    Best-effort: nunca lança. Se IO falhar, segue silencioso.
    """
    if os.getenv("LEMMON_AUDIT_DISABLE") == "1":
        return

    try:
        _rotacionar_se_dia_mudou()
        path = _audit_path()
        prev_hash = _carregar_last_hash(path)

        linha = {
            "ts": time.time(),
            "evt": evento,
            "tenant": tenant_id(),
            "prev": prev_hash,
            **detalhes,
        }
        # Hash do conteúdo (excluindo o próprio campo 'hash' que ainda não existe)
        linha["hash"] = _calcular_hash(linha)

        with _lock:
            with path.open("a", encoding="utf-8") as fp:
                fp.write(json.dumps(linha, ensure_ascii=False) + "\n")
                # v1.48 A3a-005 — fsync garante durabilidade mesmo se Mac crashar
                # imediatamente após gravação. Custa um pouco de performance mas
                # auditoria precisa ser inadulterável.
                fp.flush()
                os.fsync(fp.fileno())
            _last_hash_cache[str(path)] = linha["hash"]
    except Exception:
        pass  # best-effort


def verificar_integridade(path: Path | None = None) -> tuple[bool, str]:
    """v1.48 A3a-005 — valida que hash chain do audit não foi adulterada.

    Retorna (ok, mensagem). Usado em testes e ferramenta de auditoria forense.

    Args:
        path: arquivo audit pra verificar (default: dia atual)

    Returns:
        (True, "ok N linhas") se chain íntegra
        (False, "linha X: hash diverge" ou similar) se quebrada
    """
    if path is None:
        path = _audit_path()
    if not path.exists():
        return True, "arquivo não existe (0 linhas)"

    try:
        with path.open("r", encoding="utf-8") as fp:
            linhas = fp.readlines()
    except Exception as e:
        return False, f"falha ao ler arquivo: {e}"

    if not linhas:
        return True, "ok 0 linhas"

    prev_hash_esperado = ""
    for n, linha_raw in enumerate(linhas, start=1):
        try:
            dado = json.loads(linha_raw)
        except json.JSONDecodeError as e:
            return False, f"linha {n}: JSON inválido — {e}"

        if dado.get("prev", "") != prev_hash_esperado:
            return False, (
                f"linha {n}: prev='{dado.get('prev', '')[:8]}…' esperava "
                f"'{prev_hash_esperado[:8]}…' — chain quebrada (tampering ou edição manual?)"
            )

        # Recalcula hash da linha sem o próprio campo 'hash'
        hash_armazenado = dado.pop("hash", "")
        hash_recalculado = _calcular_hash(dado)
        if hash_armazenado != hash_recalculado:
            return False, (
                f"linha {n}: hash diverge — armazenado='{hash_armazenado[:8]}…' "
                f"recalculado='{hash_recalculado[:8]}…' — campo foi editado"
            )
        prev_hash_esperado = hash_armazenado

    return True, f"ok {len(linhas)} linhas"
