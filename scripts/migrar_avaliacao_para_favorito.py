#!/usr/bin/env python3
"""
Migração v1.30: avaliacao 1-5 → favorito bool.

Regra:
  avaliacao == 5  →  favorito: True
  qualquer outro  →  favorito: False

O campo `avaliacao` é preservado no JSON (legado somente-leitura).
Ao final, recói o _index.json via reconstruir().

Uso:
  python scripts/migrar_avaliacao_para_favorito.py
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
DASHBOARD_DIR = ROOT / "historico" / "dashboard"

sys.path.insert(0, str(ROOT))


def main():
    t0 = time.monotonic()

    if not DASHBOARD_DIR.exists():
        print("Nenhuma sessão encontrada em historico/dashboard/ — nada a migrar.")
        return

    arquivos = list(DASHBOARD_DIR.glob("*.json"))
    arquivos = [f for f in arquivos if not f.name.startswith("_")]

    total = len(arquivos)
    favoritas = 0
    erros = 0

    for path in arquivos:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            favorito = dados.get("avaliacao") == 5
            if favorito:
                favoritas += 1
            dados["favorito"] = favorito
            path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"  ⚠ Erro em {path.name}: {exc}")
            erros += 1

    print(f"Migração concluída em {time.monotonic() - t0:.2f}s")
    print(f"  Sessões processadas : {total}")
    print(f"  Viraram favoritas   : {favoritas}")
    print(f"  Erros               : {erros}")

    print("Reconstruindo _index.json...")
    from core.historico_index import reconstruir
    n = reconstruir()
    print(f"  Índice reconstruído : {n} entradas")


if __name__ == "__main__":
    main()
