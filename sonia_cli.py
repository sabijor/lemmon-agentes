"""CLI direto da Sonia.

Uso:
    python sonia_cli.py inputs/roteiro_validacao_exemplo.txt
    python sonia_cli.py inputs/roteiro.txt --modo cortes_apenas
    python sonia_cli.py inputs/roteiro.txt --com-busca --profundo
    python sonia_cli.py inputs/roteiro.txt --sem-tendencias --no-confirm
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agentes.sonia import MODOS_VALIDOS, Sonia
from core.config import (
    OUTPUTS_DIR,
    SONIA_MAX_BUSCAS_DEFAULT,
    SONIA_MAX_BUSCAS_PROFUNDO,
)


def main():
    parser = argparse.ArgumentParser(description="Sonia | Performance")
    parser.add_argument("arquivo", help="Caminho do roteiro (.txt ou .md)")
    parser.add_argument(
        "--modo", choices=MODOS_VALIDOS, default="solo",
        help="Modo de operação (default: solo)"
    )
    parser.add_argument(
        "--com-busca", action="store_true",
        help="Ativa web search (default: desligado)"
    )
    parser.add_argument(
        "--profundo", action="store_true",
        help=f"Modo profundo — {SONIA_MAX_BUSCAS_PROFUNDO} buscas (requer --com-busca)"
    )
    parser.add_argument(
        "--max-buscas", type=int, default=SONIA_MAX_BUSCAS_DEFAULT,
        help=f"Limite de buscas web (default {SONIA_MAX_BUSCAS_DEFAULT})"
    )
    parser.add_argument(
        "--sem-tendencias", action="store_true",
        help="Ignora arquivo inputs/tendencias_atuais.md"
    )
    parser.add_argument(
        "--tags", default="",
        help="Tags livres separadas por vírgula"
    )
    parser.add_argument(
        "--no-confirm", action="store_true",
        help="Pula confirmação automática mesmo se custo previsto for alto"
    )
    args = parser.parse_args()

    caminho = Path(args.arquivo)
    if not caminho.exists():
        print(f"❌ Arquivo não encontrado: {caminho}", file=sys.stderr)
        sys.exit(1)

    roteiro = caminho.read_text(encoding="utf-8")
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []
    max_buscas = SONIA_MAX_BUSCAS_PROFUNDO if args.profundo else args.max_buscas

    confirmacao_callback = None
    if not args.no_confirm:
        def confirmacao_callback():
            resp = input("\nProsseguir mesmo assim? (s/N): ").strip().lower()
            return resp == "s"

    sonia = Sonia()
    try:
        resultado = sonia.executar(
            roteiro=roteiro,
            modo=args.modo,
            com_busca=args.com_busca,
            max_buscas=max_buscas,
            usar_tendencias=not args.sem_tendencias,
            tags=tags,
            confirmacao_callback=confirmacao_callback,
        )
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    if resultado.get("cancelado"):
        print(f"🛑 Cancelado: {resultado.get('motivo')}")
        sys.exit(0)

    out_dir = OUTPUTS_DIR / "sonia"
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
    print(
        f"\n— Modo: {resultado['modo_execucao']} | "
        f"Cortes: {len(resultado['output_tecnico'].get('cortes_autonomos', []))} | "
        f"Buscas: {resultado['buscas_realizadas']} | "
        f"${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})"
    )
    print(f"Arquivos: {arq_humano.name} | {arq_tecnico.name}")


if __name__ == "__main__":
    main()
