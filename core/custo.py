"""Cálculo de custo por execução."""
from dataclasses import dataclass
from .config import CUSTO_INPUT_USD_POR_MILHAO, CUSTO_OUTPUT_USD_POR_MILHAO

@dataclass
class Custo:
    tokens_input: int
    tokens_output: int
    custo_usd: float
    custo_brl_estimado: float  # cotação fixa para estimativa rápida

    @classmethod
    def calcular(cls, tokens_input: int, tokens_output: int,
                 cotacao_brl: float = 5.20):
        custo_in = (tokens_input / 1_000_000) * CUSTO_INPUT_USD_POR_MILHAO
        custo_out = (tokens_output / 1_000_000) * CUSTO_OUTPUT_USD_POR_MILHAO
        usd = custo_in + custo_out
        return cls(
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            custo_usd=round(usd, 6),
            custo_brl_estimado=round(usd * cotacao_brl, 4)
        )

    def resumo(self) -> str:
        return (f"Tokens: {self.tokens_input} in / {self.tokens_output} out | "
                f"Custo: ${self.custo_usd:.6f} (~R${self.custo_brl_estimado:.4f})")
