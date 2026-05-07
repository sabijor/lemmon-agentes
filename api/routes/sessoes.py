"""Rotas de métricas de sessões — medianas de duração por agente."""
import json
import time
from statistics import median

from fastapi import APIRouter

from api.deps import HISTORICO_DIR

router = APIRouter()

_cache: dict[str, tuple[float | None, int, float]] = {}
_CACHE_TTL = 60  # seconds


@router.get("/sessoes/medianas")
async def medianas_agente(agente: str):
    """Retorna mediana de duração (s) das últimas 20 sessões para um agente.

    Retorna null se < 3 amostras disponíveis.
    """
    now = time.monotonic()
    if agente in _cache:
        mediana_val, amostras, expires_at = _cache[agente]
        if now < expires_at:
            return {"mediana_segundos": mediana_val, "amostras": amostras}

    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        _cache[agente] = (None, 0, now + _CACHE_TTL)
        return {"mediana_segundos": None, "amostras": 0}

    files = sorted(
        session_dir.glob("*_sessao.json"),
        key=lambda p: p.stem,
        reverse=True,
    )[:20]

    duracoes: list[float] = []
    for path in files:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            d = dados.get("duracoes_segundos", {})
            if agente in d and isinstance(d[agente], (int, float)) and d[agente] > 0:
                duracoes.append(float(d[agente]))
        except Exception:
            pass

    if len(duracoes) < 3:
        result: tuple[float | None, int, float] = (None, len(duracoes), now + _CACHE_TTL)
    else:
        result = (median(duracoes), len(duracoes), now + _CACHE_TTL)

    _cache[agente] = result
    return {"mediana_segundos": result[0], "amostras": result[1]}
