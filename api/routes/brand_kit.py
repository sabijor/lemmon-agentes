"""PROD-7 — Brand Kit por cliente.

Endpoint pra clínica/agência salvar:
- logo (URL ou base64)
- paleta de cores
- fonte preferida
- tom-de-voz preset

Armazenado em historico/<tenant>/brand_kit.json.
Usado pelos agentes pra adaptar saída (Carlos vê paleta, Aya usa logo no PDF).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.deps import HISTORICO_DIR
from core import audit
from core.tenant import tenant_id

router = APIRouter()


class BrandKit(BaseModel):
    nome: str = "Cliente"
    tom_voz: str = "profissional, acolhedor"
    paleta_primaria: str = "#10b981"
    paleta_secundaria: str = "#1f2937"
    fonte_titulo: str = "Helvetica"
    fonte_corpo: str = "Helvetica"
    logo_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    publico_alvo: str = ""
    palavras_evitar: list[str] = Field(default_factory=list)
    palavras_preferir: list[str] = Field(default_factory=list)


def _brand_kit_path() -> Path:
    p = HISTORICO_DIR / tenant_id()
    p.mkdir(parents=True, exist_ok=True)
    return p / "brand_kit.json"


@router.get("/brand-kit")
async def obter_brand_kit() -> BrandKit:
    """Retorna brand kit do tenant atual. Default se não existe."""
    path = _brand_kit_path()
    if path.exists():
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            return BrandKit(**dados)
        except Exception:
            pass
    return BrandKit()


@router.put("/brand-kit")
async def salvar_brand_kit(kit: BrandKit) -> dict:
    """Salva/atualiza brand kit do tenant."""
    path = _brand_kit_path()
    path.write_text(kit.model_dump_json(indent=2), encoding="utf-8")
    audit.registrar("brand_kit_updated", campos=list(kit.model_dump().keys()))
    return {"ok": True, "tenant": tenant_id()}


@router.delete("/brand-kit")
async def resetar_brand_kit() -> dict:
    """Apaga o brand kit do tenant (volta ao default)."""
    path = _brand_kit_path()
    if path.exists():
        path.unlink()
        audit.registrar("brand_kit_reset")
    return {"ok": True}
