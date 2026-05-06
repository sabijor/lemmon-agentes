"""Teste interativo do Otto."""
import json
from datetime import datetime

from agentes.otto import Otto
from core.config import INPUTS_DIR, OUTPUTS_DIR


def main():
    print("=" * 60)
    print("OTTO | ESTRATEGISTA — Teste interativo")
    print("=" * 60)

    # Carrega briefing
    arquivo = INPUTS_DIR / "briefing_exemplo.txt"
    if not arquivo.exists():
        print(f"Arquivo não encontrado: {arquivo}")
        return

    briefing = arquivo.read_text(encoding="utf-8")
    print(f"\nBriefing carregado ({len(briefing)} caracteres)")

    # Pergunta modo
    print("\nModos disponíveis:")
    print("  1. resumo")
    print("  2. completo")
    print("  3. auto (Otto decide)")
    escolha = input("\nEscolha (1/2/3) [3]: ").strip() or "3"
    modos = {"1": "resumo", "2": "completo", "3": "auto"}
    modo = modos.get(escolha, "auto")

    # Executa
    print(f"\nRodando Otto em modo '{modo}'...\n")
    otto = Otto()

    try:
        resultado = otto.executar(briefing, modo_visual=modo)
    except Exception as e:
        print(f"\nErro: {e}")
        return

    # Salva outputs
    out_dir = OUTPUTS_DIR / "otto"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    (out_dir / f"{ts}_humano.md").write_text(
        resultado["output_humano"], encoding="utf-8"
    )
    (out_dir / f"{ts}_tecnico.json").write_text(
        json.dumps(resultado["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    # Imprime
    print("=" * 60)
    print("OUTPUT HUMANO")
    print("=" * 60)
    print(resultado["output_humano"])
    print("\n" + "=" * 60)
    print("METADADOS")
    print("=" * 60)
    print(f"Modo solicitado:  {resultado['modo_solicitado']}")
    print(f"Modo efetivo:     {resultado['modo_efetivo']}")
    print(f"Tokens:           {resultado['custo']['tokens_input']} in / "
          f"{resultado['custo']['tokens_output']} out")
    print(f"Custo:            ${resultado['custo']['usd']:.6f} "
          f"(~R${resultado['custo']['brl_estimado']:.4f})")
    print(f"Duração:          {resultado['duracao_segundos']}s")
    print(f"Arquivos salvos:  outputs/otto/{ts}_*")

if __name__ == "__main__":
    main()
