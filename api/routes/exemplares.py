"""Rotas CRUD de exemplares de agentes."""
from fastapi import APIRouter, HTTPException

from api.schemas import ExemplarPayload
from core.exemplares import carregar_exemplares, remover_exemplar, salvar_exemplar

router = APIRouter()


@router.post("/exemplares")
async def criar_exemplar(payload: ExemplarPayload):
    entrada = salvar_exemplar(payload.agente, payload.trecho, payload.contexto, payload.session_id)
    return {"ok": True, "exemplar": entrada}


@router.get("/exemplares/{agente}")
async def listar_exemplares(agente: str):
    return carregar_exemplares(agente)


@router.delete("/exemplares/{agente}/{exemplar_id}")
async def deletar_exemplar(agente: str, exemplar_id: str):
    ok = remover_exemplar(agente, exemplar_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Exemplar não encontrado")
    return {"ok": True}
