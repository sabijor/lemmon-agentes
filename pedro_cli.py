"""CLI direto do Pedro."""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agentes.pedro_abrahao import PedroAbrahao
from core.config import OUTPUTS_DIR


def main():
    parser = argparse.ArgumentParser(
        description="Dr. Pedro Abrahão | Consultor Cliente Espelho"
    )
    parser.add_argument(
        "pergunta", help="Pergunta/comando OU caminho de arquivo .txt"
    )
    parser.add_argument(
        "--modo",
        choices=["validacao", "consulta", "resposta_hipotetica"],
        default="consulta",
    )
    parser.add_argument(
        "--contexto",
        help="Caminho de arquivo com contexto adicional (ex: roteiro pra validar)",
    )
    parser.add_argument("--tags", default="")
    args = parser.parse_args()

    pergunta_arg = args.pergunta
    caminho_pergunta = Path(pergunta_arg)
    if caminho_pergunta.exists() and caminho_pergunta.is_file():
        pergunta = caminho_pergunta.read_text(encoding="utf-8")
    else:
        pergunta = pergunta_arg

    contexto = None
    if args.contexto:
        caminho_ctx = Path(args.contexto)
        if not caminho_ctx.exists():
            print(
                f"❌ Arquivo de contexto não encontrado: {caminho_ctx}",
                file=sys.stderr,
            )
            sys.exit(1)
        contexto = caminho_ctx.read_text(encoding="utf-8")

    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

    pedro = PedroAbrahao()
    try:
        resultado = pedro.executar(
            pergunta=pergunta,
            contexto_opcional=contexto,
            modo=args.modo,
            tags=tags,
        )
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    out_dir = OUTPUTS_DIR / "pedro_abrahao"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    arquivo_md = out_dir / f"{ts}_resposta_{args.modo}.md"
    arquivo_json = out_dir / f"{ts}_resposta_{args.modo}_tecnico.json"

    arquivo_md.write_text(resultado["output_humano"], encoding="utf-8")
    arquivo_json.write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(resultado["output_humano"])
    print(
        f"\n— Custo: ${resultado['custo_total_usd']:.6f} | "
        f"Modo: {args.modo}"
    )


if __name__ == "__main__":
    main()
