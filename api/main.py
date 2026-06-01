"""Aplicação FastAPI do Lemmon Dashboard."""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import agentes, auxiliares, calibragem, concierge, exemplares, exportar, historico, saude, sessoes, share, transcrever
from api.ws_chat import chat
from api.ws_mesa import mesa_redonda
from api.ws_reuniao import reuniao
from core.historico_index import sanity_check

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # T190.D4 — sanity_check pode crashar se disco cheio. Captura pra não morrer.
    try:
        sanity_check()
    except Exception as exc:
        _log.warning("sanity_check falhou na inicialização: %s", exc)
    yield


app = FastAPI(title="Lemmon Dashboard API", lifespan=lifespan)


@app.get("/health")
async def health():
    """T138 — health-check pro instalador validar que backend subiu corretamente.

    Não toca em I/O nem chama LLM — só confirma que o app está rodando.
    """
    return {"status": "ok", "service": "lemmon-agentes", "version": "1.36"}

# T190.A6 — CORS restritivo. Antes era ["*"] (qualquer site externo podia
# invocar). Agora só portas locais conhecidas. Em produção, override via env
# `LEMMON_CORS_ORIGINS` (csv): ex `LEMMON_CORS_ORIGINS=https://meu.dominio.com`
_cors_env = os.getenv("LEMMON_CORS_ORIGINS", "").strip()
if _cors_env:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _cors_origins = [
        "http://localhost:3000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agentes.router)
app.include_router(historico.router)
app.include_router(exportar.router)
app.include_router(exemplares.router)
app.include_router(auxiliares.router)
app.include_router(transcrever.router)
app.include_router(share.router)
app.include_router(calibragem.router)
app.include_router(sessoes.router)
app.include_router(saude.router)
app.include_router(concierge.router)  # T186 — orquestrador conversacional

app.websocket("/ws/chat")(chat)
app.websocket("/ws/reuniao")(reuniao)
app.websocket("/ws/mesa_redonda")(mesa_redonda)
