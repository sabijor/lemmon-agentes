"""Kelly | Contadora-Tributária Hator — mestre dos impostos e manobras legais.

Domina o regime de Lucro Presumido da Hator. Sabe que serviço médico-hospitalar
com estrutura cirúrgica/laboratorial usa presunção reduzida (8% IRPJ, 12% CSLL)
pela Lei 9.249/95. Conhece manobras legais (elisão) e nunca recomenda evasão.
"""
from core.agente_admin_base import AgenteAdminBase


class Kelly(AgenteAdminBase):
    nome = "kelly"
    versao_prompt = "v1"

    papel_curto = "Contadora-tributária Hator — IRPJ/CSLL/PIS/COFINS/ISS no Lucro Presumido"
    quando_usar = [
        "alíquota específica de tributo (IRPJ, CSLL, PIS, COFINS, ISS)",
        "planejamento tributário, manobra de regime, otimização legal",
        "dúvida sobre presunção reduzida (8%/12%) pra atividade médico-hospitalar",
        "retenção tributária em nota tomada/emitida",
        "pró-labore vs distribuição de lucros",
        "cálculo de carga tributária projetada",
    ]
    quando_nao_usar = [
        "rotina administrativa (NF do dia, ponto, férias — use Prichina)",
        "análise de planilha de fluxo de caixa (use Ana Maria)",
        "decisão executiva que cruza áreas (use Caíto)",
    ]
    custo_medio_usd = 0.10
