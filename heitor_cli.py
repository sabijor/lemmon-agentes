"""CLI direto do Heitor.

Uso:
    python heitor_cli.py inputs/copy_validacao_exemplo.txt
    python heitor_cli.py inputs/copy_validacao_exemplo.txt --modo solo --saida analise
    python heitor_cli.py inputs/copy_validacao_exemplo.txt --profundo --nicho emagrecimento
    python heitor_cli.py inputs/copy_validacao_exemplo.txt --max-buscas 2 --saida log
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agentes.heitor import MODOS_SAIDA, MODOS_VALIDOS, Heitor
from core.config import (
    HEITOR_MAX_BUSCAS_DEFAULT,
    HEITOR_MAX_BUSCAS_PROFUNDO,
    OUTPUTS_DIR,
)


def main():
    parser = argparse.ArgumentParser(description="Heitor | Compliance Meta")
    parser.add_argument("arquivo", help="Caminho do conteúdo (.txt)")
    parser.add_argument("--modo", choices=MODOS_VALIDOS, default="solo",
                        help="Modo de operação (default: solo)")
    parser.add_argument("--saida", choices=MODOS_SAIDA, default="auto",
                        help="Modo de saída (default: auto)")
    parser.add_argument("--nicho", default="",
                        help="Dica de nicho pro Heitor (opcional)")
    parser.add_argument(
        "--max-buscas", type=int, default=HEITOR_MAX_BUSCAS_DEFAULT,
        help=f"Limite de buscas web (default {HEITOR_MAX_BUSCAS_DEFAULT})"
    )
    parser.add_argument(
        "--profundo", action="store_true",
        help=f"Ativa modo profundo ({HEITOR_MAX_BUSCAS_PROFUNDO} buscas)"
    )
    parser.add_argument(
        "--secundarias", action="store_true",
        help="Libera busca em fontes secundárias (sem whitelist)"
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

    conteudo = caminho.read_text(encoding="utf-8")

    max_buscas = HEITOR_MAX_BUSCAS_PROFUNDO if args.profundo else args.max_buscas

    confirmacao_callback = None
    if not args.no_confirm:
        def confirmacao_callback():
            resp = input("\nProsseguir mesmo assim? (s/N): ").strip().lower()
            return resp == "s"

    heitor = Heitor()
    try:
        resultado = heitor.executar(
            conteudo=conteudo,
            modo=args.modo,
            modo_saida=args.saida,
            max_buscas=max_buscas,
            nicho_hint=args.nicho or None,
            buscar_secundarias=args.secundarias,
            confirmacao_callback=confirmacao_callback,
        )
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    if resultado.get("cancelado"):
        print(f"🛑 Cancelado: {resultado.get('motivo')}")
        sys.exit(0)

    out_dir = OUTPUTS_DIR / "heitor"
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
        f"\n— Risco: {resultado['output_tecnico'].get('risco_geral', '?')} | "
        f"Buscas: {resultado['buscas_realizadas']}/{resultado['max_buscas_configurado']} | "
        f"${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})"
    )
    print(f"Arquivos: {arq_humano.name} | {arq_tecnico.name}")


if __name__ == "__main__":
    main()
