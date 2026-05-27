"""Índice incremental de sessões em historico/dashboard/.

Mantém historico/_index.json sincronizado com os arquivos JSON do dashboard.
- adicionar_entrada() é chamado por _salvar_sessao() / _salvar_sessao_reuniao()
  imediatamente após gravar o JSON de sessão.
- sanity_check() é executado no startup do FastAPI; divergência > 5% dispara
  reconstrução automática.
- reconstruir() faz rebuild completo relendo todos os arquivos JSON.
"""
import fcntl
import json
import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Callable

from core.config import HISTORICO_DIR

_log = logging.getLogger("lemmon.index")

INDEX_PATH = HISTORICO_DIR / "_index.json"
DASHBOARD_DIR = HISTORICO_DIR / "dashboard"
_VERSAO = 1


# --------------------------------------------------------------------------- #
# T130 — concorrência: lock exclusivo + rename atômico                         #
# --------------------------------------------------------------------------- #

@contextmanager
def _file_lock(target: Path):
    """Lock exclusivo via flock(LOCK_EX) num .lock dedicado ao target.

    Bloqueia até obter — duas requests simultâneas serializam.
    Lock no arquivo paralelo (não no target) pra não interferir com rename.
    """
    lockpath = target.with_suffix(target.suffix + ".lock")
    lockpath.parent.mkdir(parents=True, exist_ok=True)
    with open(lockpath, "w") as fh:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def _update_json_atomic(path: Path, mutate: Callable[[dict], None]) -> bool:
    """Read → mutate → write atômico com lock. Evita corrida de favoritar+tags.

    Sequência: flock exclusivo → ler JSON → callback `mutate(dados)` muta in-place
    → grava em .tmp → os.replace (rename atômico) → libera lock.

    Retorna False se path não existe. Erros de IO propagam.
    """
    if not path.exists():
        return False
    with _file_lock(path):
        dados = json.loads(path.read_text(encoding="utf-8"))
        mutate(dados)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)
    return True


# --------------------------------------------------------------------------- #
# Helpers internos                                                             #
# --------------------------------------------------------------------------- #

def _ler_indice() -> list[dict]:
    """Carrega entradas do índice; retorna lista vazia se arquivo não existe."""
    if not INDEX_PATH.exists():
        return []
    try:
        raw = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        return raw.get("entradas", [])
    except Exception as exc:
        _log.warning("Índice corrompido, será reconstruído: %s", exc)
        return []


def _gravar_indice(entradas: list[dict]) -> None:
    HISTORICO_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(
        json.dumps({"versao": _VERSAO, "entradas": entradas}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _resumo_de_arquivo(path: Path) -> dict | None:
    """Lê um JSON de sessão e retorna a entrada de índice correspondente."""
    try:
        dados = json.loads(path.read_text(encoding="utf-8"))
        return {
            "session_id": path.stem,
            "timestamp": dados.get("timestamp"),
            "briefing": (dados.get("briefing") or "")[:120],
            "agentes_usados": dados.get("agentes_usados", []),
            "custo_total_usd": dados.get("custo_total_usd", 0),
            "avaliacao": dados.get("avaliacao"),
            "favorito": bool(dados.get("favorito", False)),
            "origem": dados.get("origem", "dashboard"),
            "tags": dados.get("tags", []),
        }
    except Exception as exc:
        _log.warning("Ignorando arquivo %s: %s", path.name, exc)
        return None


# --------------------------------------------------------------------------- #
# API pública                                                                  #
# --------------------------------------------------------------------------- #

def adicionar_entrada(path: Path) -> None:
    """Adiciona (ou atualiza) a entrada do índice para o arquivo de sessão dado.

    Chamado imediatamente após _salvar_sessao() ou _salvar_sessao_reuniao()
    gravarem o JSON. Operação de append — não regrava todas as entradas.
    Se a sessão já existir no índice (atualização de reunião), substitui.
    """
    resumo = _resumo_de_arquivo(path)
    if resumo is None:
        return

    entradas = _ler_indice()
    # Remove entrada existente com mesmo session_id (atualização)
    entradas = [e for e in entradas if e.get("session_id") != resumo["session_id"]]
    entradas.append(resumo)
    _gravar_indice(entradas)


def atualizar_entrada(session_id: str, campos: dict) -> None:
    """Atualiza campos específicos de uma entrada existente (ex: avaliacao, favorito, tags).

    Chamado por /avaliar (legado) e /favoritar após persistirem no JSON principal.
    """
    entradas = _ler_indice()
    for entrada in entradas:
        if entrada.get("session_id") == session_id:
            entrada.update({k: v for k, v in campos.items() if k in ("avaliacao", "favorito")})
            break
    _gravar_indice(entradas)


def marcar_favorito(session_id: str, favorito: bool) -> None:
    """Define o status favorito de uma sessão no índice e no JSON de sessão.

    Idempotente: pode ser chamada múltiplas vezes com o mesmo valor.
    Concorrência: lock exclusivo + rename atômico (T130) — duas requests
    simultâneas em /favoritar e /tags na mesma sessão serializam sem perder
    nenhuma escrita.
    """
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{session_id}.json"
    try:
        ok = _update_json_atomic(path, lambda d: d.update({"favorito": favorito}))
        if not ok:
            _log.warning("marcar_favorito: sessão não encontrada %s", session_id)
            return
        atualizar_entrada(session_id, {"favorito": favorito})
    except Exception as exc:
        _log.error("Erro ao marcar_favorito %s: %s", session_id, exc)


def reconstruir() -> int:
    """Reconstrói o índice do zero lendo todos os JSONs em historico/dashboard/.

    Retorna o número de entradas indexadas.
    """
    _log.info("Reconstruindo índice de sessões...")
    t0 = time.monotonic()

    if not DASHBOARD_DIR.exists():
        _gravar_indice([])
        return 0

    arquivos = sorted(
        list(DASHBOARD_DIR.glob("*_sessao.json")) + list(DASHBOARD_DIR.glob("*_reuniao.json")),
        key=lambda p: p.stem,
    )
    entradas = []
    for path in arquivos:
        resumo = _resumo_de_arquivo(path)
        if resumo:
            entradas.append(resumo)

    _gravar_indice(entradas)
    elapsed = time.monotonic() - t0
    _log.info("Índice reconstruído: %d entradas em %.2fs", len(entradas), elapsed)
    return len(entradas)


def sanity_check() -> None:
    """Verifica consistência do índice no startup.

    Compara contagem de arquivos JSON vs entradas no índice.
    Se divergência > 5% (ou índice ausente), reconstrói automaticamente.
    """
    if not DASHBOARD_DIR.exists():
        return

    arquivos = list(DASHBOARD_DIR.glob("*_sessao.json")) + list(DASHBOARD_DIR.glob("*_reuniao.json"))
    n_arquivos = len(arquivos)

    if not INDEX_PATH.exists():
        _log.warning("_index.json não encontrado — reconstruindo.")
        reconstruir()
        return

    entradas = _ler_indice()
    n_entradas = len(entradas)

    if n_arquivos == 0:
        return

    divergencia = abs(n_arquivos - n_entradas) / n_arquivos
    if divergencia > 0.05:
        _log.warning(
            "Índice inconsistente: %d arquivos vs %d entradas (divergência %.0f%%) — reconstruindo.",
            n_arquivos,
            n_entradas,
            divergencia * 100,
        )
        reconstruir()
    else:
        _log.info("Índice OK: %d entradas (arquivos=%d)", n_entradas, n_arquivos)
