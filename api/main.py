"""Aplicação FastAPI do Lemmon Dashboard."""
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from api.deps import _anthropic_client
from api.routes import agentes, auxiliares, brand_kit, calibragem, concierge, exemplares, exportar, financeiro, historico, lgpd, saude, sessoes, share, transcrever, treino_pedro, usuarios
from api.ws_chat import chat
from api.ws_mesa import mesa_redonda
from api.ws_reuniao import reuniao
from core.historico_index import sanity_check
from core.logging_estruturado import (
    novo_request_id,
    set_request_id,
    set_tenant_id,
    setup_logging,
)

# v1.48 A6a-006 — Setup de logging estruturado (idempotente).
# LEMMON_LOG_JSON=1 emite JSON; sem env, texto humano.
setup_logging()
_log = logging.getLogger(__name__)


# v1.48 A6a-006 — Middleware que cria request_id + propaga via contextvar.
# Cada request HTTP ganha 1 ID; logs dentro dela carregam o ID automaticamente.
# Header `X-Request-ID` na resposta permite cliente correlacionar.
class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Aceita ID vindo do cliente (loadbalancer pode setar), senão gera
        rid = request.headers.get("x-request-id") or novo_request_id()
        set_request_id(rid)
        # Tenta setar tenant cedo (best-effort — env LEMMON_TENANT_ID)
        try:
            from core.tenant import tenant_id as _tid
            set_tenant_id(_tid())
        except Exception:
            pass
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


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
            # T191.RL-fix — BaseHTTPMiddleware não captura HTTPException;
            # precisa retornar Response direto pra cliente receber 429.
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"Limite de chamadas atingido ({self.max_per_min}/min). "
                        "Aguarde alguns segundos."
                    )
                },
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
    return {"status": "ok", "service": "lemmon-agentes", "version": "1.48"}


@app.get("/health/full")
async def health_full():
    """v1.49 A6a-004/005 — health probe completo: disco, env, tenant, cripto.

    Roda em ~10ms (sem chamada externa). Útil pra:
    - Cron/monitor checando se algo crítico tá degradado
    - Onboarding: pingar 1x antes do Pedro abrir dashboard
    - Pós-update: confirmar que migrations não quebraram nada

    Retorna 200 sempre (não 503), pra facilitar parser. Campo `status` por
    componente: "ok" | "warn" | "error".
    """
    import shutil
    from pathlib import Path
    relatorio: dict = {"status": "ok", "checks": {}, "version": "1.48"}

    # 1. Disco — alerta se < 500MB livre (não dá pra fazer backup decente)
    try:
        total, used, free = shutil.disk_usage(Path(__file__).parent.parent)
        free_mb = free // (1024 * 1024)
        if free_mb < 100:
            disco_status = "error"
            relatorio["status"] = "error"
        elif free_mb < 500:
            disco_status = "warn"
            if relatorio["status"] == "ok":
                relatorio["status"] = "warn"
        else:
            disco_status = "ok"
        relatorio["checks"]["disk"] = {
            "status": disco_status,
            "free_mb": free_mb,
            "total_mb": total // (1024 * 1024),
        }
    except Exception as e:
        relatorio["checks"]["disk"] = {"status": "error", "msg": str(e)}
        relatorio["status"] = "error"

    # 2. ANTHROPIC_API_KEY presente?
    if os.getenv("ANTHROPIC_API_KEY"):
        relatorio["checks"]["anthropic_key"] = {"status": "ok"}
    else:
        relatorio["checks"]["anthropic_key"] = {
            "status": "error",
            "msg": ".env sem ANTHROPIC_API_KEY — agentes vão retornar 401",
        }
        relatorio["status"] = "error"

    # 3. Tenant detectado?
    try:
        from core.tenant import tenant_id
        t = tenant_id()
        relatorio["checks"]["tenant"] = {"status": "ok", "tenant": t}
        if t == "default":
            relatorio["checks"]["tenant"]["warn"] = (
                "tenant='default' — defina LEMMON_TENANT_ID pra multi-cliente"
            )
    except Exception as e:
        relatorio["checks"]["tenant"] = {"status": "error", "msg": str(e)}

    # 4. Cripto-at-rest disponível?
    try:
        from core.tenant import cripto_disponivel
        if cripto_disponivel():
            relatorio["checks"]["cripto"] = {"status": "ok"}
        else:
            relatorio["checks"]["cripto"] = {
                "status": "warn",
                "msg": "LEMMON_ENCRYPT_KEY ausente — dados sensíveis em plaintext",
            }
    except Exception as e:
        relatorio["checks"]["cripto"] = {"status": "error", "msg": str(e)}

    # 5. Audit log gravável?
    try:
        from core import audit
        path = audit._audit_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Smoke test: tenta abrir em append, fecha. Se filesystem read-only,
        # detecta antes do request real escrever evento crítico.
        with open(path, "a", encoding="utf-8") as _f:
            pass
        relatorio["checks"]["audit"] = {"status": "ok", "path": str(path)}
    except Exception as e:
        relatorio["checks"]["audit"] = {"status": "error", "msg": str(e)}
        relatorio["status"] = "error"

    return relatorio


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

# v1.48 A6a-006 — Request ID propagado pra logs estruturados.
# Cliente recebe X-Request-ID na resposta; logs internos têm rid correlacionado.
app.add_middleware(RequestIdMiddleware)

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
app.include_router(financeiro.router)  # PROD-FIN v1.47 — planilha financeira XLSX/CSV pra Ana Maria
app.include_router(treino_pedro.router)  # PROD-2 — Calibragem que treina

app.websocket("/ws/chat")(chat)
app.websocket("/ws/reuniao")(reuniao)
app.websocket("/ws/mesa_redonda")(mesa_redonda)
