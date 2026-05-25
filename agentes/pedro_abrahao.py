"""Dr. Pedro Abrahão | Agente Cliente Espelho — instância de EspelhoCliente.

Função: CONSULTOR ESPELHO do cliente Dr. Pedro Abrahão (Hator Clinic).
Invocado sob demanda. Não entra no pipeline padrão.
"""
from core.config import (
    PEDRO_AVISO_VERMELHO_USD,
    PEDRO_CONTEXTO_OPCIONAL_MAX_CHARS,
    PEDRO_INPUT_MAX_CHARS,
    PEDRO_MATERIAL_DIR,
    PEDRO_PREVISAO_RANGE_USD,
    PEDRO_RESPOSTA_MAX_TOKENS,
)
from core.espelho import EspelhoCliente


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
        # Metadados pro auto-roteador (T139)
        papel_curto="Espelho do Dr. Pedro Abrahão (Hator Clinic — saúde estética orofacial)",
        quando_usar=[
            "conteúdo do nicho de saúde estética / orofacial / harmonização facial",
            "validar voz, tom e ângulo do Pedro antes de mandar pro cliente real",
            "feedback prévio de roteiro/copy do Pedro",
            "qualquer pedido que cita Hator, Pedro Abrahão ou clínica do Pedro",
        ],
        quando_nao_usar=[
            "briefing pra outro cliente (não Hator)",
            "validação genérica sem alvo de cliente específico",
        ],
        custo_medio_usd=0.08,
    )
