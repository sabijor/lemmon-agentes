"""Sistema de avisos da Aya — versão simplificada (1 chamada)."""
from core.config import (
    AYA_PREVISAO_RANGE_USD,
    AYA_AVISO_AMARELO_USD,
    AYA_AVISO_VERMELHO_USD,
)


def aviso_pre_execucao_aya(num_agentes_detectados: int) -> str:
    cmin, cmax = AYA_PREVISAO_RANGE_USD
    cmin_brl = cmin * 5.20
    cmax_brl = cmax * 5.20

    return (
        f"\n🟢 Aya pronta pra rodar.\n"
        f"   Agentes detectados: {num_agentes_detectados}/4\n"
        f"   Custo previsto: ${cmin:.2f}-${cmax:.2f} "
        f"(~R${cmin_brl:.2f}-R${cmax_brl:.2f})\n"
    )


def aviso_pos_execucao_aya(custo_total: float, num_agentes: int) -> str:
    cmin, cmax = AYA_PREVISAO_RANGE_USD

    if custo_total > AYA_AVISO_VERMELHO_USD:
        return (
            f"\n🔴 Aya cara: ${custo_total:.4f} (esperado ${cmin:.2f}-${cmax:.2f})\n"
            f"   Possível causa: outputs muito grandes.\n"
        )
    elif custo_total > cmax:
        return f"\n🟡 Acima do previsto: ${custo_total:.4f}\n"
    else:
        return f"\n🟢 Dentro do esperado: ${custo_total:.4f}\n"
