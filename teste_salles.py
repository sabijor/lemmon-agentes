"""Teste interativo do Salles."""
import json
from datetime import datetime
from pathlib import Path
from agentes.salles import Salles, FORMATOS_VALIDOS
from core.config import INPUTS_DIR, OUTPUTS_DIR

def main():
    print("=" * 60)
    print("SALLES | ROTEIRISTA — Teste interativo")
    print("=" * 60)

    arquivo = INPUTS_DIR / "briefing_salles_exemplo.txt"
    if not arquivo.exists():
        arquivo = INPUTS_DIR / "briefing_exemplo.txt"

    briefing = arquivo.read_text(encoding="utf-8")
    print(f"\n📄 Briefing carregado de {arquivo.name} ({len(briefing)} chars)")

    print("\nFormatos disponíveis:")
    formatos_lista = sorted(FORMATOS_VALIDOS)
    for i, f in enumerate(formatos_lista, 1):
        print(f"  {i}. {f}")

    escolha = input(f"\nEscolha (1-{len(formatos_lista)}) [auto]: ").strip()
    if escolha and escolha.isdigit() and 1 <= int(escolha) <= len(formatos_lista):
        formato = formatos_lista[int(escolha) - 1]
    else:
        formato = "auto"

    tags_raw = input("Tags livres (vírgula, ENTER pra pular): ").strip()
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

    print("\nModo de execução:")
    print("  1. Pipeline completo (Otto + discussão + Salles) — ~3 chamadas")
    print("  2. Apenas Salles isolado (precisa de análise Otto pré-existente)")
    modo = input("Escolha (1/2) [1]: ").strip() or "1"

    print(f"\n⏳ Rodando Salles em modo '{formato}'...")
    print("⚠️  Pode demorar 1-3 minutos.\n")

    salles = Salles()

    try:
        if modo == "2":
            print("Modo isolado precisa de análise Otto. Procurando última execução...")
            from core.historico import Historico
            hist_otto = Historico("otto")
            ultimas = hist_otto.listar(limite=1)
            if not ultimas:
                print("❌ Nenhuma execução do Otto encontrada. Rode Otto primeiro.")
                return
            analise = ultimas[0]["output_tecnico"]
            analise["briefing_original"] = ultimas[0].get("briefing_original", briefing)
            resultado = salles.executar_isolado(analise, formato=formato, tags=tags)
        else:
            resultado = salles.executar(briefing, formato=formato, tags=tags)
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return

    out_dir = OUTPUTS_DIR / "salles"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    (out_dir / f"{ts}_humano.md").write_text(
        resultado["output_humano"], encoding="utf-8"
    )
    (out_dir / f"{ts}_tecnico.json").write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    if resultado.get("discussao_otto_salles"):
        (out_dir / f"{ts}_discussao.json").write_text(
            json.dumps(resultado["discussao_otto_salles"], ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    print("=" * 60)
    print("OUTPUT HUMANO")
    print("=" * 60)
    print(resultado["output_humano"])
    print("\n" + "=" * 60)
    print("METADADOS")
    print("=" * 60)
    print(f"Formato solicitado:    {resultado['formato_solicitado']}")
    print(f"Formato aplicado:      {resultado['formato_aplicado']}")
    print(f"Tags:                  {resultado['tags']}")
    print(f"Custo total:           ${resultado['custo_total_usd']:.6f} (~R${resultado['custo_total_brl_estimado']:.4f})")
    print(f"Breakdown de custo:")
    for etapa, valor in resultado.get("breakdown_custo", {}).items():
        print(f"  {etapa}: ${valor:.6f}")
    print(f"Casos similares usados: {len(resultado.get('casos_similares_usados', []))}")
    print(f"Arquivos: outputs/salles/{ts}_*")
    print(f"\n💡 Lembrete: rode 'python avaliar.py' depois de usar o roteiro pra calibrar.")

if __name__ == "__main__":
    main()
