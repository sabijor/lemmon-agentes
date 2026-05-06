"""Avisos e limites genéricos para agentes EspelhoCliente."""


def aviso_pre_execucao(nome: str, modo: str, previsao_range_usd: tuple) -> str:
    cmin, cmax = previsao_range_usd
    return (
        f"\n🟢 {nome} pronto pra responder.\n"
        f"   Modo: {modo}\n"
        f"   Custo previsto: ${cmin:.2f}-${cmax:.2f} "
        f"(~R${cmin * 5.20:.2f}-R${cmax * 5.20:.2f})\n"
    )


def aviso_pos_execucao(nome: str, custo_total: float, previsao_range_usd: tuple,
                       aviso_vermelho_usd: float) -> str:
    cmin, cmax = previsao_range_usd
    if custo_total > aviso_vermelho_usd:
        return (
            f"\n🔴 {nome} caro: ${custo_total:.4f} (esperado ${cmin:.2f}-${cmax:.2f})\n"
            f"   Possível causa: input ou contexto muito grande.\n"
        )
    elif custo_total > cmax:
        return f"\n🟡 {nome} acima do previsto: ${custo_total:.4f}\n"
    else:
        return f"\n🟢 {nome} dentro do esperado: ${custo_total:.4f}\n"
