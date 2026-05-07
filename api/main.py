"""Aplicação FastAPI do Lemmon Dashboard."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auxiliares, calibragem, exemplares, exportar, historico, sessoes, share, transcrever
from api.ws_chat import chat
from api.ws_mesa import mesa_redonda
from api.ws_reuniao import reuniao
from core.historico_index import sanity_check


@asynccontextmanager
async def lifespan(app: FastAPI):
    sanity_check()
    yield


app = FastAPI(title="Lemmon Dashboard API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(historico.router)
app.include_router(exportar.router)
app.include_router(exemplares.router)
app.include_router(auxiliares.router)
app.include_router(transcrever.router)
app.include_router(share.router)
app.include_router(calibragem.router)
app.include_router(sessoes.router)

app.websocket("/ws/chat")(chat)
app.websocket("/ws/reuniao")(reuniao)
app.websocket("/ws/mesa_redonda")(mesa_redonda)
