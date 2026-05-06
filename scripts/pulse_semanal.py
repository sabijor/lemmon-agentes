#!/usr/bin/env python3
"""Pulse semanal — relatório institucional automático.

Uso:
    python scripts/pulse_semanal.py               # semana anterior
    python scripts/pulse_semanal.py --semana 2026-W18  # semana específica
    python scripts/pulse_semanal.py --dias 14          # últimos N dias

Saída: outputs/pulse/<ano>-W<semana>.md
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.config import HISTORICO_DIR, MODELO_PADRAO, OUTPUTS_DIR


def _carregar_sessoes_periodo(inicio: datetime, fim: datetime) -> list[dict]:
    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        return []
    sessoes = []
    for path in session_dir.glob("*.json"):
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            ts = datetime.fromisoformat(dados.get("timestamp", ""))
            if inicio <= ts < fim:
                sessoes.append(dados)
        except Exception:
            pass
    return sorted(sessoes, key=lambda s: s.get("timestamp", ""))


def _resumir_sessao(s: dict) -> str:
    briefing = (s.get("briefing") or "")[:200]
    agentes = ", ".join(s.get("agentes_usados", []))
    custo = s.get("custo_total_usd", 0)
    avaliacao = s.get("avaliacao")
    nota = f" · {avaliacao}⭐" if avaliacao else ""
    origem = s.get("origem", "dashboard")
    ts = s.get("timestamp", "")[:16]
    return f"- [{ts}] [{origem}] {briefing}… | agentes: {agentes} | ${custo:.3f}{nota}"


def _gerar_contexto(sessoes: list[dict], semana_label: str) -> str:
    total_sessoes = len(sessoes)
    total_custo = sum(s.get("custo_total_usd", 0) for s in sessoes)
    avaliadas = [s for s in sessoes if s.get("avaliacao") is not None]
    cinco_estrelas = [s for s in avaliadas if s.get("avaliacao") == 5]
    agente_counter: dict[str, int] = {}
    for s in sessoes:
        for a in s.get("agentes_usados", []):
            agente_counter[a] = agente_counter.get(a, 0) + 1
    top_agente = max(agente_counter, key=agente_counter.get) if agente_counter else "—"

    resumos = "\n".join(_resumir_sessao(s) for s in sessoes) if sessoes else "— Nenhuma sessão registrada"

    return f"""PULSE SEMANAL — {semana_label}

DADOS GERAIS:
- Sessões realizadas: {total_sessoes}
- Custo total: ${total_custo:.4f} (~R${total_custo * 5.20:.2f})
- Sessões avaliadas: {len(avaliadas)} de {total_sessoes}
- Sessões 5⭐: {len(cinco_estrelas)}
- Agente mais chamado: {top_agente}

SESSÕES DA SEMANA:
{resumos}
"""


def _chamar_aya_pulse(contexto: str) -> str:
    """Usa Aya para gerar o relatório narrativo."""
    import anthropic
    client = anthropic.Anthropic()
    prompt = (
        f"{contexto}\n\n"
        "Gere um PULSE SEMANAL institucional para a Lemmon Produções. "
        "Inclua:\n"
        "1. **Resumo executivo** — o que foi produzido esta semana (2-3 frases)\n"
        "2. **Números-chave** — sessões, custo, avaliações (tabela markdown)\n"
        "3. **Destaque da semana** — sessão ou output mais relevante\n"
        "4. **Padrões observados** — temas recorrentes, formatos mais usados\n"
        "5. **Recomendações** — 1-2 sugestões para a próxima semana\n\n"
        "Tom: profissional mas humano. Máximo 500 palavras. Formato markdown."
    )
    resp = client.messages.create(
        model=MODELO_PADRAO,
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    return next((b.text for b in resp.content if hasattr(b, "text")), "")


def gerar_pulse(semana_label: str, inicio: datetime, fim: datetime, dry_run: bool = False) -> Path:
    print(f"\n📊 Pulse semanal: {semana_label}")
    print(f"   Período: {inicio.date()} → {fim.date()}")

    sessoes = _carregar_sessoes_periodo(inicio, fim)
    print(f"   Sessões encontradas: {len(sessoes)}")

    contexto = _gerar_contexto(sessoes, semana_label)

    if dry_run or not sessoes:
        relatorio = f"# Pulse Semanal — {semana_label}\n\n{contexto}"
        if not sessoes:
            relatorio += "\n\n> Nenhuma sessão registrada neste período."
    else:
        print("   Gerando relatório com Aya...")
        narrativa = _chamar_aya_pulse(contexto)
        relatorio = f"# Pulse Semanal — {semana_label}\n\n{narrativa}\n\n---\n\n## Dados brutos\n\n{contexto}"

    out_dir = OUTPUTS_DIR / "pulse"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{semana_label}.md"
    out_path.write_text(relatorio, encoding="utf-8")

    print(f"   ✓ Salvo: {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Pulse semanal Lemmon")
    parser.add_argument("--semana", help="Semana no formato 2026-W18 (padrão: semana anterior)")
    parser.add_argument("--dias", type=int, help="Últimos N dias em vez de semana ISO")
    parser.add_argument("--dry-run", action="store_true", help="Não chama API — gera só os dados brutos")
    args = parser.parse_args()

    now = datetime.now()

    if args.dias:
        fim = now.replace(hour=0, minute=0, second=0, microsecond=0)
        inicio = fim - timedelta(days=args.dias)
        semana_label = f"{now.year}-D{args.dias}"
    elif args.semana:
        # Parse ISO week: 2026-W18
        try:
            year, week = args.semana.split("-W")
            inicio = datetime.strptime(f"{year}-W{week.zfill(2)}-1", "%Y-W%W-%w")
        except ValueError:
            print(f"Formato inválido: {args.semana}. Use 2026-W18", file=sys.stderr)
            sys.exit(1)
        fim = inicio + timedelta(weeks=1)
        semana_label = args.semana
    else:
        # Semana anterior (segunda a domingo)
        today = now.date()
        monday = today - timedelta(days=today.weekday() + 7)
        inicio = datetime.combine(monday, datetime.min.time())
        fim = inicio + timedelta(weeks=1)
        year, week, _ = monday.isocalendar()
        semana_label = f"{year}-W{week:02d}"

    gerar_pulse(semana_label, inicio, fim, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
