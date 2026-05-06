"""Teste interativo do Heitor."""
import json
from datetime import datetime

from agentes.heitor import Heitor
from core.config import (
    HEITOR_MAX_BUSCAS_DEFAULT,
    HEITOR_MAX_BUSCAS_PROFUNDO,
    INPUTS_DIR,
    OUTPUTS_DIR,
)


def _confirmacao_callback():
    """Pergunta ao usuário se quer prosseguir."""
    resp = input("\nProsseguir mesmo assim? (s/N): ").strip().lower()
    return resp == "s"


def main():
    print("=" * 60)
    print("HEITOR | COMPLIANCE META — Teste interativo")
    print("=" * 60)

    # 1. Modo
    print("\nModo de operação:")
    print("  1. Solo (analisar texto/copy direto)")
    print("  2. Cadeia (após Otto — usa última análise)")
    print("  3. Auditor (após Salles — usa último roteiro)")
    escolha = input("Escolha (1/2/3) [1]: ").strip() or "1"
    modo = {"1": "solo", "2": "cadeia", "3": "auditor"}.get(escolha, "solo")

    contexto_otto = None
    contexto_salles = None
    conteudo = ""

    if modo == "solo":
        arquivo = INPUTS_DIR / "copy_validacao_exemplo.txt"
        if arquivo.exists():
            conteudo = arquivo.read_text(encoding="utf-8")
            print(f"\n📄 Carregado: {arquivo.name} ({len(conteudo)} chars)")
        else:
            print("\nArquivo não existe. Cole o conteúdo (linha 'FIM' pra terminar):")
            linhas = []
            while True:
                linha = input()
                if linha.strip() == "FIM":
                    break
                linhas.append(linha)
            conteudo = "\n".join(linhas)

    elif modo == "cadeia":
        from core.historico import Historico
        hist_otto = Historico("otto")
        ultimas = hist_otto.listar(limite=1)
        if not ultimas:
            print("❌ Nenhuma execução do Otto encontrada.")
            return
        contexto_otto = ultimas[0]["output_tecnico"]
        conteudo = ultimas[0].get("briefing_original", "")
        if not conteudo:
            print("❌ Análise do Otto não tem briefing salvo.")
            return
        conceito = contexto_otto.get("conceito", {}).get("titulo", "?")
        print(f"\n📄 Análise Otto carregada — conceito: {conceito}")

    elif modo == "auditor":
        from core.historico import Historico
        hist_salles = Historico("salles")
        ultimas = hist_salles.listar(limite=1)
        if not ultimas:
            print("❌ Nenhuma execução do Salles encontrada.")
            return
        contexto_salles = ultimas[0]["output_tecnico"]
        conteudo = ultimas[0].get("output_humano", "")
        print("\n📄 Roteiro Salles carregado")

    # 2. Configurações
    nicho_hint = input(
        "\nDica de nicho (ENTER pra Heitor descobrir sozinho): "
    ).strip() or None

    profundo_raw = input("Modo profundo (mais buscas, mais caro)? (s/N): ").strip().lower()
    if profundo_raw == "s":
        max_buscas = HEITOR_MAX_BUSCAS_PROFUNDO
    else:
        max_buscas = HEITOR_MAX_BUSCAS_DEFAULT

    secundarias_raw = input("Buscar em fontes secundárias? (s/N): ").strip().lower()
    buscar_secundarias = secundarias_raw == "s"

    print("\nModo de saída:")
    print("  1. log (curto, leitura rápida)")
    print("  2. analise (relatório completo)")
    print("  3. auto (Heitor decide)")
    saida_escolha = input("Escolha (1/2/3) [3]: ").strip() or "3"
    modo_saida = {"1": "log", "2": "analise", "3": "auto"}.get(saida_escolha, "auto")

    # 3. Executar
    print("\n⏳ Rodando Heitor...")
    print("⚠️  Pode demorar 1-3 minutos (web_search).\n")

    heitor = Heitor()
    try:
        resultado = heitor.executar(
            conteudo=conteudo,
            modo=modo,
            modo_saida=modo_saida,
            max_buscas=max_buscas,
            nicho_hint=nicho_hint,
            buscar_secundarias=buscar_secundarias,
            confirmacao_callback=_confirmacao_callback,
            contexto_otto=contexto_otto,
            contexto_salles=contexto_salles,
        )
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return

    if resultado.get("cancelado"):
        print(f"\n🛑 Cancelado: {resultado.get('motivo')}")
        return

    # 4. Salvar e mostrar
    out_dir = OUTPUTS_DIR / "heitor"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    (out_dir / f"{ts}_humano.md").write_text(
        resultado["output_humano"], encoding="utf-8"
    )
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
    print(f"Modo:                 {resultado['modo_execucao']}")
    print(f"Saída:                {resultado['modo_saida']}")
    print(f"Risco geral:          {resultado['output_tecnico'].get('risco_geral', '?')}")
    print(f"Buscas configuradas:  {resultado['max_buscas_configurado']}")
    print(f"Buscas realizadas:    {resultado['buscas_realizadas']}")
    print(f"Fontes consultadas:   {len(resultado['fontes_consultadas'])}")
    print(f"Custo total:          ${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})")
    print("Breakdown:")
    for chave, valor in resultado["breakdown_custo"].items():
        print(f"  {chave}: ${valor:.6f}")
    print(f"Arquivos: outputs/heitor/{ts}_*")


if __name__ == "__main__":
    main()
