"""v1.46.1 #12 — Gera nome bonito de projeto a partir do briefing via Haiku.

Antes: o nome era o briefing literal truncado em snake_case
("Funil_de_retargeting_em_cascata_5_estágios_para_implante_hor"),
o que ficava amador na capa do PDF.

Agora: chama Haiku (~$0.0005 por call) pra gerar um título profissional curto
("Funil Implante Hormonal — Hator"). Cacheado por hash do briefing pra não
repetir Haiku se o cliente rodar 2x o mesmo briefing.

Fallback se Haiku falhar (sem chave, rate limit, etc): cleanup leve do briefing
(primeira frase, sem snake_case).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from core.config import HISTORICO_DIR

_log = logging.getLogger("lemmon.nomeador")

_CACHE_FILE = HISTORICO_DIR / "_nomes_cache.json"


def _carregar_cache() -> dict[str, str]:
    if not _CACHE_FILE.exists():
        return {}
    try:
        return json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _salvar_cache(cache: dict[str, str]) -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        _log.warning("Falha ao salvar cache de nomes: %s", exc)


def _fallback_nome(briefing: str) -> str:
    """Fallback se Haiku não estiver disponível."""
    # Primeira frase ou primeiras 50 chars + tenta extrair tema central
    primeira = re.split(r"[.!?\n]", briefing.strip(), maxsplit=1)[0]
    primeira = primeira.strip()
    if len(primeira) > 60:
        primeira = primeira[:57] + "..."
    return primeira or "Projeto sem nome"


def gerar_nome_projeto(briefing: str, cliente: Optional[str] = None) -> str:
    """Retorna nome profissional curto pro título do dossiê.

    Args:
        briefing: texto do briefing original do user.
        cliente: nome do cliente (ex: "Hator") pra incluir no título quando faz sentido.

    Returns:
        String tipo "Funil Implante Hormonal — Hator" (max ~60 chars).
        Se Haiku falhar, retorna fallback baseado na primeira frase.
    """
    if not briefing or not briefing.strip():
        return "Projeto sem nome"

    # Cache: hash do briefing
    cache_key = hashlib.sha256(briefing.encode("utf-8")).hexdigest()[:16]
    cache = _carregar_cache()
    if cache_key in cache:
        _log.debug("Nome do projeto cacheado: %s", cache[cache_key])
        return cache[cache_key]

    # Sem ANTHROPIC_API_KEY → fallback
    if not os.getenv("ANTHROPIC_API_KEY"):
        return _fallback_nome(briefing)

    try:
        # Lazy import pra não pesar startup
        from api.deps import _anthropic_client
        sufixo_cliente = f" — {cliente}" if cliente else ""
        prompt_user = (
            f"Gere UM título curto e profissional pra esse projeto de marketing.\n\n"
            f"Regras:\n"
            f"- Máximo 50 caracteres\n"
            f"- Sem aspas, sem markdown\n"
            f"- Tom executivo (não criativo demais)\n"
            f"- Pode incluir o cliente no final ('— {cliente or 'Cliente'}') quando ajudar a identificar\n\n"
            f"Exemplos bons:\n"
            f"- 'Funil Implante Hormonal — Hator'\n"
            f"- 'Reels Menopausa Q3'\n"
            f"- 'Ad Pago Lipedema'\n"
            f"- 'Calendário Editorial Setembro'\n\n"
            f"Briefing:\n{briefing[:800]}\n\n"
            f"Responda APENAS o título, sem mais nada."
        )
        resp = _anthropic_client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=80,
            messages=[{"role": "user", "content": prompt_user}],
        )
        texto = next((b.text for b in resp.content if hasattr(b, "text")), "").strip()
        # Limpa eventuais aspas, markdown, etc
        texto = texto.strip().strip('"').strip("'").strip("*").strip("#").strip()
        if not texto or len(texto) > 80:
            texto = _fallback_nome(briefing)

        # Cacheia (sem await — não bloqueia)
        cache[cache_key] = texto
        _salvar_cache(cache)
        return texto

    except Exception as exc:
        _log.warning("Haiku falhou ao nomear projeto, usando fallback: %s", exc)
        return _fallback_nome(briefing)
