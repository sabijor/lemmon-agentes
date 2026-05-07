#!/usr/bin/env python3
"""
Limpa arquivos antigos de outputs/, preservando sessões avaliadas com 5 estrelas.

Identificação de sessões 5⭐:
  - Lê todos historico/dashboard/*.json diretamente
  - Extrai timestamps de sessões com avaliacao == 5
  - Preserva qualquer output cujo timestamp de arquivo bata com sessão 5⭐

Uso:
  python scripts/limpar_outputs.py --dias 30 --dry-run
  python scripts/limpar_outputs.py --dias 30
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUTPUTS_DIR = ROOT / "outputs"
HISTORICO_DIR = ROOT / "historico" / "dashboard"

SKIP_FILES = {"README.md", "REFERENCIA_LEPRI_SALLES_v1.1.md", ".DS_Store"}


def _coletar_timestamps_cinco_estrelas() -> set[str]:
    """Retorna prefixos de timestamp (YYYYMMDD_HHMMSS) de sessões com nota 5."""
    timestamps: set[str] = set()
    if not HISTORICO_DIR.exists():
        return timestamps
    for path in HISTORICO_DIR.glob("*.json"):
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            if dados.get("avaliacao") == 5:
                # stem format: 20260504_175459_sessao → prefixo 20260504_175459
                stem = path.stem
                parts = stem.split("_")
                if len(parts) >= 2:
                    timestamps.add(f"{parts[0]}_{parts[1]}")
        except Exception:
            pass
    return timestamps


def _arquivo_protegido(path: Path, protegidos: set[str]) -> bool:
    """True se o arquivo pertence a uma sessão 5⭐."""
    name = path.name
    for ts in protegidos:
        if name.startswith(ts):
            return True
    return False


def limpar(dias: int, dry_run: bool) -> None:
    limite = datetime.now() - timedelta(days=dias)
    protegidos = _coletar_timestamps_cinco_estrelas()

    removidos = 0
    preservados_estrela = 0
    erros = 0

    for arquivo in OUTPUTS_DIR.rglob("*"):
        if not arquivo.is_file():
            continue
        if arquivo.name in SKIP_FILES:
            continue

        try:
            mtime = datetime.fromtimestamp(arquivo.stat().st_mtime)
        except OSError:
            continue

        if mtime >= limite:
            continue

        if _arquivo_protegido(arquivo, protegidos):
            preservados_estrela += 1
            print(f"  ⭐ preservado  {arquivo.relative_to(ROOT)}")
            continue

        if dry_run:
            print(f"  🗑  removeria  {arquivo.relative_to(ROOT)}  ({mtime:%Y-%m-%d})")
            removidos += 1
        else:
            try:
                arquivo.unlink()
                print(f"  🗑  removido   {arquivo.relative_to(ROOT)}")
                removidos += 1
            except OSError as e:
                print(f"  ✗  erro       {arquivo.relative_to(ROOT)}: {e}", file=sys.stderr)
                erros += 1

    prefixo = "[DRY-RUN] " if dry_run else ""
    print(f"\n{prefixo}Resultado: {removidos} removido(s), {preservados_estrela} preservado(s) por ⭐, {erros} erro(s)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Limpa outputs antigos preservando sessões 5⭐")
    parser.add_argument("--dias", type=int, default=30, help="Remover arquivos mais antigos que N dias (padrão: 30)")
    parser.add_argument("--dry-run", action="store_true", help="Simular sem remover")
    args = parser.parse_args()

    if args.dias < 7:
        print("Erro: --dias mínimo é 7 para evitar remoção acidental.", file=sys.stderr)
        sys.exit(1)

    modo = "DRY-RUN" if args.dry_run else "REAL"
    print(f"Limpando outputs com >{args.dias} dias [{modo}]")
    limpar(args.dias, args.dry_run)


if __name__ == "__main__":
    main()
