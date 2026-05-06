"""
Smoke tests para os 6 agentes do sistema Lemmon.

Usa mocks do Anthropic para evitar chamadas reais à API.
Verifica apenas que o contrato de saída (output_humano + custo_total_usd) é respeitado.

Estratégia de mock:
- patch("core.agente_base.Anthropic") intercepta a criação do client em AgenteBase.__init__
- Cada teste usa side_effect com lista de respostas correspondente ao número de chamadas
"""
import os
from unittest.mock import patch

# Garante ANTHROPIC_API_KEY antes de qualquer import de agente
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake-key-for-testing")

from tests.conftest import (
    ANALISE_OTTO_FAKE,
    _make_mock_client,
    aya_responses,
    heitor_responses,
    otto_responses,
    pedro_responses,
    salles_responses,
    sonia_responses,
)

# ── Helpers ──────────────────────────────────────────────────────────────────

BRIEFING_MINIMO = (
    "Cliente: Clínica de estética. "
    "Objetivo: divulgar tratamento de pele no Instagram. "
    "Público: mulheres 30-50 anos, classe B/C. "
    "Tom: elegante, acessível."
)

ROTEIRO_MINIMO = "ROTEIRO FAKE PARA TESTE. " * 8  # ~200 chars, acima do mínimo de 100


def _assert_contrato(resultado: dict):
    """Verifica o contrato mínimo de saída de qualquer agente."""
    assert isinstance(resultado, dict), "Resultado deve ser um dict"
    assert "output_humano" in resultado, "Falta 'output_humano' no resultado"
    assert isinstance(resultado["output_humano"], str), "'output_humano' deve ser str"
    assert len(resultado["output_humano"]) > 0, "'output_humano' não pode ser vazio"
    assert "custo_total_usd" in resultado, "Falta 'custo_total_usd' no resultado"
    assert isinstance(resultado["custo_total_usd"], float), "'custo_total_usd' deve ser float"


# ── Testes ───────────────────────────────────────────────────────────────────

def test_otto_smoke():
    """Otto: 1 chamada, retorna análise estratégica com tool_use."""
    mock_client = _make_mock_client(otto_responses())

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.otto import Otto
        agente = Otto()
        resultado = agente.executar(BRIEFING_MINIMO)

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 1


def test_heitor_smoke():
    """Heitor modo solo: 3 chamadas (análise + estruturação + formatação)."""
    mock_client = _make_mock_client(heitor_responses())

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.heitor import Heitor
        agente = Heitor()
        resultado = agente.executar(
            conteudo=BRIEFING_MINIMO,
            modo="solo",
            modo_saida="analise",
            max_buscas=1,
        )

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 3


def test_salles_smoke():
    """
    Salles com analise_otto_existente: 4 chamadas
    (questionar + responder + roteiro + formatação).
    """
    mock_client = _make_mock_client(salles_responses())

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.salles import Salles
        agente = Salles()
        resultado = agente.executar(
            analise_otto_existente=ANALISE_OTTO_FAKE,
            briefing=BRIEFING_MINIMO,
            formato="reels_vertical",
        )

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 4


def test_sonia_smoke():
    """Sônia modo solo sem busca: 3 chamadas (análise + estruturação + formatação)."""
    mock_client = _make_mock_client(sonia_responses())

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.sonia import Sonia
        agente = Sonia()
        resultado = agente.executar(
            roteiro=ROTEIRO_MINIMO,
            modo="solo",
            com_busca=False,
            usar_tendencias=False,
        )

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 3


def test_aya_smoke():
    """Aya: 1 chamada, compila dossiê de outputs passados diretamente."""
    mock_client = _make_mock_client(aya_responses())

    outputs_fake = {
        "otto": {
            "output_humano": "Análise Otto fake.",
            "output_tecnico": {"tese_criativa": {"frase_tese": "Tese fake."}},
        }
    }

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.aya import Aya
        agente = Aya()
        resultado = agente.executar(
            outputs_diretos=outputs_fake,
            nome_projeto="Projeto Fake Teste",
        )

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 1


def test_pedro_smoke():
    """Pedro (EspelhoCliente): 1 chamada, retorna resposta em texto."""
    mock_client = _make_mock_client(pedro_responses())

    with patch("core.agente_base.Anthropic", return_value=mock_client):
        from agentes.pedro_abrahao import PedroAbrahao
        agente = PedroAbrahao()
        resultado = agente.executar(
            pergunta="O que você acha de campanhas de desconto agressivo para a clínica?",
            modo="consulta",
        )

    _assert_contrato(resultado)
    assert mock_client.messages.create.call_count == 1
