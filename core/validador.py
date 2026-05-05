"""Validação de inputs antes de chamar a API."""
from .config import BRIEFING_MIN_CARACTERES, BRIEFING_MAX_CARACTERES

class BriefingInvalido(Exception):
    pass

def validar_briefing(texto: str) -> str:
    if not isinstance(texto, str):
        raise BriefingInvalido("Briefing precisa ser string.")

    texto = texto.strip()

    if len(texto) < BRIEFING_MIN_CARACTERES:
        raise BriefingInvalido(
            f"Briefing muito curto ({len(texto)} caracteres). "
            f"Mínimo: {BRIEFING_MIN_CARACTERES}."
        )

    if len(texto) > BRIEFING_MAX_CARACTERES:
        raise BriefingInvalido(
            f"Briefing muito longo ({len(texto)} caracteres). "
            f"Máximo: {BRIEFING_MAX_CARACTERES}. "
            f"Considere resumir antes de processar."
        )

    return texto

def validar_modo_visual(modo: str) -> str:
    modos_validos = {"resumo", "completo", "auto"}
    modo = modo.lower().strip()
    if modo not in modos_validos:
        raise ValueError(
            f"Modo inválido: '{modo}'. Use: {', '.join(modos_validos)}"
        )
    return modo
