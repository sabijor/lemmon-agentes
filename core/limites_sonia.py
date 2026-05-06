"""Sistema de avisos da Sonia — análogo ao Heitor."""
from core.config import (
    SONIA_AVISO_AMARELO_USD,
    SONIA_AVISO_VERMELHO_USD,
    SONIA_PEDIR_CONFIRMACAO_ACIMA_USD,
    SONIA_PREVISAO_RANGE_USD_COM_BUSCA,
    SONIA_PREVISAO_RANGE_USD_SEM_BUSCA,
)


def previsao_custo_sonia(com_busca: bool, max_buscas: int, modo: str) -> tuple:
    """Retorna (min, max) de custo previsto em USD."""
    if com_busca:
        base_min, base_max = SONIA_PREVISAO_RANGE_USD_COM_BUSCA
        fator = max_buscas / 3.0
    else:
        base_min, base_max = SONIA_PREVISAO_RANGE_USD_SEM_BUSCA
        fator = 1.0

    fator_modo = 0.65 if modo == "cortes_apenas" else 1.0
    return (base_min * fator * fator_modo, base_max * fator * fator_modo)


def aviso_pre_execucao_sonia(com_busca: bool, max_buscas: int,
                              modo: str, modo_busca_descricao: str = "") -> dict:
    cmin, cmax = previsao_custo_sonia(com_busca, max_buscas, modo)
    cmin_brl = cmin * 5.20
    cmax_brl = cmax * 5.20

    msg = f"\n🟢 Sonia pronta pra rodar.\n   Modo: {modo}"
    msg += f"\n   Web search: {'ATIVO' if com_busca else 'desligado'}"
    if com_busca and modo_busca_descricao:
        msg += f" ({modo_busca_descricao}, até {max_buscas} buscas)"
    msg += f"\n   Custo previsto: ${cmin:.2f}-${cmax:.2f} (~R${cmin_brl:.2f}-R${cmax_brl:.2f})\n"

    precisa_confirmacao = False
    if SONIA_PEDIR_CONFIRMACAO_ACIMA_USD is not None:
        if cmax > SONIA_PEDIR_CONFIRMACAO_ACIMA_USD:
            precisa_confirmacao = True
            msg += f"\n⚠️  Custo previsto acima de ${SONIA_PEDIR_CONFIRMACAO_ACIMA_USD:.2f}.\n"

    return {"mensagem": msg, "precisa_confirmacao": precisa_confirmacao}


def aviso_amarelo_sonia(custo_acumulado: float, etapa: str):
    if custo_acumulado > SONIA_AVISO_AMARELO_USD:
        return (
            f"\n⚠️  AVISO: Sonia já consumiu ${custo_acumulado:.4f} até '{etapa}'.\n"
            f"   (acima do threshold de ${SONIA_AVISO_AMARELO_USD:.2f})\n"
            f"   Execução continua até o fim.\n"
        )
    return None


def aviso_pos_execucao_sonia(custo_total: float, breakdown: dict,
                              com_busca: bool, max_buscas: int,
                              buscas_realizadas: int, modo: str) -> str:
    cmin, cmax = previsao_custo_sonia(com_busca, max_buscas, modo)

    if custo_total > SONIA_AVISO_VERMELHO_USD:
        msg = f"\n🔴 EXECUÇÃO CARA: ${custo_total:.4f} (esperado ${cmin:.2f}-${cmax:.2f})\n"
        msg += "\n   Detalhamento:\n"
        for chave, valor in breakdown.items():
            if valor > 0:
                msg += f"   - {chave}: ${valor:.4f}\n"
        if com_busca:
            msg += f"   - Buscas: {buscas_realizadas}/{max_buscas}\n"
        msg += "\n   Sugestões:\n"
        if com_busca and buscas_realizadas == max_buscas:
            msg += "   - Reduzir max_buscas\n"
        if modo != "cortes_apenas":
            msg += "   - Usar modo cortes_apenas pra versões mais leves\n"
        return msg
    elif custo_total > cmax:
        return f"\n🟡 Acima do previsto: ${custo_total:.4f} (esperado até ${cmax:.2f})\n"
    else:
        return f"\n🟢 Dentro do esperado: ${custo_total:.4f}\n"
