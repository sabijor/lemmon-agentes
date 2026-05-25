"""Cálculo de custo por execução."""
from dataclasses import dataclass

from .config import CUSTO_INPUT_USD_POR_MILHAO, CUSTO_OUTPUT_USD_POR_MILHAO, precos_do_modelo


@dataclass
class Custo:
    tokens_input: int
    tokens_output: int
    custo_usd: float
    custo_brl_estimado: float  # cotação fixa para estimativa rápida

    @classmethod
    def calcular(cls, tokens_input: int, tokens_output: int,
                 cotacao_brl: float = 5.20, modelo: str | None = None):
        if modelo is not None:
            precos = precos_do_modelo(modelo)
            cin = precos["input"]
            cout = precos["output"]
        else:
            cin = CUSTO_INPUT_USD_POR_MILHAO
            cout = CUSTO_OUTPUT_USD_POR_MILHAO
        custo_in = (tokens_input / 1_000_000) * cin
        custo_out = (tokens_output / 1_000_000) * cout
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
