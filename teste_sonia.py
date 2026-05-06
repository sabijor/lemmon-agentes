"""Teste interativo da Sonia."""
import json
from datetime import datetime

from agentes.sonia import Sonia
from core.config import (
    INPUTS_DIR,
    OUTPUTS_DIR,
    SONIA_MAX_BUSCAS_DEFAULT,
    SONIA_MAX_BUSCAS_PROFUNDO,
)


def _confirmacao_callback():
    return input("\nProsseguir? (s/N): ").strip().lower() == "s"


def main():
    print("=" * 60)
    print("SONIA | PERFORMANCE — Teste interativo")
    print("=" * 60)

    print("\nModo:")
    print("  1. Solo (roteiro qualquer)")
    print("  2. Cadeia (último roteiro Salles)")
    print("  3. Cortes apenas (sem versão otimizada)")
    escolha = input("Escolha (1/2/3) [1]: ").strip() or "1"
    modo = {"1": "solo", "2": "cadeia", "3": "cortes_apenas"}.get(escolha, "solo")

    contexto_otto = None
    contexto_salles = None
    contexto_heitor = None
    roteiro = ""

    if modo in ["solo", "cortes_apenas"]:
        arquivo = INPUTS_DIR / "roteiro_validacao_exemplo.txt"
        if arquivo.exists():
            roteiro = arquivo.read_text(encoding="utf-8")
            print(f"\n📄 Carregado: {arquivo.name} ({len(roteiro)} chars)")
        else:
            print("\nArquivo não existe. Cole roteiro (linha 'FIM' pra terminar):")
            linhas = []
            while True:
                linha = input()
                if linha.strip() == "FIM":
                    break
                linhas.append(linha)
            roteiro = "\n".join(linhas)

    elif modo == "cadeia":
        from core.historico import Historico
        hist_salles = Historico("salles")
        ultimas = hist_salles.listar(limite=1)
        if not ultimas:
            print("❌ Nenhuma execução do Salles.")
            return
        contexto_salles = ultimas[0]["output_tecnico"]
        roteiro = ultimas[0].get("output_humano", "")

        hist_otto = Historico("otto")
        ult_otto = hist_otto.listar(limite=1)
        if ult_otto:
            contexto_otto = ult_otto[0]["output_tecnico"]

        hist_heitor = Historico("heitor")
        ult_heitor = hist_heitor.listar(limite=1)
        if ult_heitor:
            usar = input("\nÚltima análise Heitor encontrada. Incluir? (s/N): ").strip().lower()
            if usar == "s":
                contexto_heitor = ult_heitor[0]["output_tecnico"]

        print(f"\n📄 Salles: {contexto_salles.get('titulo_roteiro', '?')}")

    com_busca = input("\nAtivar web_search? (s/N): ").strip().lower() == "s"

    max_buscas = SONIA_MAX_BUSCAS_DEFAULT
    if com_busca:
        if input("Modo profundo (mais buscas)? (s/N): ").strip().lower() == "s":
            max_buscas = SONIA_MAX_BUSCAS_PROFUNDO

    arquivo_tend = INPUTS_DIR / "tendencias_atuais.md"
    usar_tendencias = True
    if arquivo_tend.exists():
        resp = input("\nUsar arquivo de tendências? (S/n): ").strip().lower()
        usar_tendencias = resp != "n"

    print(f"\n⏳ Rodando Sonia em modo '{modo}'...")

    sonia = Sonia()
    try:
        resultado = sonia.executar(
            roteiro=roteiro,
            modo=modo,
            com_busca=com_busca,
            max_buscas=max_buscas,
            usar_tendencias=usar_tendencias,
            contexto_otto=contexto_otto,
            contexto_salles=contexto_salles,
            contexto_heitor=contexto_heitor,
            confirmacao_callback=_confirmacao_callback,
        )
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return

    if resultado.get("cancelado"):
        print(f"\n🛑 Cancelado: {resultado.get('motivo')}")
        return

    out_dir = OUTPUTS_DIR / "sonia"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    (out_dir / f"{ts}_humano.md").write_text(resultado["output_humano"], encoding="utf-8")
    (out_dir / f"{ts}_tecnico.json").write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("=" * 60)
    print("OUTPUT HUMANO")
    print("=" * 60)
    print(resultado["output_humano"])
    print("\n" + "=" * 60)
    print("METADADOS")
    print("=" * 60)
    print(f"Modo:                {resultado['modo_execucao']}")
    print(f"Web search:          {'sim' if resultado['com_busca'] else 'não'}")
    print(f"Tendências usadas:   {'sim' if resultado['tendencias_usadas'] else 'não'}")
    print(f"Buscas realizadas:   {resultado['buscas_realizadas']}")
    print(f"Cortes gerados:      {len(resultado['output_tecnico'].get('cortes_autonomos', []))}")
    print(f"Custo total:         ${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})")
    print("Breakdown:")
    for chave, valor in resultado["breakdown_custo"].items():
        print(f"  {chave}: ${valor:.6f}")
    print(f"Arquivos: outputs/sonia/{ts}_*")


if __name__ == "__main__":
    main()
