"""CLI direto da Aya."""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agentes.aya import Aya
from core.config import OUTPUTS_DIR


def main():
    parser = argparse.ArgumentParser(description="Aya | compila dossiê dos agentes Lemmon")
    parser.add_argument("--nome", default="", help="Nome do projeto (opcional)")
    parser.add_argument("--otto", help="Caminho específico do JSON do Otto")
    parser.add_argument("--heitor", help="Caminho específico do JSON do Heitor")
    parser.add_argument("--salles", help="Caminho específico do JSON do Salles")
    parser.add_argument("--sonia", help="Caminho específico do JSON do Sonia")
    parser.add_argument("--tags", default="")
    args = parser.parse_args()

    arquivos_especificos = {}
    for agente in ["otto", "heitor", "salles", "sonia"]:
        valor = getattr(args, agente)
        if valor:
            arquivos_especificos[agente] = valor

    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

    aya = Aya()
    try:
        resultado = aya.executar(
            nome_projeto=args.nome or None,
            arquivos_especificos=arquivos_especificos or None,
            tags=tags,
        )
    except Exception as e:
        print(f"❌ Erro: {e}", file=sys.stderr)
        sys.exit(1)

    out_dir = OUTPUTS_DIR / "aya"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if args.nome:
        nome_limpo = "".join(c if c.isalnum() or c == "_" else "_" for c in args.nome)
        nome_arquivo = f"{ts}_dossie_{nome_limpo}"
    else:
        nome_arquivo = f"{ts}_dossie"

    arquivo_md = out_dir / f"{nome_arquivo}.md"
    arquivo_json = out_dir / f"{nome_arquivo}_tecnico.json"

    arquivo_md.write_text(resultado["output_humano"], encoding="utf-8")
    arquivo_json.write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    # ===== EXPORT v1.1: HTML + PDF =====
    from core.exportador_aya import exportar_dossie
    from core.config import AYA_GERAR_HTML, AYA_GERAR_PDF, AYA_PDF_ENGINE

    export_resultado = exportar_dossie(
        markdown_original=resultado["output_humano"],
        caminho_md=arquivo_md,
        agentes_consultados=resultado["agentes_detectados"],
        gerar_html=AYA_GERAR_HTML,
        gerar_pdf=AYA_GERAR_PDF,
        pdf_engine=AYA_PDF_ENGINE,
    )

    print(f"📄 Dossiê salvo: {arquivo_md}")
    print(f"📋 JSON técnico: {arquivo_json}")
    if export_resultado["html_gerado"]:
        print(f"🌐 HTML:        {export_resultado['caminho_html']}")
    if export_resultado["pdf_gerado"]:
        print(f"📕 PDF:         {export_resultado['caminho_pdf']}")
    if export_resultado["erros"]:
        for erro in export_resultado["erros"]:
            print(f"⚠️  {erro}", file=sys.stderr)
    print(f"💰 Custo: ${resultado['custo_total_usd']:.6f}")
    print(f"📊 Agentes: {', '.join(resultado['agentes_detectados']) or 'nenhum'}")


if __name__ == "__main__":
    main()
