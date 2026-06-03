"""Camada de segurança simples — Bearer token opcional + origin check.

SEC-A — Bearer token via env `LEMMON_AUTH_TOKEN`.
  Se a env estiver vazia/desabilitada, sistema permanece aberto (modo dev).
  Se setada, TODAS as rotas HTTP exigem header `Authorization: Bearer <token>`.
  WebSocket exige `?token=<token>` no query string.

SEC-B — Origin check pra WebSocket.
  Lê env `LEMMON_CORS_ORIGINS` (csv); se WS chegar de outra origem, fecha 1008.
  Em dev (env vazia) aceita qualquer origin.
"""
from __future__ import annotations

import os
import secrets  # v1.46.2 A3a-004 — constant-time token compare
from typing import Iterable

from fastapi import HTTPException, Request, WebSocket, status


# v1.46.2 A3a-011 — lazy reading do env (era cacheado no import — testes não
# conseguiam ativar auth em runtime e prod precisava reiniciar pra mudar).
def _token() -> str:
    return os.getenv("LEMMON_AUTH_TOKEN", "").strip()


# Mantido como alias pra compatibilidade backward (auth_enabled etc)
_TOKEN = _token()


def _allowed_origins() -> list[str]:
    """Origens permitidas no WS — mesma lista do CORS."""
    cors_env = os.getenv("LEMMON_CORS_ORIGINS", "").strip()
    if cors_env:
        return [o.strip() for o in cors_env.split(",") if o.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4000",
    ]


def auth_required(request: Request) -> None:
    """SEC-A — dependency que valida Bearer token quando LEMMON_AUTH_TOKEN setada.

    v1.46.2 A3a-004 — usa secrets.compare_digest (constant-time) em vez de `==`.
    Antes era timing-attack-vulnerable.

    Uso:
      @router.get("/endpoint", dependencies=[Depends(auth_required)])
      async def endpoint(...): ...
    """
    esperado = _token()
    if not esperado:
        return  # modo dev / single-user — pula auth
    # Health-check sempre liberado
    if request.url.path in ("/health", "/health/anthropic"):
        return
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação requerida (Bearer token).",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = header[len("Bearer "):].strip()
    if not secrets.compare_digest(token, esperado):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        )


async def ws_authorize(ws: WebSocket) -> bool:
    """SEC-A + SEC-B — valida origin e token do WebSocket.

    Retorna True se OK. Se não, fecha conexão antes do accept e retorna False.
    """
    # Origin check
    origin = ws.headers.get("origin", "")
    allowed = _allowed_origins()
    if origin and origin not in allowed:
        try:
            await ws.close(code=1008, reason="origin not allowed")
        except Exception:
            pass
        return False
    # Token check (se setado)
    if _TOKEN:
        token = ws.query_params.get("token", "")
        if token != _TOKEN:
            try:
                await ws.close(code=1008, reason="invalid token")
            except Exception:
                pass
            return False
    return True


def auth_enabled() -> bool:
    """True se LEMMON_AUTH_TOKEN setado (auth obrigatória)."""
    return bool(_TOKEN)
