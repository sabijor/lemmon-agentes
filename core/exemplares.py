"""Gestão de exemplares curados (few-shot) por agente."""
import json
from datetime import datetime
from pathlib import Path

EXEMPLARES_DIR = Path(__file__).parent / "exemplares"
MAX_EXEMPLARES_POR_AGENTE = 10


def salvar_exemplar(agente_id: str, trecho: str, contexto: str = "", session_id: str = "") -> dict:
    EXEMPLARES_DIR.mkdir(exist_ok=True)
    path = EXEMPLARES_DIR / f"{agente_id}.json"
    exemplares = carregar_exemplares(agente_id)

    entrada = {
        "id": f"{agente_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "trecho": trecho[:3000],
        "contexto": contexto[:500],
        "session_id": session_id,
        "criado_em": datetime.now().isoformat(),
    }
    exemplares.append(entrada)
    # Mantém os N mais recentes
    exemplares = exemplares[-MAX_EXEMPLARES_POR_AGENTE:]
    path.write_text(json.dumps(exemplares, ensure_ascii=False, indent=2), encoding="utf-8")
    return entrada


def carregar_exemplares(agente_id: str) -> list[dict]:
    path = EXEMPLARES_DIR / f"{agente_id}.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def remover_exemplar(agente_id: str, exemplar_id: str) -> bool:
    exemplares = carregar_exemplares(agente_id)
    antes = len(exemplares)
    exemplares = [e for e in exemplares if e.get("id") != exemplar_id]
    if len(exemplares) == antes:
        return False
    path = EXEMPLARES_DIR / f"{agente_id}.json"
    path.write_text(json.dumps(exemplares, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def formatar_exemplares_para_prompt(agente_id: str) -> str:
    exemplares = carregar_exemplares(agente_id)
    if not exemplares:
        return ""
    linhas = [
        "\n\n---\n## EXEMPLARES CURADOS (referência interna — estilo validado pelo operador)\n",
        "Use estes exemplos como referência de qualidade e estilo. Não copie — inspire-se.\n",
    ]
    for i, ex in enumerate(exemplares[-3:], 1):  # injeta até 3 mais recentes
        ctx = f" [{ex['contexto']}]" if ex.get("contexto") else ""
        linhas.append(f"\n### Exemplar {i}{ctx}\n```\n{ex['trecho'][:800]}\n```")
    return "".join(linhas)
