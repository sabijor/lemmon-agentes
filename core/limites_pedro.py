"""Sistema de avisos do Pedro — agente consultor cliente."""
from core.config import (
    PEDRO_PREVISAO_RANGE_USD,
    PEDRO_AVISO_AMARELO_USD,
    PEDRO_AVISO_VERMELHO_USD,
)


def aviso_pre_execucao_pedro(modo: str = "consulta") -> str:
    cmin, cmax = PEDRO_PREVISAO_RANGE_USD
    cmin_brl = cmin * 5.20
    cmax_brl = cmax * 5.20

    return (
        f"\n🟢 Pedro pronto pra responder.\n"
        f"   Modo: {modo}\n"
        f"   Custo previsto: ${cmin:.2f}-${cmax:.2f} "
        f"(~R${cmin_brl:.2f}-R${cmax_brl:.2f})\n"
    )


def aviso_pos_execucao_pedro(custo_total: float) -> str:
    cmin, cmax = PEDRO_PREVISAO_RANGE_USD

    if custo_total > PEDRO_AVISO_VERMELHO_USD:
        return (
            f"\n🔴 Pedro caro: ${custo_total:.4f} (esperado ${cmin:.2f}-${cmax:.2f})\n"
            f"   Possível causa: input ou contexto muito grande.\n"
        )
    elif custo_total > cmax:
        return f"\n🟡 Acima do previsto: ${custo_total:.4f}\n"
    else:
        return f"\n🟢 Dentro do esperado: ${custo_total:.4f}\n"
