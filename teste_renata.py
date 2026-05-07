"""Smoke tests da Renata — padrão T67 (pytest mockado, sem chamar API real)."""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from core.calendario_br import datas_na_janela


# ── calendario_br ─────────────────────────────────────────────────────────────

def test_datas_na_janela_filtra_nichos():
    """Outubro Rosa só aparece para nichos mulher/saude."""
    inicio = date(2026, 10, 1)
    fim = date(2026, 10, 31)

    com_nicho = datas_na_janela(inicio, fim, ["mulher"])
    sem_nicho = datas_na_janela(inicio, fim, ["esporte"])

    nomes_com = [d["nome"] for d in com_nicho]
    nomes_sem = [d["nome"] for d in sem_nicho]

    assert any("outubro" in n.lower() or "Outubro" in n for n in nomes_com), \
        f"Outubro Rosa deveria aparecer para nicho 'mulher'. Nomes: {nomes_com}"
    assert not any("outubro" in n.lower() or "Outubro" in n for n in nomes_sem), \
        f"Outubro Rosa não deveria aparecer para nicho 'esporte'. Nomes: {nomes_sem}"


def test_datas_na_janela_sem_nichos_retorna_todas():
    """Sem filtro, retorna todas as datas relevantes da janela."""
    inicio = date(2026, 3, 1)
    fim = date(2026, 3, 31)
    datas = datas_na_janela(inicio, fim, [])
    assert len(datas) >= 1  # pelo menos Dia da Mulher (08/03)


def test_datas_na_janela_fora_da_janela():
    """Datas fora da janela não retornam."""
    inicio = date(2026, 6, 1)
    fim = date(2026, 6, 10)
    datas = datas_na_janela(inicio, fim, None)
    for d in datas:
        assert inicio <= d["data"] <= fim


# ── Renata.executar (mockado) ────────────────────────────────────────────────

MOCK_TOOL_RESULT = {
    "modo_execucao": "pipeline",
    "duracao_dias": 7,
    "publicacoes": [
        {
            "ordem": i + 1,
            "data_sugerida": f"Dia {i + 1}",
            "horario_recomendado": "19:00",
            "formato": "reels" if i % 3 == 0 else ("carrossel" if i % 3 == 1 else "stories"),
            "hook": f"Hook da peça {i + 1}",
            "descricao_cliente": f"Descrição {i + 1}",
            "cta": "Comenta EU que mando",
            "deriva_de": f"roteiro_salles_{i + 1}",
        }
        for i in range(7)
    ],
    "descartes": [],
    "estatisticas_mix": {"reels_pct": 43, "carrossel_pct": 29, "stories_pct": 28},
    "output_humano": "# Editorial\n\nConteúdo de teste.",
    "perguntas_clarificacao": [],
}


def _mock_content_block(tool_input: dict):
    bloco = MagicMock()
    bloco.type = "tool_use"
    bloco.name = "registrar_linha_editorial"
    bloco.input = tool_input
    return bloco


def _mock_custo():
    custo = MagicMock()
    custo.custo_usd = 0.05
    custo.resumo.return_value = "in=100 out=200 $0.05"
    return custo


@patch("agentes.renata.Renata._carregar_prompt", return_value="prompt mock")
@patch("core.historico.Historico.registrar")
@patch("agentes.renata.Renata._chamar_api")
def test_executar_pipeline_retorna_resultado(mock_api, mock_hist, mock_prompt):
    """Pipeline com dossie → retorna AgenteResultado com campos base."""
    resp = MagicMock()
    resp.content = [_mock_content_block(MOCK_TOOL_RESULT)]
    mock_api.return_value = (resp, _mock_custo(), 1.2)

    from agentes.renata import Renata
    renata = Renata()
    resultado = renata.executar(
        modo="pipeline",
        duracao_dias=7,
        dossie_aya="Dossiê de teste com tese e roteiro.",
    )

    assert "output_humano" in resultado
    assert "output_tecnico" in resultado
    assert resultado["custo_total_usd"] == pytest.approx(0.05)
    assert resultado["duracao_segundos"] >= 0


@patch("agentes.renata.Renata._carregar_prompt", return_value="prompt mock")
@patch("core.historico.Historico.registrar")
@patch("agentes.renata.Renata._chamar_api")
def test_executar_solo_raso_retorna_perguntas(mock_api, mock_hist, mock_prompt):
    """Modo solo com contexto raso → output_humano contém perguntas."""
    tool_raso = {**MOCK_TOOL_RESULT, "perguntas_clarificacao": [
        "Que material você já tem pronto?",
        "Pra qual cliente e qual a duração da campanha?",
        "Qual o objetivo central?",
    ]}
    resp = MagicMock()
    resp.content = [_mock_content_block(tool_raso)]
    mock_api.return_value = (resp, _mock_custo(), 0.8)

    from agentes.renata import Renata
    renata = Renata()
    resultado = renata.executar(
        modo="solo",
        duracao_dias=14,
        contexto_solo="quero um calendário",
    )

    perguntas = resultado["output_tecnico"].get("perguntas_clarificacao", [])
    assert len(perguntas) == 3


def test_validar_inputs_modo_invalido():
    """Modo inválido levanta ValueError."""
    from agentes.renata import Renata
    with patch("agentes.renata.Renata._carregar_prompt", return_value="x"), \
         patch("core.historico.Historico.__init__", return_value=None):
        renata = Renata.__new__(Renata)
        renata.nome = "renata"
        with pytest.raises(ValueError, match="Modo inválido"):
            renata._validar_inputs("publicar", 7, None, None, None)


def test_validar_inputs_duracao_invalida():
    """duracao_dias fora do range levanta ValueError."""
    from agentes.renata import Renata
    with patch("agentes.renata.Renata._carregar_prompt", return_value="x"), \
         patch("core.historico.Historico.__init__", return_value=None):
        renata = Renata.__new__(Renata)
        renata.nome = "renata"
        with pytest.raises(ValueError, match="duracao_dias"):
            renata._validar_inputs("pipeline", 0, "dossie", None, None)


def test_validar_inputs_pipeline_sem_contexto():
    """Pipeline sem dossie nem roteiro levanta ValueError."""
    from agentes.renata import Renata
    with patch("agentes.renata.Renata._carregar_prompt", return_value="x"), \
         patch("core.historico.Historico.__init__", return_value=None):
        renata = Renata.__new__(Renata)
        renata.nome = "renata"
        with pytest.raises(ValueError, match="dossie_aya ou roteiro_salles"):
            renata._validar_inputs("pipeline", 7, None, None, None)
