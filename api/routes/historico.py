"""Rotas de histórico de sessões."""
import json

from fastapi import APIRouter, HTTPException

from api.deps import HISTORICO_DIR, _anthropic_client, _log, formatar_erro_anthropic
from api.deps import APIError, APIConnectionError, AuthenticationError, RateLimitError
from api.schemas import AvaliacaoPayload, TagsPayload
from core.similaridade import buscar_historico_similar

router = APIRouter()


@router.get("/historico")
async def listar_historico():
    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        return []
    all_files = sorted(
        list(session_dir.glob("*_sessao.json")) + list(session_dir.glob("*_reuniao.json")),
        key=lambda p: p.stem,
        reverse=True,
    )[:200]
    sessions = []
    for path in all_files:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            sessions.append({
                "session_id": path.stem,
                "timestamp": dados.get("timestamp"),
                "briefing": dados.get("briefing", "")[:120],
                "agentes_usados": dados.get("agentes_usados", []),
                "custo_total_usd": dados.get("custo_total_usd", 0),
                "avaliacao": dados.get("avaliacao"),
                "origem": dados.get("origem", "dashboard"),
            })
        except Exception:
            pass
    return sessions


@router.get("/historico/similar")
async def historico_similar(briefing: str, n: int = 3):
    """Retorna as N sessões mais similares ao briefing."""
    resultados = buscar_historico_similar(briefing, HISTORICO_DIR, limite=max(1, min(n, 10)))
    return resultados


@router.get("/historico/{session_id}")
async def detalhe_historico(session_id: str):
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["session_id"] = session_id  # garante que o id vem do nome do arquivo (nunca null)
    return dados


@router.post("/avaliar")
async def avaliar(payload: AvaliacaoPayload):
    """Recebe avaliação da sessão e persiste no JSON já salvo."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["avaliacao"] = max(1, min(5, payload.nota))
    dados["observacoes_operador"] = payload.observacoes
    dados["tags"] = payload.tags
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@router.post("/tags")
async def salvar_tags(payload: TagsPayload):
    """Persiste tags aceitas pelo operador, sem exigir avaliação."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["tags"] = payload.tags
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}
