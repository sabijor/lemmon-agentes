"""CLI direto do Otto.

Uso:
    python otto_cli.py inputs/briefing.txt --modo completo
    python otto_cli.py inputs/briefing.txt --modo auto --contexto "cliente da Casa Cor"
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from agentes.otto import Otto
from core.config import OUTPUTS_DIR

def main():
    parser = argparse.ArgumentParser(description="Otto | Estrategista Lemmon")
    parser.add_argument("arquivo", help="Caminho do arquivo de briefing (.txt)")
    parser.add_argument("--modo", choices=["resumo", "completo", "auto"],
                        default="auto", help="Modo visual de saída")
    parser.add_argument("--contexto", default="",
                        help="Contexto adicional opcional")
    args = parser.parse_args()

    caminho = Path(args.arquivo)
    if not caminho.exists():
        print(f"Arquivo não encontrado: {caminho}", file=sys.stderr)
        sys.exit(1)

    briefing = caminho.read_text(encoding="utf-8")

    otto = Otto()
    try:
        resultado = otto.executar(briefing, args.modo, args.contexto)
    except Exception as e:
        print(f"Erro: {e}", file=sys.stderr)
        sys.exit(1)

    out_dir = OUTPUTS_DIR / "otto"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_base = caminho.stem

    arq_humano = out_dir / f"{ts}_{nome_base}_humano.md"
    arq_tecnico = out_dir / f"{ts}_{nome_base}_tecnico.json"

    arq_humano.write_text(resultado["output_humano"], encoding="utf-8")
    arq_tecnico.write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(resultado["output_humano"])
    print(f"\n— {resultado['custo']['tokens_input']}/{resultado['custo']['tokens_output']} tokens "
          f"| ${resultado['custo']['usd']:.6f} | {resultado['duracao_segundos']}s")
    print(f"Arquivos: {arq_humano.name} | {arq_tecnico.name}")

if __name__ == "__main__":
    main()
