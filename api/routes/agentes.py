"""Rota /agentes/catalogo — lista agentes com metadados pro auto-roteador (T139).

A IA do /sugerir_pipeline lê este catálogo pra decidir, sem código hardcoded,
quais agentes acionar dado um briefing. O front também consome pra mostrar
agrupado por categoria e auto-marcar pills.
"""
from fastapi import APIRouter

from agentes.aya import Aya
from agentes.heitor import Heitor
from agentes.otto import Otto
from agentes.pedro_abrahao import PedroAbrahao
from agentes.renata import Renata
from agentes.salles import Salles
from agentes.sonia import Sonia

router = APIRouter()

# Lista de fábricas. Pra adicionar agente novo: 1 linha aqui + classe com metadados.
# (Não instanciar aqui no module-level — exige ANTHROPIC_API_KEY mesmo só pra listar.)
_FABRICAS = [
    ("otto",          Otto),
    ("heitor",        Heitor),
    ("salles",        Salles),
    ("sonia",         Sonia),
    ("aya",           Aya),
    ("renata",        Renata),
    ("pedro_abrahao", PedroAbrahao),
]


def _metadados_de_classe(cls) -> dict:
    """Lê metadados sem instanciar (evita custo de carregar prompt + Anthropic client)."""
    return {
        "papel_curto":      getattr(cls, "papel_curto", ""),
        "quando_usar":      list(getattr(cls, "quando_usar", []) or []),
        "quando_nao_usar":  list(getattr(cls, "quando_nao_usar", []) or []),
        "categoria":        getattr(cls, "categoria", "outros"),
        "custo_medio_usd":  float(getattr(cls, "custo_medio_usd", 0.10)),
    }


def _metadados_pedro() -> dict:
    """Pedro é instância de EspelhoCliente — atributos só existem após __init__.
    Pra evitar instanciar (que carrega material + valida API key), hardcoded
    espelha o que está em agentes/pedro_abrahao.py."""
    return {
        "papel_curto": "Espelho do Dr. Pedro Abrahão (Hator Clinic — saúde estética orofacial)",
        "quando_usar": [
            "conteúdo do nicho de saúde estética / orofacial / harmonização facial",
            "validar voz, tom e ângulo do Pedro antes de mandar pro cliente real",
            "feedback prévio de roteiro/copy do Pedro",
            "qualquer pedido que cita Hator, Pedro Abrahão ou clínica do Pedro",
        ],
        "quando_nao_usar": [
            "briefing pra outro cliente (não Hator)",
            "validação genérica sem alvo de cliente específico",
        ],
        "categoria": "espelho_cliente",
        "custo_medio_usd": 0.08,
    }


def construir_catalogo() -> list[dict]:
    """Retorna lista de agentes com metadados. Pública pra outros módulos
    (ex: /sugerir_pipeline) consumirem."""
    catalogo = []
    for nome, fab in _FABRICAS:
        if nome == "pedro_abrahao":
            meta = _metadados_pedro()
        else:
            meta = _metadados_de_classe(fab)
        catalogo.append({"id": nome, **meta})
    return catalogo


@router.get("/agentes/catalogo")
async def catalogo():
    """Lista todos os agentes disponíveis com metadados pra auto-roteador e UI."""
    return {"agentes": construir_catalogo()}
