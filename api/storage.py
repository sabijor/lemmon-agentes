"""Helpers de persistência de sessões no histórico."""
import json
from datetime import datetime
from pathlib import Path

from core.config import HISTORICO_DIR


def _salvar_sessao_reuniao(
    session_id: str | None,
    session_path: Path | None,
    briefing: str,
    agentes_usados: list[str],
    historico: list[dict],
    respostas: dict[str, str],
    custos: dict[str, float],
) -> tuple[str, Path]:
    """Cria ou atualiza sessão de reunião conversacional no histórico."""
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    if session_path and session_path.exists():
        registro = json.loads(session_path.read_text(encoding="utf-8"))
        registro["agentes_usados"] = list(dict.fromkeys(agentes_usados))
        registro["respostas"] = respostas
        registro["custos_usd"] = custos
        registro["custo_total_usd"] = sum(custos.values())
        registro["historico"] = historico
        session_path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
        return session_id, session_path

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "reuniao",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "historico": historico,
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }
    path = session_dir / f"{ts}_reuniao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path.stem, path


def _salvar_sessao(
    briefing: str,
    agentes_usados: list[str],
    respostas: dict[str, str],
    custos: dict[str, float],
    contexto_tecnico: dict | None = None,
    duracoes: dict[str, float] | None = None,
) -> Path:
    """Salva sessão completa da dashboard no histórico."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "dashboard",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "duracoes_segundos": duracoes or {},
        "contexto_tecnico": contexto_tecnico or {},
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }

    path = session_dir / f"{ts}_sessao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
