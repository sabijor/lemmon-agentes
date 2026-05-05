"""Protocolo de discussão estruturada entre agentes."""
from typing import Dict, Optional

DIMENSOES_DISCUSSAO = [
    "concordancia_tese",
    "viabilidade_tecnica",
    "foco_narrativo"
]

def construir_prompt_questionamento(analise_otto: Dict, briefing: str,
                                     formato: str) -> str:
    return f"""Você recebeu a análise do Otto sobre este briefing:

BRIEFING:
{briefing}

ANÁLISE OTTO:
- Tese: {analise_otto['tese_criativa']['frase_tese']}
- Conceito: {analise_otto['conceito']['titulo']}
- Estrutura proposta: {analise_otto['traducao_pratica']['estrutura_episodio']}
- Sistema de conteúdo: {analise_otto['traducao_pratica']['sistema_conteudo']}

FORMATO SOLICITADO PRA ESTE ROTEIRO: {formato}

Antes de produzir o roteiro, questione o Otto nas 3 dimensões obrigatórias:

1. CONCORDÂNCIA DE TESE: Você concorda com a tese do Otto pra ESSE FORMATO \
ESPECÍFICO? Se não, propõe ajuste e justifique.

2. VIABILIDADE TÉCNICA: A estrutura proposta é filmável dentro do formato \
solicitado? Existem riscos práticos (tempo, espaço, número de takes)?

3. FOCO NARRATIVO: Qual é a UMA coisa que precisa sair na fala do entrevistado \
pra esse roteiro funcionar? (Não pode ser duas ou três — uma só.)

Use a ferramenta `questionar_estrategista` pra registrar suas observações.
"""

def construir_prompt_resposta_otto(questionamentos: Dict, analise_original: Dict,
                                    briefing: str) -> str:
    return f"""Você é o Otto, autor desta análise estratégica original.

BRIEFING ORIGINAL QUE VOCÊ ANALISOU:
{briefing}

SUA ANÁLISE ORIGINAL:
- Tese: {analise_original['tese_criativa']['frase_tese']}
- Conceito: {analise_original['conceito']['titulo']}
- Princípio: {analise_original['tese_criativa']['principio_norteador']}
- Mecanismo: {analise_original['mecanismo_estrategico']['por_que_funciona']}

O Salles | Roteirista questionou sua análise nas 3 dimensões:

CONCORDÂNCIA DE TESE:
{questionamentos.get('concordancia_tese', 'Sem questionamento')}

VIABILIDADE TÉCNICA:
{questionamentos.get('viabilidade_tecnica', 'Sem questionamento')}

FOCO NARRATIVO PROPOSTO POR SALLES:
{questionamentos.get('foco_narrativo', 'Sem proposta')}

Responda como AUTOR ORIGINAL desta análise — defendendo, ajustando ou \
concordando com cada ponto. Você tem autoridade pra:
- DEFENDER sua posição original (com justificativa estratégica)
- AJUSTAR a tese/conceito baseado no questionamento (com justificativa)
- CONCORDAR integralmente com a proposta do Salles

Não se anule — você é o estrategista. Mas também não seja teimoso por orgulho.

Use a ferramenta `responder_roteirista`.
"""

def construir_prompt_rodada_extra(resultado_anterior: Dict, ponto_a_discutir: str) -> str:
    return f"""Já houve uma rodada de discussão entre você (Salles) e o Otto sobre \
este projeto. Resumo do que foi discutido:

QUESTIONAMENTOS ANTERIORES:
- Concordância: {resultado_anterior['discussao_otto_salles']['questionamentos_salles']['concordancia_tese']}
- Viabilidade: {resultado_anterior['discussao_otto_salles']['questionamentos_salles']['viabilidade_tecnica']}
- Foco: {resultado_anterior['discussao_otto_salles']['questionamentos_salles']['foco_narrativo']}

RESPOSTAS DO OTTO:
- Concordância: {resultado_anterior['discussao_otto_salles']['respostas_otto']['resposta_concordancia']}
- Viabilidade: {resultado_anterior['discussao_otto_salles']['respostas_otto']['resposta_viabilidade']}
- Foco: {resultado_anterior['discussao_otto_salles']['respostas_otto']['resposta_foco']}
- Tese final: {resultado_anterior['discussao_otto_salles']['respostas_otto']['tese_ajustada']}

O OPERADOR (Calebe) PEDIU UMA RODADA EXTRA SOBRE:
{ponto_a_discutir}

Use a ferramenta `questionar_estrategista` pra registrar seu novo \
questionamento focado neste ponto específico.
"""
