"""Sistema de avisos da Renata (Social Media — linha editorial)."""
from core.config import (
    RENATA_AVISO_VERMELHO_USD,
    RENATA_PREVISAO_RANGE_USD,
)


def aviso_pre_execucao_renata(modo: str, duracao_dias: int) -> str:
    cmin, cmax = RENATA_PREVISAO_RANGE_USD
    cmin_brl = cmin * 5.20
    cmax_brl = cmax * 5.20
    return (
        f"\n🟢 Renata pronta pra rodar.\n"
        f"   Modo: {modo} | Duração: {duracao_dias} dias\n"
        f"   Custo previsto: ${cmin:.2f}–${cmax:.2f} "
        f"(~R${cmin_brl:.2f}–R${cmax_brl:.2f})\n"
    )


def aviso_pos_execucao_renata(custo_total: float) -> str:
    cmin, cmax = RENATA_PREVISAO_RANGE_USD
    if custo_total > RENATA_AVISO_VERMELHO_USD:
        return (
            f"\n🔴 Renata cara: ${custo_total:.4f} "
            f"(esperado ${cmin:.2f}–${cmax:.2f})\n"
            f"   Possível causa: dossiê muito longo ou campanha extensa.\n"
        )
    elif custo_total > cmax:
        return f"\n🟡 Acima do previsto: ${custo_total:.4f}\n"
    return f"\n🟢 Dentro do esperado: ${custo_total:.4f}\n"
