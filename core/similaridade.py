"""Busca casos similares no histórico para alimentar contexto."""
from typing import List, Dict

def calcular_similaridade(caso_atual: Dict, caso_passado: Dict) -> float:
    score = 0.0

    formato_atual = caso_atual.get("formato", "")
    formato_passado = caso_passado.get("formato_aplicado", "") or caso_passado.get("formato", "")
    if formato_atual and formato_atual == formato_passado:
        score += 0.5

    tags_atual = set(caso_atual.get("tags", []))
    tags_passadas = set(caso_passado.get("tags", []))
    if tags_atual and tags_passadas:
        overlap = len(tags_atual & tags_passadas)
        union = len(tags_atual | tags_passadas)
        score += 0.4 * (overlap / union if union > 0 else 0)

    cliente_atual = caso_atual.get("tipo_cliente", "")
    cliente_passado = caso_passado.get("tipo_cliente", "")
    if cliente_atual and cliente_atual == cliente_passado:
        score += 0.1

    return score

def buscar_casos_similares(caso_atual: Dict, casos_disponiveis: List[Dict],
                            limite: int = 5, score_minimo: float = 0.3) -> List[Dict]:
    pontuados = [
        (calcular_similaridade(caso_atual, c), c)
        for c in casos_disponiveis
    ]
    pontuados = [(s, c) for s, c in pontuados if s >= score_minimo]
    pontuados.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in pontuados[:limite]]
