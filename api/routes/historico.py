"""Rotas de histórico de sessões."""
import json

from fastapi import APIRouter, HTTPException

from api.deps import (
    HISTORICO_DIR,
)
from fastapi.responses import JSONResponse
from api.schemas import AvaliacaoPayload, FavoritarPayload, TagsPayload
from core.historico_index import atualizar_entrada, marcar_favorito, reconstruir
from core.similaridade import buscar_historico_similar

router = APIRouter()


@router.get("/historico")
async def listar_historico():
    """Lista sessões a partir do índice incremental (_index.json).

    Fallback para glob se o índice não existir (compatibilidade).
    """
    from core.historico_index import _ler_indice, INDEX_PATH

    if INDEX_PATH.exists():
        entradas = _ler_indice()
        # Índice está em ordem de inserção; retornar mais recentes primeiro
        return list(reversed(entradas))[:200]

    # Fallback: glob direto (índice ainda não criado)
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


@router.post("/favoritar")
async def favoritar(payload: FavoritarPayload):
    """Define o status favorito de uma sessão (idempotente)."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    marcar_favorito(payload.session_id, payload.favorito)
    return {"ok": True, "favorito": payload.favorito}


@router.post("/avaliar")
async def avaliar(payload: AvaliacaoPayload):
    """Deprecated em v1.30 — use POST /favoritar."""
    return JSONResponse(
        status_code=410,
        content={"detail": "Sistema de avaliação 1-5⭐ removido em v1.30. Use POST /favoritar."},
    )


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


@router.post("/admin/reconstruir_indice")
async def reconstruir_indice():
    """Reconstrói o _index.json do zero relendo todos os JSONs de sessão.

    Use quando suspeitar de inconsistência ou após mover/restaurar arquivos
    manualmente. Operação síncrona — pode levar alguns segundos em historicos
    grandes.
    """
    n = reconstruir()
    return {"ok": True, "entradas": n}
