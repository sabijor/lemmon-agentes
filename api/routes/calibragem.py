"""Rotas T37 — calibragem espelho Pedro IA × real."""
import json
import secrets
from datetime import datetime

from fastapi import APIRouter

from api.deps import CALIBRAGEM_FILE
from api.schemas import FeedbackPedroPayload

router = APIRouter()


@router.post("/calibragem_pedro")
async def registrar_calibragem(payload: FeedbackPedroPayload):
    """T37: Registra divergência entre Pedro IA e Pedro real para calibragem do espelho."""
    historico: list = []
    if CALIBRAGEM_FILE.exists():
        try:
            historico = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
        except Exception:
            historico = []
    historico.append({
        "id": secrets.token_hex(6),
        "session_id": payload.session_id,
        "elemento": payload.elemento,
        "predicao_ia": payload.predicao_ia,
        "feedback_real": payload.feedback_real,
        "nota_acerto": max(0, min(5, payload.nota_acerto)),
        "created_at": datetime.now().isoformat(),
    })
    CALIBRAGEM_FILE.write_text(
        json.dumps(historico, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "total_registros": len(historico)}


@router.get("/calibragem_pedro")
async def ver_calibragem():
    """T37: Retorna histórico de calibragem e métricas de precisão do espelho."""
    if not CALIBRAGEM_FILE.exists():
        return {"registros": [], "media_acerto": None, "total": 0}
    try:
        historico = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
    except Exception:
        historico = []
    if not historico:
        return {"registros": [], "media_acerto": None, "total": 0}
    media = sum(r.get("nota_acerto", 0) for r in historico) / len(historico)
    return {"registros": historico, "media_acerto": round(media, 2), "total": len(historico)}
