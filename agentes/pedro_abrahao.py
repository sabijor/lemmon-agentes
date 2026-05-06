"""Dr. Pedro Abrahão | Agente Cliente Espelho — instância de EspelhoCliente.

Função: CONSULTOR ESPELHO do cliente Dr. Pedro Abrahão (Hator Clinic).
Invocado sob demanda. Não entra no pipeline padrão.
"""
from core.espelho import EspelhoCliente
from core.config import (
    PEDRO_MATERIAL_DIR,
    PEDRO_INPUT_MAX_CHARS,
    PEDRO_CONTEXTO_OPCIONAL_MAX_CHARS,
    PEDRO_RESPOSTA_MAX_TOKENS,
    PEDRO_PREVISAO_RANGE_USD,
    PEDRO_AVISO_VERMELHO_USD,
)


def PedroAbrahao() -> EspelhoCliente:
    """Instancia o espelho do Dr. Pedro Abrahão (Hator Clinic)."""
    return EspelhoCliente(
        id="pedro_abrahao",
        nome="Dr. Pedro Abrahão",
        material_dir=PEDRO_MATERIAL_DIR,
        max_tokens=PEDRO_RESPOSTA_MAX_TOKENS,
        previsao_range_usd=PEDRO_PREVISAO_RANGE_USD,
        aviso_vermelho_usd=PEDRO_AVISO_VERMELHO_USD,
        input_max_chars=PEDRO_INPUT_MAX_CHARS,
        contexto_max_chars=PEDRO_CONTEXTO_OPCIONAL_MAX_CHARS,
    )
