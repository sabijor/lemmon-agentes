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
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.deps import HISTORICO_DIR
from core import audit
from core.tenant import tenant_id

router = APIRouter()


# v1.49 QA-B15 — rejeita HTML tags em campos de texto livre do brand kit.
# Defesa em profundidade: backend não precisa do HTML, e se o brand_kit
# algum dia for renderizado em PDF/HTML (Aya), pode disparar XSS.
# Antes: PUT /brand-kit aceitava `<script>` no campo nome sem sanitize.
_TEM_TAG_HTML = re.compile(r"[<>]")


def _sem_tags_html(valor: str) -> str:
    if isinstance(valor, str) and _TEM_TAG_HTML.search(valor):
        raise ValueError("Caracteres < e > não são permitidos (defesa contra XSS).")
    return valor


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

    # v1.48 A1b-006 — Concierge tenant-aware
    # Permite Concierge funcionar pra 2+ clientes sem hardcode.
    # nicho: descrição curta do segmento (ex: "saúde feminina, menopausa, estética orofacial")
    # tipo_negocio: "clínica médica" | "agência" | "loja" | "startup" | etc — orienta tom
    # espelho_id: ID do agente espelho/validador específico do cliente (ex: "pedro_abrahao")
    # triggers_espelho: termos que disparam inclusão obrigatória do espelho
    nicho: str = ""
    tipo_negocio: str = ""
    espelho_id: Optional[str] = None
    triggers_espelho: list[str] = Field(default_factory=list)

    # v1.49 QA-B15 — sanitiza campos texto livre contra HTML tags.
    # logo_url, instagram_handle, paleta_* não precisam (formato fixo/URL).
    @field_validator(
        "nome", "tom_voz", "publico_alvo", "nicho", "tipo_negocio",
        "fonte_titulo", "fonte_corpo",
    )
    @classmethod
    def _validar_sem_tags(cls, v: str) -> str:
        return _sem_tags_html(v)


def _brand_kit_path() -> Path:
    p = HISTORICO_DIR / tenant_id()
    p.mkdir(parents=True, exist_ok=True)
    return p / "brand_kit.json"


@router.get("/brand-kit")
async def obter_brand_kit() -> BrandKit:
    """Retorna brand kit do tenant atual. Default se não existe.

    v1.48 A3a-003 — agora usa ler_json_cifrado (decifra se LEMMON_ENCRYPT_KEY).
    Brand kit tem dados que cliente considera competitivamente sensíveis (público-alvo,
    palavras-chave, voz). Cifra-at-rest protege se disco vazar.
    """
    from core.criptojson import ler_json_cifrado
    path = _brand_kit_path()
    dados = ler_json_cifrado(path, default=None)
    if dados:
        try:
            return BrandKit(**dados)
        except Exception:
            pass
    return BrandKit()


@router.put("/brand-kit")
async def salvar_brand_kit(kit: BrandKit) -> dict:
    """Salva/atualiza brand kit do tenant.

    v1.48 A3a-003 — cifra com Fernet se LEMMON_ENCRYPT_KEY setada.
    """
    from core.criptojson import escrever_json_cifrado
    path = _brand_kit_path()
    escrever_json_cifrado(path, kit.model_dump(mode="json"))
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
