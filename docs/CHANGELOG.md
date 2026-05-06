# CHANGELOG — Lemmon Agentes Manual

Convenção: novidades no topo. Datas em formato ISO. Cada entrada referencia o épico/tarefa do `PLANO_ACAO_2026-05-05.md` quando aplicável.

---

## v1.0 — 2026-05-05

**Primeira versão publicada do manual.**

### Sistema documentado pela primeira vez
- 6 agentes (Otto, Heitor, Salles, Sônia, Aya, Pedro)
- Modo Pipeline sequencial
- Modo Reunião conversacional com @menções
- Modo Manual (aprovação step-by-step)
- Retomada de sessão
- Histórico persistido + avaliação por estrelas
- Upload de imagem com descrição automática
- Speech-to-text no input
- Exportar sessão como .txt
- CLIs individuais (otto_cli, salles_cli, heitor_cli, sonia_cli, aya_cli, pedro_cli)
- Pipeline completo via terminal (`pipeline_completo.py`)

### Correções incorporadas (T1-T5 do PLANO_ACAO)
- T1: custo do Otto padronizado em `custo_total_usd`
- T2: Aya recebe contexto técnico real no pipeline via `outputs_diretos`
- T3: `/avaliar` lê do disco (sobrevive a reinício do servidor)
- T4: URL backend centralizada em `dashboard/lib/api.ts`
- T5: streaming nativo da Anthropic ativo em modo Reunião

### Pedro como agente novo
- `agentes/pedro_abrahao.py` — espelho do Dr. Pedro Abrahão (Hator Clinic)
- Material primário: dossiê + transcrições
- Modo `validacao` / `consulta` / `resposta_hipotetica`
- Plugado no dashboard com flag `reuniaoOnly: true`

---

---

## Nota de versionamento — salto v1.2 → v1.7

Os Épicos C, E, F, H e G foram implementados na sessão de 2026-05-06 sem gerar PDF intermediário a cada bump de versão (v1.3 a v1.6). **Decisão: Opção A (pragmática)** — PDFs das versões v1.3 a v1.6 não existem e não serão retroativamente gerados. O estado consolidado de todos esses épicos está documentado em `MANUAL_v1.7_2026-05-06.pdf`. A partir de v1.7, cada bump de versão deve gerar o PDF imediatamente com `python docs/gerar_pdf.py`.

---

## Próximas versões (planejadas)

### v1.x — outros épicos
Cada épico fechado adiciona uma seção nova no topo deste changelog.
