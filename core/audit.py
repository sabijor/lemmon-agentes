"""Audit log estruturado — LGPD G-02 + V-01 trail.

Cada ação sensível grava uma linha JSON em `historico/<tenant>/audit.jsonl`:
- session_create, session_view, session_delete
- export_pdf, share_link_created, share_token_revoked
- login_success, login_fail (quando LEMMON_AUTH_TOKEN ativo)
- feedback_dado, prompt_injection_detected

Formato append-only (JSON Lines). Não vaza PII — só metadados.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import Lock

from .config import HISTORICO_DIR
from .tenant import tenant_id

_lock = Lock()


def _audit_path() -> Path:
    """Path do audit log do tenant atual."""
    p = HISTORICO_DIR / tenant_id()
    p.mkdir(parents=True, exist_ok=True)
    return p / "audit.jsonl"


def registrar(evento: str, **detalhes) -> None:
    """Grava 1 linha JSON no audit log.

    Args:
        evento: nome curto (snake_case) do tipo de evento
        **detalhes: campos extras (NÃO inclua PII — só ids, timestamps, contagens)

    Best-effort: nunca lança. Se IO falhar, segue silencioso.
    """
    if os.getenv("LEMMON_AUDIT_DISABLE") == "1":
        return
    linha = {
        "ts": time.time(),
        "evt": evento,
        "tenant": tenant_id(),
        **detalhes,
    }
    try:
        with _lock, _audit_path().open("a", encoding="utf-8") as fp:
            fp.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except Exception:
        pass  # best-effort
