"""CLI de avaliação de execuções dos agentes."""
from core.avaliacao import (
    listar_agentes_com_pendencias,
    formatar_resumo_caso,
    extrair_output_humano
)
from core.historico import Historico

def main():
    print("=" * 60)
    print("LEMMON | Avaliação de execuções pendentes")
    print("=" * 60)

    pendencias = listar_agentes_com_pendencias()
    if not pendencias:
        print("\n✅ Nenhuma execução pendente de avaliação.")
        return

    for agente, casos in pendencias.items():
        print(f"\n📋 Agente: {agente.upper()} ({len(casos)} casos pendentes)")
        for i, caso in enumerate(casos, 1):
            print(f"\n  {i}. {formatar_resumo_caso(caso, agente)}")

        if input("\nAvaliar casos deste agente? (s/n): ").lower() != "s":
            continue

        hist = Historico(agente)
        for caso in casos:
            print("\n" + "=" * 60)
            print(formatar_resumo_caso(caso, agente))
            print("=" * 60)

            while True:
                print("\nOpções:")
                print("  [v] Ver output completo")
                print("  [n] Avaliar com nota")
                print("  [s] Pular este caso")

                escolha = input("Escolha: ").strip().lower()

                if escolha == "v":
                    print("\n" + "─" * 60)
                    print(extrair_output_humano(caso))
                    print("─" * 60)
                    continue

                if escolha == "s":
                    break

                if escolha == "n":
                    try:
                        nota = int(input("Nota (1-5): "))
                        if not 1 <= nota <= 5:
                            print("Nota inválida.")
                            continue

                        obs = input("Observações: ").strip()
                        correcoes = input("Correções aplicadas (o que você mudou): ").strip()
                        tags_raw = input("Tags livres (vírgula): ").strip()
                        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

                        ts = caso.get("timestamp", "")
                        hist.atualizar_avaliacao(ts, nota, obs, correcoes, tags)
                        print("✅ Avaliação salva.")
                        break
                    except (ValueError, KeyboardInterrupt):
                        print("Valor inválido.")
                        continue

                print("Opção inválida.")

    print("\n✅ Avaliação concluída.")

if __name__ == "__main__":
    main()
