"""Aplicação FastAPI do Lemmon Dashboard."""
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from api.deps import _anthropic_client
from api.routes import agentes, auxiliares, brand_kit, calibragem, concierge, exemplares, exportar, historico, lgpd, saude, sessoes, share, transcrever, treino_pedro, usuarios
from api.ws_chat import chat
from api.ws_mesa import mesa_redonda
from api.ws_reuniao import reuniao
from core.historico_index import sanity_check

_log = logging.getLogger(__name__)


# T190.D5 — Rate limit simples em memória.
# 60 requisições por minuto por IP (suficiente pra uso normal Lemmon,
# detecta cliente/bot martelando). Não usa Redis pra manter zero-deps.
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_per_min: int = 60):
        super().__init__(app)
        self.max_per_min = max_per_min
        self.hits: dict[str, deque] = defaultdict(lambda: deque(maxlen=max_per_min + 1))

    async def dispatch(self, request: Request, call_next):
        # WebSockets não passam por aqui (são tratados separadamente)
        # Health-check sem rate limit (instaladores precisam ping)
        if request.url.path in ("/health", "/health/anthropic"):
            return await call_next(request)
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        hits = self.hits[client_ip]
        # Remove hits mais antigos que 60s
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.max_per_min:
            raise HTTPException(
                status_code=429,
                detail=f"Limite de chamadas atingido ({self.max_per_min}/min). Aguarde alguns segundos.",
            )
        hits.append(now)
        return await call_next(request)


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
    return {"status": "ok", "service": "lemmon-agentes", "version": "1.44"}


@app.get("/health/anthropic")
async def health_anthropic():
    """T190.D8 — confirma que a chave da Anthropic está válida e API responde.

    Faz uma chamada minimalista (1 token) pra validar credencial + conectividade.
    Custo desprezível (~$0.000003 por ping).
    """
    try:
        # Lista os modelos disponíveis (não consome tokens, só auth check)
        list(_anthropic_client.models.list(limit=1))
        return {"status": "ok", "anthropic": "reachable"}
    except Exception as exc:
        from core.agente_base import classificar_erro_anthropic, formatar_erro_anthropic
        return {
            "status": "error",
            "kind": classificar_erro_anthropic(exc),
            "message": formatar_erro_anthropic(exc),
        }

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

# T190.D5 — rate limit em memória. Configurável via env LEMMON_RATE_LIMIT_PER_MIN.
_rate_limit_per_min = int(os.getenv("LEMMON_RATE_LIMIT_PER_MIN", "60"))
app.add_middleware(RateLimitMiddleware, max_per_min=_rate_limit_per_min)

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
app.include_router(lgpd.router)  # G-01/02/03 — LGPD compliance
app.include_router(brand_kit.router)  # PROD-7 — Brand Kit por cliente
app.include_router(usuarios.router)  # PROD-8 — Multi-user
app.include_router(treino_pedro.router)  # PROD-2 — Calibragem que treina

app.websocket("/ws/chat")(chat)
app.websocket("/ws/reuniao")(reuniao)
app.websocket("/ws/mesa_redonda")(mesa_redonda)
