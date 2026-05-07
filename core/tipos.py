"""Tipos compartilhados entre os agentes Lemmon."""
from typing import TypedDict


class AgenteResultado(TypedDict, total=False):
    # Campos BASE obrigatórios — todos os agentes devem retornar estes 4
    output_humano: str
    output_tecnico: dict
    custo_total_usd: float
    duracao_segundos: float
    # Campos extras comuns (opcionais pelo TypedDict)
    modelo_usado: str
    versao_prompt: str
    tags: list
    fontes_consultadas: list
    custo_total_brl_estimado: float
    breakdown_custo: dict
    cancelado: bool
    motivo: str
