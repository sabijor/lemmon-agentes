"""Sistema de avaliação manual de execuções."""
from .config import HISTORICO_DIR
from .historico import Historico


def listar_agentes_com_pendencias() -> dict:
    resultado = {}
    if not HISTORICO_DIR.exists():
        return resultado

    for pasta_agente in HISTORICO_DIR.iterdir():
        if pasta_agente.is_dir():
            hist = Historico(pasta_agente.name)
            pendentes = hist.buscar_pendentes_avaliacao()
            if pendentes:
                resultado[pasta_agente.name] = pendentes
    return resultado

def formatar_resumo_caso(caso: dict, agente: str) -> str:
    timestamp = caso.get("timestamp", "?")[:19]

    if agente == "otto":
        try:
            titulo = caso["output_tecnico"]["conceito"]["titulo"]
            tese = caso["output_tecnico"]["tese_criativa"]["frase_tese"]
            return f"[{timestamp}] OTTO | Conceito: {titulo}\n  Tese: {tese[:120]}"
        except (KeyError, TypeError):
            return f"[{timestamp}] OTTO | (estrutura incompleta)"

    elif agente == "salles":
        try:
            formato = caso["output_tecnico"]["formato_aplicado"]
            titulo = caso["output_tecnico"]["titulo_roteiro"]
            return f"[{timestamp}] SALLES | Formato: {formato} | Título: {titulo}"
        except (KeyError, TypeError):
            return f"[{timestamp}] SALLES | (estrutura incompleta)"

    return f"[{timestamp}] {agente.upper()}"

def extrair_output_humano(caso: dict) -> str:
    return caso.get("output_humano", "(output_humano não disponível)")
