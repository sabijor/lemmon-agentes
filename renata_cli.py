"""CLI direto da Renata — linha editorial Instagram."""
import argparse
import sys
from datetime import date
from pathlib import Path

from agentes.renata import Renata
from core.config import RENATA_DURACAO_PADRAO_DIAS


def main():
    parser = argparse.ArgumentParser(
        description="Renata | linha editorial Instagram (1 post/dia)"
    )
    parser.add_argument(
        "--modo",
        choices=["pipeline", "solo"],
        default="pipeline",
        help="Modo de execução (default: pipeline)",
    )
    parser.add_argument(
        "--duracao",
        type=int,
        default=RENATA_DURACAO_PADRAO_DIAS,
        help=f"Duração da campanha em dias (default: {RENATA_DURACAO_PADRAO_DIAS})",
    )
    parser.add_argument(
        "--inicio",
        help="Data de início YYYY-MM-DD (default: hoje + 7 dias)",
    )
    parser.add_argument("--dossie", help="Caminho do dossiê Aya (.md)")
    parser.add_argument("--roteiro", help="Caminho do roteiro Salles (.md ou .txt)")
    parser.add_argument("--sonia",   help="Caminho do output Sônia (.md ou .txt)")
    parser.add_argument(
        "--contexto", help="Texto do contexto (modo solo — pode ser caminho de arquivo)"
    )
    parser.add_argument("--cliente", default="", help="ID do cliente (ex: pedro_abrahao)")
    parser.add_argument("--nome",    default="", help="Nome do projeto (para o arquivo)")
    parser.add_argument("--tags",    default="")
    args = parser.parse_args()

    def ler_arquivo(caminho: str | None) -> str | None:
        if not caminho:
            return None
        p = Path(caminho)
        if not p.exists():
            print(f"❌ Arquivo não encontrado: {p}", file=sys.stderr)
            sys.exit(1)
        return p.read_text(encoding="utf-8")

    dossie_aya    = ler_arquivo(args.dossie)
    roteiro_salles = ler_arquivo(args.roteiro)
    analise_sonia  = ler_arquivo(args.sonia)

    contexto_solo: str | None = None
    if args.modo == "solo":
        if args.contexto:
            p = Path(args.contexto)
            contexto_solo = p.read_text(encoding="utf-8") if p.exists() else args.contexto
        else:
            contexto_solo = ""  # raso → Renata vai perguntar

    data_inicio: date | None = None
    if args.inicio:
        try:
            data_inicio = date.fromisoformat(args.inicio)
        except ValueError:
            print(f"❌ Formato de data inválido: {args.inicio!r} (use YYYY-MM-DD)", file=sys.stderr)
            sys.exit(1)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

    renata = Renata()
    try:
        resultado = renata.executar(
            modo=args.modo,
            duracao_dias=args.duracao,
            data_inicio=data_inicio,
            dossie_aya=dossie_aya,
            roteiro_salles=roteiro_salles,
            analise_sonia=analise_sonia,
            contexto_solo=contexto_solo,
            cliente_id=args.cliente or None,
            tags=tags,
        )
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    # Output já foi salvo automaticamente pelo executar()
    output_path = resultado.get("output_path", "")

    perguntas = resultado["output_tecnico"].get("perguntas_clarificacao", [])
    if perguntas:
        print("\n❓ Contexto raso — Renata precisa de mais informações:\n")
        for i, p in enumerate(perguntas, 1):
            print(f"  {i}. {p}")
        print()
    else:
        print(f"📅 Editorial salvo: {output_path}")

    tecnico = output_path.replace("_humano_", "_tecnico_").replace(".md", ".json")
    print(f"📋 JSON técnico:  {tecnico}")
    print(f"💰 Custo:         ${resultado['custo_total_usd']:.6f}")

    pubs = resultado["output_tecnico"].get("publicacoes", [])
    if pubs:
        print(f"📸 Publicações:   {len(pubs)} peças")

    descartes_path = resultado.get("descartes_path")
    if descartes_path:
        print(f"🗑  Descartes:     {descartes_path}")


if __name__ == "__main__":
    main()
