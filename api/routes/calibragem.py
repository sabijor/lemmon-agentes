"""Rotas T37 — calibragem espelho Pedro IA × real."""
import json
import secrets
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

from api.deps import CALIBRAGEM_FILE, HISTORICO_DIR
from api.schemas import FeedbackPedroPayload
from core.tenant import tenant_id

router = APIRouter()


def _calibragem_path() -> Path:
    """v1.51 multi-tenant — calibragem em historico/<tenant>/calibragem.json.

    Antes: arquivo global `calibragem_pedro.json` no root do projeto. Multi-cliente
    misturava feedback do Pedro Abrahão (Hator) com feedback do espelho de
    outro cliente — pollute de treino.

    Compat: pra tenant=default/hator com arquivo legacy ainda no root,
    migra ele pro novo path na primeira chamada.
    """
    t = tenant_id()
    novo = HISTORICO_DIR / t / "calibragem.json"
    novo.parent.mkdir(parents=True, exist_ok=True)
    if not novo.exists() and t in ("default", "hator") and CALIBRAGEM_FILE.exists():
        # Migra arquivo legacy (1x).
        novo.write_text(CALIBRAGEM_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    return novo


@router.post("/calibragem_pedro")
async def registrar_calibragem(payload: FeedbackPedroPayload):
    """T37: Registra divergência entre Pedro IA e Pedro real para calibragem.

    A-15 + V-17 — lock atômico via filelock pra evitar race em writes paralelas.
    v1.51 — particionado por tenant (treino Pedro Hator não polui outros clientes).
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
    arquivo = _calibragem_path()
    # A-15 — lock no arquivo durante read-modify-write
    from core.historico_index import _file_lock
    # Cria arquivo vazio se não existir (idempotente)
    if not arquivo.exists():
        arquivo.write_text("[]", encoding="utf-8")

    # Custom write-modify (a func atomic só lida com dict, não list)
    with _file_lock(arquivo):
        try:
            dados = json.loads(arquivo.read_text(encoding="utf-8"))
            if not isinstance(dados, list):
                dados = []
        except Exception:
            dados = []
        dados.append(novo_registro)
        tmp = arquivo.with_suffix(arquivo.suffix + ".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        import os as _os
        _os.replace(tmp, arquivo)
    return {"ok": True, "id": novo_registro["id"], "total": len(dados)}


@router.get("/calibragem_pedro")
async def ver_calibragem():
    """T37: Retorna histórico de calibragem e métricas de precisão do espelho."""
    arquivo = _calibragem_path()
    if not arquivo.exists():
        return {"registros": [], "media_acerto": None, "total": 0}
    try:
        historico = json.loads(arquivo.read_text(encoding="utf-8"))
    except Exception:
        historico = []
    if not historico:
        return {"registros": [], "media_acerto": None, "total": 0}
    media = sum(r.get("nota_acerto", 0) for r in historico) / len(historico)
    return {"registros": historico, "media_acerto": round(media, 2), "total": len(historico)}
