"""Busca casos similares no histórico para alimentar contexto."""
import json
import math
import re
from pathlib import Path
from typing import Dict, List

# ── Busca semântica leve por TF-IDF/Jaccard no histórico ─────────────────────

STOPWORDS = {
    "de", "a", "o", "e", "do", "da", "em", "um", "uma", "para", "com",
    "por", "que", "se", "no", "na", "os", "as", "ao", "dos", "das",
    "eu", "você", "ele", "ela", "é", "são", "foi", "ser", "ter",
    "não", "mais", "como", "mas", "esse", "essa", "isso", "este",
}


def _tokenize(text: str) -> list[str]:
    words = re.findall(r'\b[a-záàãâéêíóôõúçü]{3,}\b', text.lower())
    return [w for w in words if w not in STOPWORDS]


def _tf_idf_score(query_tokens: list[str], doc_tokens: list[str]) -> float:
    if not query_tokens or not doc_tokens:
        return 0.0
    query_set = set(query_tokens)
    doc_set = set(doc_tokens)
    intersection = query_set & doc_set
    if not intersection:
        return 0.0
    return len(intersection) / math.sqrt(len(query_set) * len(doc_set))


def buscar_historico_similar(
    briefing: str,
    historico_dir: Path,
    limite: int = 3,
    score_minimo: float = 0.05,
) -> list[dict]:
    """Busca N sessões mais similares ao briefing usando overlap de tokens."""
    query_tokens = _tokenize(briefing)
    if not query_tokens:
        return []

    session_dir = historico_dir / "dashboard"
    if not session_dir.exists():
        return []

    resultados = []
    for path in sorted(session_dir.glob("*.json"), reverse=True)[:200]:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            doc_briefing = dados.get("briefing", "")
            if not doc_briefing:
                continue
            doc_tokens = _tokenize(doc_briefing)
            score = _tf_idf_score(query_tokens, doc_tokens)
            if score >= score_minimo:
                resultados.append({
                    "score": round(score, 4),
                    "session_id": path.stem,
                    "timestamp": dados.get("timestamp", ""),
                    "briefing": doc_briefing[:200],
                    "agentes_usados": dados.get("agentes_usados", []),
                    "avaliacao": dados.get("avaliacao"),
                    "custo_total_usd": dados.get("custo_total_usd", 0),
                })
        except Exception:
            pass

    resultados.sort(key=lambda r: r["score"], reverse=True)
    return resultados[:limite]

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
