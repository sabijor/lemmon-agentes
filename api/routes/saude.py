"""Rotas de saúde e métricas de latência do sistema."""
import json
from datetime import datetime, timedelta, timezone
from statistics import mean

from fastapi import APIRouter

from api.deps import HISTORICO_DIR

router = APIRouter()


@router.get("/saude/latencias")
async def latencias_agente(agente: str, dias: int = 30):
    """Retorna médias semanais de duração (s) de um agente nos últimos N dias.

    Resposta:
      { semanas: [{ semana: "2026-W18", media_s: 32.4, n: 4 }, ...] }

    Semanas sem dados são omitidas. Semanas com media_s > 120 têm flag
    lenta=true para coloração no frontend.
    """
    dias = max(7, min(dias, 365))
    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        return {"semanas": []}

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=dias)

    # Agrupar durações por semana ISO
    semanas: dict[str, list[float]] = {}
    for path in session_dir.glob("*_sessao.json"):
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            ts_str = dados.get("timestamp")
            if not ts_str:
                continue
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts < cutoff:
                continue
            duracoes = dados.get("duracoes_segundos", {})
            val = duracoes.get(agente)
            if val is None or not isinstance(val, (int, float)) or val <= 0:
                continue
            iso_week = ts.strftime("%G-W%V")
            semanas.setdefault(iso_week, []).append(float(val))
        except Exception:
            pass

    result = []
    for semana in sorted(semanas.keys()):
        vals = semanas[semana]
        media = mean(vals)
        result.append({
            "semana": semana,
            "media_s": round(media, 1),
            "n": len(vals),
            "lenta": media > 120,
        })

    return {"semanas": result}
