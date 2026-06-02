"""Helpers de persistência de sessões no histórico."""
import json
from datetime import datetime
from pathlib import Path

from core.config import HISTORICO_DIR
from core.historico_index import adicionar_entrada
from core.tenant import tenant_namespace  # v1.46.1 #11 — sessões particionadas por tenant

# T134 — Versão do schema do JSON de sessão. Incrementar quando o formato mudar
# (ex: renomear/remover campo). Leitores podem usar esse número pra disparar
# migrations. JSONs antigos sem o campo são considerados v0 (compatível).
SCHEMA_VERSION = 1


def _salvar_sessao_reuniao(
    session_id: str | None,
    session_path: Path | None,
    briefing: str,
    agentes_usados: list[str],
    historico: list[dict],
    respostas: dict[str, str],
    custos: dict[str, float],
    skip_index: bool = False,
    sandbox: bool = False,
) -> tuple[str, Path]:
    """Cria ou atualiza sessão de reunião conversacional no histórico."""
    # v1.46.1 #11 — particionar por tenant (LEMMON_TENANT_ID). Sem isso,
    # sessões de tenants diferentes misturavam em historico/dashboard/ comum.
    session_dir = tenant_namespace(HISTORICO_DIR, "dashboard")

    if session_path and session_path.exists():
        registro = json.loads(session_path.read_text(encoding="utf-8"))
        registro["agentes_usados"] = list(dict.fromkeys(agentes_usados))
        registro["respostas"] = respostas
        registro["custos_usd"] = custos
        registro["custo_total_usd"] = sum(custos.values())
        registro["historico"] = historico
        session_path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
        if not skip_index:
            adicionar_entrada(session_path)
        return session_id, session_path

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    origem = "sandbox" if sandbox else "reuniao"
    registro = {
        "schema_version": SCHEMA_VERSION,
        "timestamp": datetime.now().isoformat(),
        "origem": origem,
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "historico": historico,
        "avaliacao": None,
        "favorito": False,
        "observacoes_operador": "",
        "tags": [],
    }
    path = session_dir / f"{ts}_reuniao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    if not skip_index:
        adicionar_entrada(path)
    return path.stem, path


def _salvar_sessao(
    briefing: str,
    agentes_usados: list[str],
    respostas: dict[str, str],
    custos: dict[str, float],
    contexto_tecnico: dict | None = None,
    duracoes: dict[str, float] | None = None,
    sandbox: bool = False,
    nome_projeto: str | None = None,  # v1.46.1 #12 — nome bonito (Haiku)
) -> Path:
    """Salva sessão completa da dashboard no histórico."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    # v1.46.1 #11 — particionar por tenant (LEMMON_TENANT_ID). Sem isso,
    # sessões de tenants diferentes misturavam em historico/dashboard/ comum.
    session_dir = tenant_namespace(HISTORICO_DIR, "dashboard")

    origem = "sandbox" if sandbox else "dashboard"
    registro = {
        "schema_version": SCHEMA_VERSION,
        "timestamp": datetime.now().isoformat(),
        "origem": origem,
        "briefing": briefing,
        "nome_projeto": nome_projeto,  # v1.46.1 #12 — usado na capa do PDF
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "duracoes_segundos": duracoes or {},
        "contexto_tecnico": contexto_tecnico or {},
        "avaliacao": None,
        "favorito": False,
        "observacoes_operador": "",
        "tags": [],
    }

    path = session_dir / f"{ts}_sessao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    adicionar_entrada(path)
    return path
