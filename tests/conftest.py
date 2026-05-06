"""Fixtures e helpers compartilhados para os smoke tests do sistema Lemmon."""
import os
from unittest.mock import MagicMock, Mock

# Garante que a variável de ambiente existe antes de qualquer import de agente
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake-key-for-testing")


def _make_usage(input_tokens=100, output_tokens=200):
    """Cria um mock de usage da API Anthropic."""
    usage = Mock()
    usage.input_tokens = input_tokens
    usage.output_tokens = output_tokens
    server_tool_mock = Mock()
    server_tool_mock.web_search_requests = 0
    usage.server_tool_use = server_tool_mock
    return usage


def _make_text_response(text="output fake"):
    """Cria uma response fake com conteúdo text."""
    response = Mock()
    block = Mock()
    block.type = "text"
    block.text = text
    response.content = [block]
    response.usage = _make_usage()
    response.stop_reason = "end_turn"
    return response


def _make_tool_response(tool_name, tool_input):
    """Cria uma response fake com tool_use block."""
    response = Mock()
    block = Mock()
    block.type = "tool_use"
    block.name = tool_name
    block.input = tool_input
    response.content = [block]
    response.usage = _make_usage()
    response.stop_reason = "tool_use"
    return response


def _make_mock_client(responses):
    """
    Cria um mock de client Anthropic com side_effect definido.
    Cada chamada a messages.create retorna o próximo item da lista.
    """
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = list(responses)
    return mock_client


# ── Responses pré-definidas por agente ───────────────────────────────────────

# Schema completo do Otto que o Salles/Heitor/Sônia precisam para discussão
ANALISE_OTTO_FAKE = {
    "output_humano": "Análise estratégica fake do Otto.",
    "metadata": {"modo_recomendado": "completo", "complexidade_briefing": "media"},
    "leitura_estrategica": {
        "o_que_cliente_pediu": "Divulgar tratamento",
        "o_que_cliente_nao_disse": "Confiança",
        "conflito_central": "Preço vs. qualidade",
        "inseguranca_do_cliente": "Será que funciona?",
        "armadilha_do_obvio": "Mostrar resultado",
    },
    "tese_criativa": {
        "frase_tese": "Tese fake para testes.",
        "principio_norteador": "Princípio fake.",
        "ruptura_proposta": "Ruptura fake.",
    },
    "conceito": {
        "titulo": "Conceito Fake",
        "descricao": "Descrição fake.",
        "papel_da_marca": "Papel fake.",
    },
    "mecanismo_estrategico": {
        "por_que_funciona": ["Motivo 1", "Motivo 2", "Motivo 3"],
    },
    "traducao_pratica": {
        "estrutura_episodio": ["Bloco 1", "Bloco 2"],
        "direcao_criativa": ["Direção 1"],
        "sistema_conteudo": "Sistema fake.",
    },
    "objetivo_real": "Objetivo fake.",
}


def otto_responses():
    """1 chamada: tool_use registrar_analise_estrategica."""
    return [
        _make_tool_response("registrar_analise_estrategica", ANALISE_OTTO_FAKE),
    ]


def heitor_responses():
    """
    3 chamadas:
    1. text (análise livre)
    2. tool_use registrar_analise_compliance
    3. tool_use formatar_analise_heitor
    """
    return [
        _make_text_response("Análise de compliance fake. Nicho: saúde. Verde em geral."),
        _make_tool_response("registrar_analise_compliance", {
            "nicho_identificado": "saude",
            "risco_geral": "verde",
            "termos_permitidos": [],
            "termos_proibidos": [],
            "termos_com_contexto": [],
            "termos_evitar": [],
            "termos_permitidos_com_contexto": [],
            "fontes_consultadas_estruturadas": [],
            "diretrizes_para_salles": [],
        }),
        _make_tool_response("formatar_analise_heitor", {
            "output_humano": "Análise formatada fake do Heitor.",
        }),
    ]


def salles_responses():
    """
    4 chamadas (com analise_otto_existente — sem chamar Otto interno):
    1. tool_use questionar_estrategista
    2. tool_use responder_roteirista
    3. tool_use produzir_roteiro_lemmon
    4. tool_use formatar_roteiro_humano
    """
    return [
        _make_tool_response("questionar_estrategista", {
            "concordancia_tese": "Concordo com a tese fake.",
            "viabilidade_tecnica": "Viável tecnicamente.",
            "foco_narrativo": "Foco no cliente.",
        }),
        _make_tool_response("responder_roteirista", {
            "resposta_concordancia": "Obrigado pelo questionamento.",
            "resposta_viabilidade": "Confirmado.",
            "resposta_foco": "Tese fake para testes.",
            "tese_ajustada": "Tese fake para testes.",
        }),
        _make_tool_response("produzir_roteiro_lemmon", {
            "output_humano": "Roteiro técnico fake.",
            "formato_aplicado": "reels_vertical",
            "titulo_roteiro": "Roteiro Fake",
            "blocos": [],
            "notas_estrategicas": {},
        }),
        _make_tool_response("formatar_roteiro_humano", {
            "output_humano": "Roteiro formatado fake do Salles.",
            "formato_aplicado": "reels_vertical",
        }),
    ]


def sonia_responses():
    """
    3 chamadas:
    1. text (análise performance)
    2. tool_use registrar_plano_performance
    3. tool_use formatar_plano_sonia
    """
    return [
        _make_text_response("Análise de performance fake. Nota: 7/10. Cortes recomendados: 2."),
        _make_tool_response("registrar_plano_performance", {
            "nota_master": 7,
            "dimensao_dominante": "autenticidade",
            "pontos_fortes": [],
            "pontos_fracos": [],
            "versao_otimizada_master": "Versão otimizada fake.",
            "cortes_autonomos": [],
            "analise_consolidada": {"comentario": "Análise fake consolidada."},
            "fontes_consultadas": [],
        }),
        _make_tool_response("formatar_plano_sonia", {
            "output_humano": "Plano de performance formatado fake da Sonia.",
        }),
    ]


def aya_responses():
    """1 chamada: tool_use compilar_resumos_lemmon."""
    return [
        _make_tool_response("compilar_resumos_lemmon", {
            "card_otto": {"presente": True, "resumo": "Tese: Tese fake."},
            "card_heitor": {"presente": False, "resumo": ""},
            "card_salles": {"presente": False, "resumo": ""},
            "card_sonia": {"presente": False, "resumo": ""},
        }),
    ]


def pedro_responses():
    """1 chamada: text response."""
    return [
        _make_text_response("Resposta fake do Pedro Abrahão. Alta confiança."),
    ]
