"""Sistema de avisos do Heitor — 3 camadas (pré, durante, pós)."""
from core.config import (
    HEITOR_AVISO_AMARELO_USD,
    HEITOR_AVISO_VERMELHO_USD,
    HEITOR_PEDIR_CONFIRMACAO_ACIMA_USD,
    HEITOR_PREVISAO_RANGE_USD,
)


def previsao_custo(max_buscas: int, modo_saida: str) -> tuple:
    """Retorna (min, max) de custo previsto em USD."""
    base_min, base_max = HEITOR_PREVISAO_RANGE_USD
    fator = max_buscas / 3.0
    fator_saida = 1.3 if modo_saida == "analise" else 1.0
    return (base_min * fator * fator_saida, base_max * fator * fator_saida)


def aviso_pre_execucao(max_buscas: int, modo: str, modo_saida: str) -> dict:
    """
    Camada 1 — aviso ANTES de executar.

    Returns:
        dict com mensagem (str) e precisa_confirmacao (bool).
    """
    cmin, cmax = previsao_custo(max_buscas, modo_saida)
    cmin_brl = cmin * 5.20
    cmax_brl = cmax * 5.20

    msg = (
        f"\n🟢 Heitor pronto pra rodar.\n"
        f"   Modo: {modo} | Saída: {modo_saida}\n"
        f"   Buscas máximas: {max_buscas}\n"
        f"   Custo previsto: ${cmin:.2f}-${cmax:.2f} (~R${cmin_brl:.2f}-R${cmax_brl:.2f})\n"
    )

    precisa_confirmacao = False
    if HEITOR_PEDIR_CONFIRMACAO_ACIMA_USD is not None:
        if cmax > HEITOR_PEDIR_CONFIRMACAO_ACIMA_USD:
            precisa_confirmacao = True
            msg += f"\n⚠️  Custo previsto acima de ${HEITOR_PEDIR_CONFIRMACAO_ACIMA_USD:.2f}.\n"

    return {"mensagem": msg, "precisa_confirmacao": precisa_confirmacao}


def aviso_amarelo(custo_acumulado_usd: float, etapa: str) -> str | None:
    """
    Camada 2 — aviso DURANTE execução.

    Returns:
        str: mensagem de aviso se passou do threshold; None caso contrário.
    """
    if custo_acumulado_usd > HEITOR_AVISO_AMARELO_USD:
        return (
            f"\n⚠️  AVISO: Heitor já consumiu ${custo_acumulado_usd:.4f} "
            f"até a etapa '{etapa}'.\n"
            f"   (acima do threshold de ${HEITOR_AVISO_AMARELO_USD:.2f})\n"
            f"   A execução vai continuar até o fim.\n"
        )
    return None


def aviso_pos_execucao(
    custo_total: float,
    breakdown: dict,
    max_buscas: int,
    buscas_realizadas: int,
    modo_saida: str
) -> str:
    """
    Camada 3 — aviso DEPOIS de executar.

    Sempre retorna mensagem (verde, amarela ou vermelha conforme custo).
    """
    cmin, cmax = previsao_custo(max_buscas, modo_saida)

    if custo_total > HEITOR_AVISO_VERMELHO_USD:
        msg = f"\n🔴 EXECUÇÃO CARA: ${custo_total:.4f} (esperado ${cmin:.2f}-${cmax:.2f})\n"
        msg += "\n   Detalhamento:\n"
        for chave, valor in breakdown.items():
            if valor > 0:
                msg += f"   - {chave}: ${valor:.4f}\n"
        msg += f"   - Buscas realizadas: {buscas_realizadas}/{max_buscas}\n"

        msg += "\n   Possíveis causas:\n"
        if buscas_realizadas == max_buscas:
            msg += "   - Atingiu limite de buscas — páginas extensas inflaram tokens\n"
        if breakdown.get("formatacao_usd", 0) > 0.15:
            msg += "   - Modo análise gerou markdown longo\n"

        msg += "\n   Sugestões pra próxima execução:\n"
        msg += "   - Reduzir max_buscas (--max-buscas 2)\n"
        if modo_saida == "analise":
            msg += "   - Usar --saida log em vez de analise\n"
        return msg

    elif custo_total > cmax:
        return (
            f"\n🟡 Execução acima do previsto: ${custo_total:.4f} "
            f"(esperado até ${cmax:.2f})\n"
            f"   Buscas: {buscas_realizadas}/{max_buscas}\n"
        )

    else:
        return (
            f"\n🟢 Execução dentro do esperado: ${custo_total:.4f}\n"
            f"   Buscas: {buscas_realizadas}/{max_buscas}\n"
        )
