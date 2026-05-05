"""Teste interativo da Aya."""
import json
from datetime import datetime
from pathlib import Path

from agentes.aya import Aya
from core.config import OUTPUTS_DIR


def main():
    print("=" * 60)
    print("AYA | ASSISTENTE VIRTUAL — Teste interativo")
    print("=" * 60)

    nome_projeto = input(
        "\nNome do projeto pra dossiê (ENTER pra deixar em branco): "
    ).strip() or None

    print("\n⏳ Rodando Aya...")
    print("⚠️  Pode demorar 30-60 segundos.\n")

    aya = Aya()
    try:
        resultado = aya.executar(nome_projeto=nome_projeto)
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return

    out_dir = OUTPUTS_DIR / "aya"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if nome_projeto:
        nome_limpo = "".join(c if c.isalnum() or c == "_" else "_" for c in nome_projeto)
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

    print("=" * 60)
    print("DOSSIÊ COMPILADO")
    print("=" * 60)
    print(f"\nAgentes detectados: {', '.join(resultado['agentes_detectados']) or 'nenhum'}")
    if resultado["agentes_ausentes"]:
        print(f"Agentes ausentes:   {', '.join(resultado['agentes_ausentes'])} (não aparecem no dossiê)")
    print(f"Tamanho do dossiê:  {resultado['tamanho_dossie_chars']} chars")
    print(f"Custo total:        ${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})")
    print(f"\n📄 Arquivo: {arquivo_md}")
    print(f"📋 JSON:    {arquivo_json}")
    print(f"\nPra ver o dossiê: cat {arquivo_md}")
    print(f"Ou abre no editor: open -e {arquivo_md}")


if __name__ == "__main__":
    main()
