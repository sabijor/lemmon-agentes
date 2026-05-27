"""Rotas de histórico de sessões."""
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from api.deps import (
    HISTORICO_DIR,
)
from fastapi.responses import JSONResponse
from api.schemas import AvaliacaoPayload, FavoritarPayload, TagsPayload
from core.historico_index import _update_json_atomic, atualizar_entrada, marcar_favorito, reconstruir
from core.similaridade import buscar_historico_similar

router = APIRouter()

# T129 — formato dos session_ids reais: yyyyMMdd_HHmmss(_sessao|_reuniao)?
# Validação anti path-traversal: rejeita qualquer coisa fora desse formato.
_SESSION_ID_RE = re.compile(r"^[0-9]{8}_[0-9]{6}(_sessao|_reuniao)?$")


def _path_da_sessao(session_id: str) -> Path:
    """Valida session_id e retorna o Path. Levanta HTTPException 400 se inválido.

    Defesa em profundidade: além do regex, confirma que o path resolvido continua
    dentro do diretório de sessões (proteção contra qualquer bypass do regex).
    """
    if not _SESSION_ID_RE.match(session_id):
        raise HTTPException(status_code=400, detail="session_id inválido")
    session_dir = (HISTORICO_DIR / "dashboard").resolve()
    path = (session_dir / f"{session_id}.json").resolve()
    try:
        path.relative_to(session_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="session_id inválido")
    return path


@router.get("/historico")
async def listar_historico(incluir_sandbox: bool = Query(False)):
    """Lista sessões a partir do índice incremental (_index.json).

    Por padrão exclui sessões com origem='sandbox'. Use ?incluir_sandbox=1 para vê-las.
    Fallback para glob se o índice não existir (compatibilidade).
    """
    from core.historico_index import _ler_indice, INDEX_PATH

    if INDEX_PATH.exists():
        entradas = _ler_indice()
        if not incluir_sandbox:
            entradas = [e for e in entradas if e.get("origem") != "sandbox"]
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
            origem = dados.get("origem", "dashboard")
            if not incluir_sandbox and origem == "sandbox":
                continue
            sessions.append({
                "session_id": path.stem,
                "timestamp": dados.get("timestamp"),
                "briefing": dados.get("briefing", "")[:120],
                "agentes_usados": dados.get("agentes_usados", []),
                "custo_total_usd": dados.get("custo_total_usd", 0),
                "avaliacao": dados.get("avaliacao"),
                "favorito": dados.get("favorito", False),
                "origem": origem,
                "tags": dados.get("tags", []),
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
    path = _path_da_sessao(session_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["session_id"] = session_id  # garante que o id vem do nome do arquivo (nunca null)
    return dados


@router.post("/favoritar")
async def favoritar(payload: FavoritarPayload):
    """Define o status favorito de uma sessão (idempotente)."""
    path = _path_da_sessao(payload.session_id)
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
    """Persiste tags aceitas pelo operador, sem exigir avaliação.

    T130: usa _update_json_atomic (flock + rename) — convive bem com requests
    simultâneas em /favoritar sem perder nenhuma das escritas.
    """
    path = _path_da_sessao(payload.session_id)
    ok = _update_json_atomic(path, lambda d: d.update({"tags": payload.tags}))
    if not ok:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
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
