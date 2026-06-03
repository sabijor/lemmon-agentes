"""Gestão de exemplares curados (few-shot) por agente."""
import json
import re
from datetime import datetime
from pathlib import Path

EXEMPLARES_DIR = Path(__file__).parent / "exemplares"
MAX_EXEMPLARES_POR_AGENTE = 10

# v1.49 QA-B13 — agente_id vem do path da rota /exemplares/{agente}.
# Antes: `EXEMPLARES_DIR / f"{agente_id}.json"` aceitava qualquer string,
# incluindo `../../etc/passwd` → path traversal.
# Agora: regex força [a-z0-9_]{1,40} (mesma convenção de IDs internos).
_AGENTE_ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")


def _validar_agente_id(agente_id: str) -> str:
    """v1.49 QA-B13 — sanitiza agente_id antes de usar em path.

    Retorna o id se válido; senão raise ValueError.
    """
    if not isinstance(agente_id, str) or not _AGENTE_ID_RE.match(agente_id):
        raise ValueError(f"agente_id inválido: {agente_id!r}")
    return agente_id


def salvar_exemplar(agente_id: str, trecho: str, contexto: str = "", session_id: str = "") -> dict:
    agente_id = _validar_agente_id(agente_id)
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
    try:
        agente_id = _validar_agente_id(agente_id)
    except ValueError:
        return []
    path = EXEMPLARES_DIR / f"{agente_id}.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def remover_exemplar(agente_id: str, exemplar_id: str) -> bool:
    try:
        agente_id = _validar_agente_id(agente_id)
    except ValueError:
        return False
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
