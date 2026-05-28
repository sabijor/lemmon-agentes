"""Caíto | COO/Conselheiro Hator — visão estratégica que cruza áreas.

O Otto do administrativo. Recebe pergunta ampla (saúde da clínica, decisão
de expansão, reclamação grave) e responde cruzando financeiro, RH e operação.
Sempre devolve com 3 caminhos + recomendação, não decisão única.
"""
from core.agente_admin_base import AgenteAdminBase


class Caito(AgenteAdminBase):
    nome = "caito"
    versao_prompt = "v1"

    papel_curto = "COO Hator — visão estratégica de operação que cruza financeiro, RH e processos"
    quando_usar = [
        "pergunta ampla sobre saúde da clínica ou tomada de decisão",
        "decisão de contratação, expansão, lançamento de protocolo",
        "reclamação de paciente, gestão de crise operacional",
        "quando o pedido cruza 2+ áreas (financeiro + RH, financeiro + atendimento, etc.)",
        "'visão geral', 'o que está acontecendo', 'o que prioriza'",
    ]
    quando_nao_usar = [
        "pergunta cirúrgica sobre 1 área isolada (delegue a quem tem o conhecimento direto)",
        "estratégia de conteúdo de marketing (use Otto da Lemmon)",
        "criação de roteiro, calendário editorial (use Salles/Carlos/Renata)",
    ]
    custo_medio_usd = 0.12
