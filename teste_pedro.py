"""Teste interativo do Pedro."""
import json
from datetime import datetime

from agentes.pedro_abrahao import PedroAbrahao
from core.config import OUTPUTS_DIR


def main():
    print("=" * 60)
    print("DR. PEDRO ABRAHÃO — Teste interativo")
    print("=" * 60)

    print("\nModo:")
    print("  1. Validação (você cola texto, Pedro avalia)")
    print("  2. Consulta (você pergunta opinião)")
    print("  3. Resposta hipotética (como Pedro responderia situação X)")
    escolha = input("Escolha (1/2/3) [2]: ").strip() or "2"
    modo = {"1": "validacao", "2": "consulta", "3": "resposta_hipotetica"}.get(
        escolha, "consulta"
    )

    print(f"\nModo selecionado: {modo}")
    print("\nDigite sua pergunta/comando (linha 'FIM' pra terminar):")
    linhas = []
    while True:
        l = input()
        if l.strip() == "FIM":
            break
        linhas.append(l)
    pergunta = "\n".join(linhas)

    if not pergunta.strip():
        print("❌ Pergunta vazia. Cancelando.")
        return

    contexto = None
    if modo == "validacao":
        print("\nCole o texto a avaliar (linha 'FIM' pra terminar):")
        linhas = []
        while True:
            l = input()
            if l.strip() == "FIM":
                break
            linhas.append(l)
        contexto = "\n".join(linhas)
        if not contexto.strip():
            print("⚠️ Sem texto pra validar — modo consulta.")
            modo = "consulta"
            contexto = None

    print(f"\n⏳ Rodando Pedro em modo '{modo}'...")

    pedro = PedroAbrahao()
    try:
        resultado = pedro.executar(
            pergunta=pergunta,
            contexto_opcional=contexto,
            modo=modo,
        )
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return

    out_dir = OUTPUTS_DIR / "pedro_abrahao"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    arquivo_md = out_dir / f"{ts}_resposta_{modo}.md"
    arquivo_json = out_dir / f"{ts}_resposta_{modo}_tecnico.json"

    arquivo_md.write_text(resultado["output_humano"], encoding="utf-8")
    arquivo_json.write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("=" * 60)
    print("RESPOSTA DO DR. PEDRO")
    print("=" * 60)
    print(resultado["output_humano"])
    print("\n" + "=" * 60)
    print("METADADOS")
    print("=" * 60)
    print(f"Modo:                {resultado['modo_execucao']}")
    print(
        f"Custo total:         ${resultado['custo_total_usd']:.6f} "
        f"(~R${resultado['custo_total_brl_estimado']:.4f})"
    )
    print(f"\n📄 Arquivo: {arquivo_md}")
    print(f"📋 JSON:    {arquivo_json}")


if __name__ == "__main__":
    main()
