"""CLI direto do Salles.

Uso:
    python salles_cli.py inputs/briefing.txt --formato documental_institucional
    python salles_cli.py inputs/briefing.txt --formato auto --tags "marca,arquitetura"
    python salles_cli.py inputs/briefing.txt --isolado --formato reels_vertical
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from agentes.salles import Salles, FORMATOS_VALIDOS
from core.config import OUTPUTS_DIR

def main():
    parser = argparse.ArgumentParser(description="Salles | Roteirista Lemmon")
    parser.add_argument("arquivo", help="Caminho do briefing (.txt)")
    parser.add_argument("--formato", choices=sorted(FORMATOS_VALIDOS),
                        default="auto")
    parser.add_argument("--tags", default="")
    parser.add_argument("--isolado", action="store_true",
                        help="Roda só Salles, usando última análise do Otto")
    args = parser.parse_args()

    caminho = Path(args.arquivo)
    if not caminho.exists():
        print(f"❌ Arquivo não encontrado: {caminho}", file=sys.stderr)
        sys.exit(1)

    briefing = caminho.read_text(encoding="utf-8")
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

    salles = Salles()
    try:
        if args.isolado:
            from core.historico import Historico
            hist_otto = Historico("otto")
            ultimas = hist_otto.listar(limite=1)
            if not ultimas:
                print("❌ Nenhuma execução Otto encontrada.", file=sys.stderr)
                sys.exit(1)
            analise = ultimas[0]["output_tecnico"]
            analise["briefing_original"] = ultimas[0].get("briefing_original", briefing)
            resultado = salles.executar_isolado(analise, formato=args.formato, tags=tags)
        else:
            resultado = salles.executar(briefing, formato=args.formato, tags=tags)
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    out_dir = OUTPUTS_DIR / "salles"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_base = caminho.stem

    (out_dir / f"{ts}_{nome_base}_humano.md").write_text(
        resultado["output_humano"], encoding="utf-8")
    (out_dir / f"{ts}_{nome_base}_tecnico.json").write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2), encoding="utf-8")

    print(resultado["output_humano"])
    print(f"\n— Custo total: ${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})")
    print(f"Arquivos: outputs/salles/{ts}_{nome_base}_*")

if __name__ == "__main__":
    main()
