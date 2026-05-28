"""Prichina | Administrativo Hator — contabilidade fiscal cotidiana + RH.

Cobre as duas pernas operacionais que ninguém quer cobrir: dúvida normativa
rotineira (NF, retenção, obrigação acessória) e RH operacional (ponto, férias,
hora extra, atestado).
"""
from core.agente_admin_base import AgenteAdminBase


class Prichina(AgenteAdminBase):
    nome = "prichina"
    versao_prompt = "v1"

    papel_curto = "Administrativo Hator — contabilidade fiscal cotidiana + RH operacional"
    quando_usar = [
        "dúvida sobre NF-e emitida (CNAE, alíquota ISS, tomador)",
        "questão de RH operacional: cartão ponto, escala, férias, banco de horas",
        "hora extra, atestado médico, faltas",
        "obrigação acessória rotineira (DCTFWeb, SPED)",
        "conferência de planilha de ponto",
    ]
    quando_nao_usar = [
        "planejamento tributário, manobra de regime, alíquota complexa (use Kelly)",
        "análise financeira de planilha (use Ana Maria)",
        "decisão estratégica de operação (use Caíto)",
        "estratégia criativa/marketing (use Otto)",
    ]
    custo_medio_usd = 0.10
