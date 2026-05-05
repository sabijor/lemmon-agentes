"""Pipeline completo: Otto → Heitor → Salles → Sonia.

Uso:
    python pipeline_completo.py inputs/briefing.txt
    python pipeline_completo.py inputs/briefing.txt --formato reels_vertical
    python pipeline_completo.py inputs/briefing.txt --profundo --nicho emagrecimento
    python pipeline_completo.py inputs/briefing.txt --sem-heitor  # Otto → Salles direto
    python pipeline_completo.py inputs/briefing.txt --com-sonia   # inclui etapa Sonia
    python pipeline_completo.py inputs/briefing.txt --com-sonia --busca-sonia
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agentes.otto import Otto
from agentes.heitor import Heitor, MODOS_VALIDOS
from agentes.salles import Salles, FORMATOS_VALIDOS
from agentes.sonia import Sonia
from agentes.aya import Aya
from core.config import (
    OUTPUTS_DIR,
    HEITOR_MAX_BUSCAS_DEFAULT,
    HEITOR_MAX_BUSCAS_PROFUNDO,
    SONIA_MAX_BUSCAS_DEFAULT,
    SONIA_MAX_BUSCAS_PROFUNDO,
    PIPELINE_AVISO_CUSTO_TOTAL_USD,
)


def _separador(titulo: str):
    print("\n" + "=" * 60)
    print(f"  {titulo}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline completo Lemmon: Otto → Heitor → Salles → Sonia"
    )
    parser.add_argument("arquivo", help="Caminho do briefing (.txt)")
    parser.add_argument("--formato", choices=sorted(FORMATOS_VALIDOS), default="auto",
                        help="Formato do roteiro (default: auto)")
    parser.add_argument("--tags", default="",
                        help="Tags livres, separadas por vírgula")
    parser.add_argument("--nicho", default="",
                        help="Dica de nicho pro Heitor")
    parser.add_argument(
        "--profundo", action="store_true",
        help=f"Heitor em modo profundo ({HEITOR_MAX_BUSCAS_PROFUNDO} buscas)"
    )
    parser.add_argument(
        "--max-buscas", type=int, default=HEITOR_MAX_BUSCAS_DEFAULT,
        help=f"Limite de buscas do Heitor (default {HEITOR_MAX_BUSCAS_DEFAULT})"
    )
    parser.add_argument(
        "--secundarias", action="store_true",
        help="Heitor busca em fontes secundárias também"
    )
    parser.add_argument(
        "--sem-heitor", action="store_true",
        help="Pula Heitor — roda só Otto → Salles"
    )
    parser.add_argument(
        "--no-confirm", action="store_true",
        help="Pula confirmação automática do Heitor e da Sonia"
    )
    parser.add_argument(
        "--sem-sonia", action="store_true",
        help="Pula Sonia — roda só Otto → Heitor → Salles"
    )
    parser.add_argument(
        "--busca-sonia", action="store_true",
        help="Ativa web search da Sonia"
    )
    parser.add_argument(
        "--sonia-profundo", action="store_true",
        help=f"Sonia em modo profundo ({SONIA_MAX_BUSCAS_PROFUNDO} buscas)"
    )
    parser.add_argument(
        "--sonia-modo", choices=["cadeia", "solo", "cortes_apenas"], default="cadeia",
        help="Modo da Sonia (default: cadeia)"
    )
    parser.add_argument("--com-aya", action="store_true",
                        help="Aya compila dossiê final ao terminar pipeline")
    parser.add_argument("--nome-projeto", default="",
                        help="Nome do projeto (usado por Aya pro arquivo do dossiê)")
    args = parser.parse_args()

    caminho = Path(args.arquivo)
    if not caminho.exists():
        print(f"❌ Arquivo não encontrado: {caminho}", file=sys.stderr)
        sys.exit(1)

    briefing = caminho.read_text(encoding="utf-8")
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []
    max_buscas = HEITOR_MAX_BUSCAS_PROFUNDO if args.profundo else args.max_buscas
    nome_base = caminho.stem
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    custo_acumulado = 0.0
    breakdown_pipeline = {}

    # =========================================================
    # ETAPA 1 — OTTO (Estrategista)
    # =========================================================
    _separador("ETAPA 1/3 — OTTO | Estrategista")  # +4 se --com-sonia

    otto = Otto()
    try:
        resultado_otto = otto.executar(briefing, modo_visual="completo")
    except Exception as e:
        print(f"❌ Otto falhou: {e}", file=sys.stderr)
        sys.exit(1)

    custo_otto = resultado_otto["custo"]["usd"]
    custo_acumulado += custo_otto
    breakdown_pipeline["otto_usd"] = custo_otto

    print(resultado_otto["output_humano"])
    print(f"\n— Otto: ${custo_otto:.6f} | {resultado_otto['duracao_segundos']}s")

    analise_otto = resultado_otto["output_tecnico"]
    analise_otto["briefing_original"] = briefing

    # =========================================================
    # ETAPA 2 — HEITOR (Compliance)
    # =========================================================
    resultado_heitor = None
    diretrizes_heitor = None

    if not args.sem_heitor:
        _separador("ETAPA 2/3 — HEITOR | Compliance Meta")

        confirmacao_callback = None
        if not args.no_confirm:
            def confirmacao_callback():
                resp = input("\nProsseguir mesmo assim? (s/N): ").strip().lower()
                return resp == "s"

        heitor = Heitor()
        try:
            resultado_heitor = heitor.executar(
                conteudo=briefing,
                modo="cadeia",
                modo_saida="log",
                max_buscas=max_buscas,
                nicho_hint=args.nicho or None,
                buscar_secundarias=args.secundarias,
                confirmacao_callback=confirmacao_callback,
                contexto_otto=analise_otto,
            )
        except Exception as e:
            print(f"⚠️  Heitor falhou: {e}", file=sys.stderr)
            print("Continuando pipeline sem compliance...", file=sys.stderr)

        if resultado_heitor and not resultado_heitor.get("cancelado"):
            custo_heitor = resultado_heitor["custo_total_usd"]
            custo_acumulado += custo_heitor
            breakdown_pipeline["heitor_usd"] = custo_heitor
            diretrizes_heitor = resultado_heitor["output_tecnico"]

            print(resultado_heitor["output_humano"])
            print(
                f"\n— Heitor: ${custo_heitor:.6f} | "
                f"Risco: {diretrizes_heitor.get('risco_geral', '?')} | "
                f"Buscas: {resultado_heitor['buscas_realizadas']}"
            )
        elif resultado_heitor and resultado_heitor.get("cancelado"):
            print("🛑 Heitor cancelado. Continuando sem compliance...")
    else:
        _separador("ETAPA 2/3 — HEITOR | Pulado (--sem-heitor)")
        print("Continuando sem análise de compliance.")

    # =========================================================
    # ETAPA 3 — SALLES (Roteirista)
    # =========================================================
    _separador("ETAPA 3/3 — SALLES | Roteirista")

    salles = Salles()
    try:
        resultado_salles = salles.executar(
            briefing=briefing,
            formato=args.formato,
            analise_otto_existente=analise_otto,
            tags=tags,
            diretrizes_heitor=diretrizes_heitor,
        )
    except Exception as e:
        print(f"❌ Salles falhou: {e}", file=sys.stderr)
        sys.exit(1)

    custo_salles = resultado_salles["custo_total_usd"]
    custo_acumulado += custo_salles
    breakdown_pipeline["salles_usd"] = custo_salles

    print(resultado_salles["output_humano"])
    print(f"\n— Salles: ${custo_salles:.6f}")

    # =========================================================
    # ETAPA 4 — SONIA (Performance)
    # =========================================================
    resultado_sonia = None

    if not args.sem_sonia:
        _separador("ETAPA 4 — SONIA | Performance")

        roteiro_sonia = resultado_salles.get("output_humano", "")
        max_buscas_sonia = SONIA_MAX_BUSCAS_PROFUNDO if args.sonia_profundo else SONIA_MAX_BUSCAS_DEFAULT

        confirmacao_sonia = None
        if not args.no_confirm:
            def confirmacao_sonia():
                resp = input("\nProsseguir mesmo assim? (s/N): ").strip().lower()
                return resp == "s"

        sonia = Sonia()
        try:
            resultado_sonia = sonia.executar(
                roteiro=roteiro_sonia,
                modo=args.sonia_modo,
                com_busca=args.busca_sonia,
                max_buscas=max_buscas_sonia,
                contexto_otto=analise_otto,
                contexto_salles=resultado_salles.get("output_tecnico"),
                contexto_heitor=diretrizes_heitor,
                tags=tags,
                confirmacao_callback=confirmacao_sonia,
            )
        except Exception as e:
            print(f"⚠️  Sonia falhou: {e}", file=sys.stderr)
            print("Continuando pipeline sem performance...", file=sys.stderr)

        if resultado_sonia and not resultado_sonia.get("cancelado"):
            custo_sonia = resultado_sonia["custo_total_usd"]
            custo_acumulado += custo_sonia
            breakdown_pipeline["sonia_usd"] = custo_sonia

            print(resultado_sonia["output_humano"])
            print(
                f"\n— Sonia: ${custo_sonia:.6f} | "
                f"Cortes: {len(resultado_sonia['output_tecnico'].get('cortes_autonomos', []))} | "
                f"Buscas: {resultado_sonia['buscas_realizadas']}"
            )

            if custo_acumulado > PIPELINE_AVISO_CUSTO_TOTAL_USD:
                print(
                    f"\n⚠️  Pipeline custou ${custo_acumulado:.6f} — "
                    f"acima do threshold de ${PIPELINE_AVISO_CUSTO_TOTAL_USD:.2f}."
                )
        elif resultado_sonia and resultado_sonia.get("cancelado"):
            print("🛑 Sonia cancelada. Finalizando pipeline sem performance...")
    else:
        _separador("ETAPA 4 — SONIA | Pulada (--sem-sonia)")
        print("Continuando sem análise de performance.")

    # =========================================================
    # ETAPA 5 (OPCIONAL): AYA — DOSSIÊ COMPILADO
    # =========================================================
    resultado_aya = None
    if args.com_aya:
        print("\n📋 [5/5] Rodando Aya (compilação de dossiê)...")

        aya = Aya()
        resultado_aya = aya.executar(
            nome_projeto=args.nome_projeto or None,
            tags=tags,
        )

        custo_acumulado += resultado_aya["custo_total_usd"]
        print(f"   ✓ Aya concluída (${resultado_aya['custo_total_usd']:.4f})")
    else:
        print("\n⏭️  [5/5] Aya pulada (--com-aya pra incluir compilação)")

    # =========================================================
    # SALVAR OUTPUTS
    # =========================================================
    out_dir = OUTPUTS_DIR / "pipeline"
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / f"{ts}_{nome_base}_otto_humano.md").write_text(
        resultado_otto["output_humano"], encoding="utf-8"
    )
    (out_dir / f"{ts}_{nome_base}_otto_tecnico.json").write_text(
        json.dumps(resultado_otto["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    if resultado_heitor and not resultado_heitor.get("cancelado"):
        (out_dir / f"{ts}_{nome_base}_heitor_humano.md").write_text(
            resultado_heitor["output_humano"], encoding="utf-8"
        )
        (out_dir / f"{ts}_{nome_base}_heitor_tecnico.json").write_text(
            json.dumps(resultado_heitor["output_tecnico"], ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    (out_dir / f"{ts}_{nome_base}_salles_humano.md").write_text(
        resultado_salles["output_humano"], encoding="utf-8"
    )
    (out_dir / f"{ts}_{nome_base}_salles_tecnico.json").write_text(
        json.dumps(resultado_salles["output_tecnico"], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    if resultado_sonia and not resultado_sonia.get("cancelado"):
        (out_dir / f"{ts}_{nome_base}_sonia_humano.md").write_text(
            resultado_sonia["output_humano"], encoding="utf-8"
        )
        (out_dir / f"{ts}_{nome_base}_sonia_tecnico.json").write_text(
            json.dumps(resultado_sonia["output_tecnico"], ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    if resultado_aya:
        (out_dir / f"{ts}_{nome_base}_aya_dossie.md").write_text(
            resultado_aya["output_humano"], encoding="utf-8"
        )
        (out_dir / f"{ts}_{nome_base}_aya_tecnico.json").write_text(
            json.dumps(resultado_aya["output_tecnico"], ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    # =========================================================
    # RESUMO FINAL
    # =========================================================
    _separador("RESUMO DO PIPELINE")
    print(f"Briefing:    {caminho.name}")
    print(f"Formato:     {resultado_salles['formato_aplicado']}")
    print(f"Com Heitor:  {'Sim' if diretrizes_heitor else 'Não'}")
    if diretrizes_heitor:
        print(f"Risco:       {diretrizes_heitor.get('risco_geral', '?')}")
    print(f"Com Sonia:   {'Sim' if resultado_sonia and not resultado_sonia.get('cancelado') else 'Não'}")
    print(f"Com Aya:     {'Sim' if resultado_aya else 'Não'}")
    print()
    print("Custo por etapa:")
    for etapa, valor in breakdown_pipeline.items():
        print(f"  {etapa}: ${valor:.6f}")
    if resultado_aya:
        print(f"  aya_usd: ${resultado_aya['custo_total_usd']:.6f}")
    print(f"\nCUSTO TOTAL: ${custo_acumulado:.6f} (~R${custo_acumulado * 5.20:.4f})")
    print(f"\nOutputs: outputs/pipeline/{ts}_{nome_base}_*")


if __name__ == "__main__":
    main()
