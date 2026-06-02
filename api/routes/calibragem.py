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
    """T37: Registra divergência entre Pedro IA e Pedro real para calibragem.

    A-15 + V-17 — lock atômico via filelock pra evitar race em writes paralelas.
    """
    novo_registro = {
        "id": secrets.token_hex(16),  # V-16 — antes era 12 chars (24 bits brute-forçável)
        "session_id": payload.session_id,
        "elemento": payload.elemento,
        "predicao_ia": payload.predicao_ia,
        "feedback_real": payload.feedback_real,
        "nota_acerto": max(0, min(5, payload.nota_acerto)),
        "created_at": datetime.now().isoformat(),
    }
    # A-15 — lock no arquivo durante read-modify-write
    from core.historico_index import _update_json_atomic, _file_lock
    # Cria arquivo vazio se não existir (idempotente)
    if not CALIBRAGEM_FILE.exists():
        CALIBRAGEM_FILE.write_text("[]", encoding="utf-8")

    def aplicar(dados):
        if not isinstance(dados, list):
            dados.clear() if hasattr(dados, 'clear') else None
            return [novo_registro]
        dados.append(novo_registro)
        return dados

    # Custom write-modify (a func atomic só lida com dict, não list)
    with _file_lock(CALIBRAGEM_FILE):
        try:
            dados = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
            if not isinstance(dados, list):
                dados = []
        except Exception:
            dados = []
        dados.append(novo_registro)
        tmp = CALIBRAGEM_FILE.with_suffix(CALIBRAGEM_FILE.suffix + ".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        import os as _os
        _os.replace(tmp, CALIBRAGEM_FILE)
    return {"ok": True, "id": novo_registro["id"], "total": len(dados)}


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
