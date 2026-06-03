"""v1.48 A6a-006 — Logs estruturados JSON + request_id propagado.

Por quê:
- Antes: logs em texto livre, sem request_id, sem tenant. Pra investigar bug do Pedro,
  precisava grep frágil ("clínica Hator" e torcer).
- Agora: cada log linha JSON com {timestamp, level, msg, request_id, tenant_id,
  session_id, agente} permitindo jq + análise reproduzível.

Compat: ativa via env LEMMON_LOG_JSON=1. Sem env, mantém logging text humano.
Não muda assinatura de loggers existentes (drop-in).

Como usar:
1. Em api/main.py no startup: `setup_logging()`
2. Em endpoints: middleware seta request_id no contextvar
3. Em agentes: chamada logger.info("evento", extra={"agente": "otto", "session_id": X})
   passa por filter que injeta context vars no record automaticamente.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import time
import uuid
from typing import Any

# ─── Context vars (request scoped) ───────────────────────────────────

# request_id: 1 por HTTP request, propagado pra tudo que rodar dentro dela
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)
_tenant_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "tenant_id", default=""
)
_session_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "session_id", default=""
)
_agente_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "agente", default=""
)


def set_request_id(rid: str) -> None:
    _request_id_ctx.set(rid)


def get_request_id() -> str:
    return _request_id_ctx.get()


def set_tenant_id(tid: str) -> None:
    _tenant_id_ctx.set(tid)


def set_session_id(sid: str) -> None:
    _session_id_ctx.set(sid)


def set_agente(nome: str) -> None:
    _agente_ctx.set(nome)


def novo_request_id() -> str:
    """Gera request_id curto pra header de resposta + logs."""
    return uuid.uuid4().hex[:12]


# ─── Filter que injeta contextvars no LogRecord ──────────────────────


class ContextFilter(logging.Filter):
    """Adiciona request_id, tenant_id, session_id, agente ao LogRecord.

    Usado por todos os handlers — texto e JSON.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_ctx.get() or "-"
        record.tenant_id = _tenant_id_ctx.get() or "-"
        record.session_id = _session_id_ctx.get() or "-"
        record.agente = _agente_ctx.get() or "-"
        return True


# ─── Formatter JSON (uma linha por log) ──────────────────────────────


class JsonFormatter(logging.Formatter):
    """Emite uma linha JSON por record. Stable schema pra grep/jq."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                  + f".{int((record.created % 1) * 1000):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "tenant_id": getattr(record, "tenant_id", "-"),
            "session_id": getattr(record, "session_id", "-"),
            "agente": getattr(record, "agente", "-"),
        }
        # Inclui extras (ex: custo_usd, duracao_s)
        for k, v in record.__dict__.items():
            if k in payload or k.startswith("_"):
                continue
            if k in (
                "args", "msg", "name", "levelname", "levelno",
                "pathname", "filename", "module", "lineno", "funcName",
                "created", "msecs", "relativeCreated", "thread", "threadName",
                "processName", "process", "exc_info", "exc_text", "stack_info",
                "request_id", "tenant_id", "session_id", "agente", "taskName",
                "message",
            ):
                continue
            # Só inclui se serializável (best-effort)
            try:
                json.dumps(v)
                payload[k] = v
            except (TypeError, ValueError):
                payload[k] = repr(v)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


# ─── Setup global ────────────────────────────────────────────────────


_LOGGING_SETUP_DONE = False


def setup_logging(force: bool = False) -> None:
    """Configura logging global (idempotente).

    - LEMMON_LOG_JSON=1 → JSON em stderr (prod)
    - Default → texto humano (dev)
    - LEMMON_LOG_LEVEL=DEBUG|INFO|WARNING (default INFO)
    """
    global _LOGGING_SETUP_DONE
    if _LOGGING_SETUP_DONE and not force:
        return

    level_name = os.getenv("LEMMON_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler()  # stderr
    handler.addFilter(ContextFilter())

    if os.getenv("LEMMON_LOG_JSON") == "1":
        handler.setFormatter(JsonFormatter())
    else:
        # Texto humano com request_id curto pra dev rastrear
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] [rid=%(request_id)s tnt=%(tenant_id)s] "
            "%(name)s: %(message)s",
            datefmt="%H:%M:%S",
        ))

    root = logging.getLogger()
    # Remove handlers anteriores (idempotência)
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)
    root.setLevel(level)

    _LOGGING_SETUP_DONE = True
