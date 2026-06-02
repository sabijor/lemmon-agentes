"""PROD-8 — Multi-user com permissões básicas.

Armazena lista de usuários do tenant em historico/<tenant>/usuarios.json.
Cada user tem:
- email
- nome
- role: 'admin' | 'editor' | 'viewer'
- created_at

Em produção exige LEMMON_AUTH_TOKEN (cada user terá token próprio em iteração futura).
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from api.deps import HISTORICO_DIR
from api.security import auth_required  # v1.46.2 A3a-004 — proteger endpoints
from core import audit
from core.tenant import tenant_id

# v1.46.2 A3a-004 — todos os endpoints de /usuarios agora exigem auth.
# Antes GET expunha lista com token prefix de cada user (ataque por brute force
# em ambiente compartilhado). Em dev (LEMMON_AUTH_TOKEN vazia) auth_required
# pula automaticamente, então não quebra single-user local.
router = APIRouter(dependencies=[Depends(auth_required)])


Role = Literal["admin", "editor", "viewer"]


class Usuario(BaseModel):
    email: str  # EmailStr requer email-validator, mantemos str pra evitar dep
    nome: str
    role: Role = "viewer"
    token: str = ""  # gerado server-side
    created_at: str = ""


class NovoUsuarioPayload(BaseModel):
    email: str
    nome: str
    role: Role = "viewer"


def _usuarios_path() -> Path:
    p = HISTORICO_DIR / tenant_id()
    p.mkdir(parents=True, exist_ok=True)
    return p / "usuarios.json"


def _carregar() -> list[dict]:
    path = _usuarios_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _salvar(usuarios: list[dict]) -> None:
    _usuarios_path().write_text(
        json.dumps(usuarios, ensure_ascii=False, indent=2), encoding="utf-8"
    )


@router.get("/usuarios")
async def listar_usuarios():
    """Lista usuários do tenant (sem expor token completo — só prefix)."""
    usuarios = _carregar()
    return [
        {**u, "token": (u.get("token", "")[:8] + "..." if u.get("token") else "")}
        for u in usuarios
    ]


@router.post("/usuarios")
async def adicionar_usuario(payload: NovoUsuarioPayload):
    """Cria usuário. Gera token único de 32 chars hex."""
    usuarios = _carregar()
    if any(u["email"].lower() == payload.email.lower() for u in usuarios):
        raise HTTPException(status_code=409, detail="Email já cadastrado nesse tenant.")
    novo = Usuario(
        email=payload.email,
        nome=payload.nome,
        role=payload.role,
        token=secrets.token_hex(16),
        created_at=datetime.utcnow().isoformat() + "Z",
    )
    usuarios.append(novo.model_dump())
    _salvar(usuarios)
    audit.registrar("user_created", email=payload.email, role=payload.role)
    # Retorna token COMPLETO só uma vez (pra dar pro user — não armazenado em log)
    return {"ok": True, "token_inicial": novo.token, "role": novo.role}


@router.delete("/usuarios/{email}")
async def remover_usuario(email: str):
    usuarios = _carregar()
    antes = len(usuarios)
    usuarios = [u for u in usuarios if u["email"].lower() != email.lower()]
    if len(usuarios) == antes:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    _salvar(usuarios)
    audit.registrar("user_deleted", email=email)
    return {"ok": True}
