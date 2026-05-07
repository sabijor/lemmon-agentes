#!/usr/bin/env python3
"""
Cria backup compactado dos dados críticos do Lemmon.

Diretórios incluídos:
  historico/      — sessões e reuniões salvas
  outputs/        — outputs gerados pelos agentes
  inputs/clientes/— espelhos e contextos de clientes
  core/exemplares/— exemplares de calibragem

Destino: backups/lemmon-YYYYMMDD_HHMMSS.zip (criado na raiz do projeto)

Uso:
  python scripts/backup_historico.py
  python scripts/backup_historico.py --destino /caminho/personalizado
"""
import argparse
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent

DIRS_BACKUP = [
    "historico",
    "outputs",
    "inputs/clientes",
    "core/exemplares",
]


def _adicionar_dir(zf: zipfile.ZipFile, base: Path, rel: str) -> int:
    """Adiciona diretório ao zip; retorna quantidade de arquivos adicionados."""
    src = base / rel
    if not src.exists():
        print(f"  ⚠  não encontrado: {rel}")
        return 0
    count = 0
    for arquivo in src.rglob("*"):
        if arquivo.is_file():
            zf.write(arquivo, arquivo.relative_to(base))
            count += 1
    return count


def backup(destino: Path) -> None:
    destino.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_path = destino / f"lemmon-{ts}.zip"

    total = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel in DIRS_BACKUP:
            n = _adicionar_dir(zf, ROOT, rel)
            print(f"  ✓ {rel}: {n} arquivo(s)")
            total += n

    size_kb = zip_path.stat().st_size / 1024
    print(f"\nBackup criado: {zip_path.relative_to(ROOT)}")
    print(f"Tamanho: {size_kb:.1f} KB | {total} arquivo(s) incluído(s)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backup dos dados críticos do Lemmon")
    parser.add_argument(
        "--destino",
        type=Path,
        default=ROOT / "backups",
        help="Diretório de destino (padrão: backups/)",
    )
    args = parser.parse_args()

    print(f"Iniciando backup → {args.destino}")
    try:
        backup(args.destino)
    except Exception as e:
        print(f"Erro durante backup: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
