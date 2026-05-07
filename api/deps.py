"""Dependências compartilhadas entre rotas e websockets do Lemmon API."""
import logging
import re

import anthropic as _anthropic
from anthropic import APIConnectionError, APIError, AuthenticationError, RateLimitError

from agentes.aya import Aya
from agentes.heitor import Heitor
from agentes.otto import Otto
from agentes.pedro_abrahao import PedroAbrahao
from agentes.renata import Renata
from agentes.salles import Salles
from agentes.sonia import Sonia
from core.agente_base import formatar_erro_anthropic
from core.config import (
    AYA_GERAR_HTML,
    AYA_GERAR_PDF,
    AYA_PDF_ENGINE,
    HISTORICO_DIR,
    OUTPUTS_DIR,
)
from core.config import (
    MODELO_PADRAO as LEMMON_MODELO_PADRAO,
)

_log = logging.getLogger("lemmon.api")
_anthropic_client = _anthropic.Anthropic()

SHARES_DIR = HISTORICO_DIR.parent / "shares"
SHARES_DIR.mkdir(exist_ok=True)

CALIBRAGEM_FILE = HISTORICO_DIR.parent / "calibragem_pedro.json"

AGENTE_ALIAS: dict[str, str] = {
    "otto": "otto",
    "heitor": "heitor",
    "salles": "salles",
    "sonia": "sonia",
    "aya": "aya",
    "pedro": "pedro_abrahao",
    "renata": "renata",
}


def _make_agent(name: str):
    mapping = {
        "otto": Otto,
        "heitor": Heitor,
        "salles": Salles,
        "sonia": Sonia,
        "aya": Aya,
        "pedro_abrahao": PedroAbrahao,
        "renata": Renata,
    }
    cls = mapping.get(name)
    return cls() if cls else None


def _parse_mentions(text: str, agents: list[str]) -> list[str]:
    mencionados: set[str] = set()
    for token, agent_id in AGENTE_ALIAS.items():
        if agent_id in agents and re.search(rf'@{re.escape(token)}\b', text, re.IGNORECASE):
            mencionados.add(agent_id)
    for a in agents:
        if re.search(rf'@{re.escape(a)}\b', text, re.IGNORECASE):
            mencionados.add(a)
    return list(mencionados)


__all__ = [
    "_log", "_anthropic_client",
    "SHARES_DIR", "CALIBRAGEM_FILE",
    "HISTORICO_DIR", "OUTPUTS_DIR",
    "AYA_GERAR_HTML", "AYA_GERAR_PDF", "AYA_PDF_ENGINE",
    "LEMMON_MODELO_PADRAO",
    "APIError", "APIConnectionError", "AuthenticationError", "RateLimitError",
    "formatar_erro_anthropic",
    "AGENTE_ALIAS", "_make_agent", "_parse_mentions",
    "Renata",
]
