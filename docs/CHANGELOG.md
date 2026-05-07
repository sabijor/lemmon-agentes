# CHANGELOG — Lemmon Agentes Manual

Convenção: novidades no topo. Datas em formato ISO. Cada entrada referencia o épico/tarefa do `PLANO_ACAO_2026-05-05.md` quando aplicável.

---

## v1.28 — 2026-05-07

**FASE 6 — T103 + T105 + T102: watchdog uniforme, ease-in e latência semanal.**

- `dashboard/lib/config.ts`: `WATCHDOG_TIMEOUT_MIN = 40` e `PROGRESS_CURVE_POWER = 2.5`
- `useChat.ts` + `useReuniao.ts`: watchdog fixo em 40min (T103) — quebra paliativo T98 (piso 180s); mensagem de erro usa constante diretamente
- `useChat.ts` + `useReuniao.ts`: 3 `setInterval` de progresso trocados para `t^2.5` ease-in (T105)
- `/saude` `LatenciaChart`: confirmado semanal (`dataKey="semana"`, `data.semanas`) — sem correção de código, só manual (T102)
- Manual §4.14 (granularidade semanal explícita) + §4.17 (watchdog 40min + ease-in descritos)

---

## v1.27 — 2026-05-07

**FASE 6 — T94: Modo Loop Autônomo em Reunião.**

- `api/ws_reuniao.py`: branch `modo=loop` com while-loop completo — roteamento por @mentions, round-robin, stagnação (3 turnos consecutivos), cap de custo, interrupção do operador via `asyncio.wait_for(timeout=0.05)`, `WebSocketDisconnect` tratado; eventos `turn_iteration` e `loop_stopped`
- `api/storage.py`: `_salvar_sessao_reuniao` ganha `skip_index: bool = False` — JSON salvo a cada turno, índice atualizado uma vez no `loop_stopped`
- Prompts: todos os 7 agentes com bloco "QUANDO EM MODO LOOP" (contrato `@nome` / `[ENTREGA FINAL]` / `[PRECISO DE AYUDA OPERADOR]`)
- `useReuniao.ts`: estado de loop (`loopMode`, `loopMaxTurnos`, `loopCustoCap`, `loopActive`, `loopTurn`, `loopCost`, `loopStatus`); handlers `turn_iteration` + `loop_stopped`; `send()` envia `modo=loop` + `loop_config`; `loopStop()` envia `{type: loop_stop}`; export `LoopStatus` interface
- `ChatPanel.tsx`: segmented control 3-pill (Auto/Manual/Loop) substituindo toggle binário; inputs de turnos + cap $ na participants bar quando Loop selecionado; header "Turno N/M · $X/$Y" + botão vermelho "parar" durante loop ativo; banners pós-loop: verde (final), azul (ayuda), âmbar (turnos_max/stagnação/operador), overlay bloqueante (custo_max)
- `page.tsx`: desestrutura 11 novos campos de `useReuniao()` e passa para ChatPanel
- Manual §3.2 (subseção Loop) + §4.18

---

## v1.26 — 2026-05-07

**T98 (hotfix) + T97: piso watchdog 60s→180s + Otto 'auto'.**

- `useReuniao.ts` + `useChat.ts`: `Math.max(60,` → `Math.max(180,` — piso de 3 min evita falso timeout em Otto com briefing complexo
- `useChat.ts`: tipo `otto.modo_visual` = `'completo' | 'resumo' | 'auto'`; default `'auto'`
- `ConfigSidebar.tsx`: botões "Completo / Resumo / Auto (IA decide)"
- `api/ws_chat.py`: fast-track corrigido de `"resumido"` → `"resumo"` (validator rejeitaria o valor antigo)
- Manual §2.1 + §3.2 + §4.17

---

## v1.25 — 2026-05-07

**FASE 6 — T95: watchdog + barra de progresso em modo Reunião.**

- `useReuniao.ts`: `agentProgress`/`agentProgressMeta` + `progressIntervalsRef` + `watchdogTimersRef` + `activeAgentsRef` + `timedOutAgentsRef`
- Watchdog por agente em Reunião: `max(60, min(mediana×3, 1200))` s, cap 20 min — substitui placeholder por erro se API travar
- `timedOutAgentsRef` previne ghost bubbles quando `agent_done`/`token` chegam tarde
- `useChat.ts` (Pipeline): mesmo watchdog adicionado por consistência
- `ChatPanel.tsx`: props `reunAgentProgress?`/`reunAgentProgressMeta?`; `showBar` usa fonte correta por modo — ProgressBar em Pipeline e Reunião
- `page.tsx`: passa `reunAgentProgress`/`reunAgentProgressMeta` ao ChatPanel
- Manual §3.2 + §4.17

---

## v1.24 — 2026-05-07

**FASE 6 — T93: export agente-agnóstico (Aya e Renata).**

- Bug corrigido: `POST /exportar` era hardcoded para `respostas.aya`; output da Renata ficava órfão
- `ExportarPayload.agente: str = "aya"` (default backward-compatible)
- `out_dir = OUTPUTS_DIR / agente` com `mkdir`; `agentes_detectados=[]` para agentes != aya
- `GET /download/{session_id}/{tipo}?agente=X` serve subdiretório correto
- `ChatPanel`: dois botões independentes (Aya + Renata), estado `Record<string, ...>` por agente
- Manual §4.16

---

## v1.23 — 2026-05-07

**BLOCO 5 — T80 + T86: gráfico de latência e toast global.**

- `GET /saude/latencias?agente=X&dias=30` — médias semanais de duração por agente; semanas > 120s marcadas com `lenta: true`
- Recharts `LineChart` em `/saude`: selector de agente + período (30/60/90 dias), linha de referência em 120s, pontos vermelhos em semanas lentas
- `sonner` instalado; `Toaster` em `layout.tsx` (bottom-right, rich colors)
- `dashboard/lib/toast.ts`: wrapper `notify.{error,success,info,warning}` reutilizável
- `useApiQuery` agora dispara `notify.error()` automaticamente em toda falha de fetch
- `/briefing-reverso` e `/cortes` refatorados: estado `error` inline removido
- Manual §4.14 (gráfico latência) e §4.15 (toast global)

---

## v1.22 — 2026-05-07

**BLOCO 5 — T79: índice incremental de sessões.**

- `core/historico_index.py`: mantém `historico/_index.json` sincronizado incrementalmente
- `_salvar_sessao()` e `_salvar_sessao_reuniao()` chamam `adicionar_entrada()` após gravar cada JSON
- Sanity check no startup do FastAPI: divergência > 5% entre arquivos e entradas dispara rebuild automático com log warning
- `POST /admin/reconstruir_indice`: endpoint para reconstrução manual forçada
- `GET /historico` lê índice em vez de glob; fallback automático se índice ausente
- `/avaliar` atualiza campo `avaliacao` no índice após persistir no JSON principal
- Otimização interna — sem alteração visível na interface

---

## v1.21 — 2026-05-07

**BLOCO 5 — T83 + T87 + T84: segurança e manutenção.**

- `chmod 600 .env` aplicado (proteção da chave Anthropic); `scripts/setup_seguro.sh` automatiza para novos clones
- `scripts/limpar_outputs.py`: limpeza por idade (`--dias`, padrão 30); lê JSONs diretamente para preservar sessões 5⭐; `--dry-run` disponível; mínimo 7 dias
- `scripts/backup_historico.py`: ZIP deflate de `historico/`, `outputs/`, `inputs/clientes/`, `core/exemplares/` com timestamp; aceita `--destino` para HD externo
- Manual §5.11 (limpar outputs), §5.12 (backup), §8.5 (permissão .env)

---

## v1.20 — 2026-05-07

**BLOCO HIGIENE — T91: auditoria completa §2–§8 do manual.**

- 9 inconsistências corrigidas: contagem de agentes (6→7), sequência do pipeline com Renata, numeração §4, descrição do escritório virtual, Renata CLI §5.7, roadmap reescrito do zero, custo Renata em §8.1, estrutura de pastas em §8.4
- Regra T92 estabelecida: toda feature atualiza §2–§8 antes do bump de versão; CHANGELOG não é mais obrigatório por release (manual é a fonte primária)

---

## v1.19 — 2026-05-07

**BLOCO 6 — T89: tema claro/escuro.**

- `next-themes` via `ThemeProvider` em `layout.tsx`; `darkMode: 'class'` no Tailwind
- Toggle ☀/🌙 no header; default `prefers-color-scheme` do SO; persiste em `localStorage` (`lemmon-theme`)
- `dark:` classes cobrindo: body, `.glass`, header, ChatPanel, textarea, MacroBar, ProgressBar
- Cores dos agentes mantidas — `colorDim` pasteis funcionam em modo escuro; Aya near-white preserva contraste
- Exportações HTML/PDF da Aya não afetadas (documento de cliente/impressão)

---

## v1.18 — 2026-05-07

**BLOCO 6 — T90 V2: barra de progresso + ETA por agente.**

- `GET /sessoes/medianas?agente=X`: mediana de duração das últimas 20 sessões; cache in-memory TTL 60s
- `FALLBACK_MEDIANAS` no frontend para quando há < 3 amostras; Salles A/B multiplica mediana × 3
- `ProgressBar.tsx`: micro barra animada abaixo de cada bubble; cap 95%; snap 100% em `agent_done`; tooltip 3 campos; amber quando `elapsed > mediana × 1.5`
- Manual lock: barra trava em 100% com "🔒 Aguardando aprovação..." no modo manual
- `MacroBar.tsx`: visão geral do pipeline no header com ícones ⏱/▶/✓/✕ e mini barra por agente

---

## v1.17 — 2026-05-07

**BLOCO 4 — T76 + T77 + T85: receitas, onboarding espelho e versionamento de materiais.**

- T76: 7 novas receitas em §6 (Remix, Fast-track, Sandbox, A/B Salles, Briefing Reverso, Cortes-prontos, Gate Espelho)
- T77: §10 "Como adicionar cliente espelho" — guia de 8 etapas cobrindo todo o ciclo de onboarding
- T85: `EspelhoCliente` calcula SHA-256 do material primário e registra `material_hash` em `AgenteResultado`; sessões antigas compatíveis via guard `?? "?"`

---

## v1.16 — 2026-05-07

**Renata — Social Media (T20).**

- 7º agente: linha editorial Instagram, 1 post/dia, apenas Reels/Carrossel/Stories
- Storytelling condicional (tem_arco), banco de datas BR por nicho, descartes em estoque
- Modo pipeline (após Aya) + modo solo em Reunião (3 perguntas se contexto raso)
- Calendário BR: 54 datas fixas + datas móveis 2026/2027 + 7 campanhas de mês inteiro
- ConfigSidebar: toggle + range duração; sprite SVG coral no escritório; TypeScript limpo
- `nichos_calendario` no EspelhoCliente; pedro/dossie.md atualizado
- §2.7 + §6.14 no manual; 8 smoke tests pytest

---

## v1.15 — 2026-05-07

**BLOCO 3 — T74 + T75 + T82 + T81 + T73: tipagem, hooks e refatoração de agentes.**

- T74: `dashboard/lib/api-client.ts` centraliza 7 funções tipadas; ~80 `fetch()` inline eliminados
- T75: `useApiQuery<T>` hook genérico — padroniza ciclo loading/error/reload em todas as páginas
- T82: `HistoryPanel.tsx` (582 linhas) dividido em `FilterBar`, `SessionCard`, `SessionDetail` + orquestrador de 146 linhas
- T81: Sônia migra 3 chamadas diretas para `_chamar_api()` da base; imports de baixo nível removidos
- T73: `core/tipos.py` — `AgenteResultado(TypedDict)` com 4 campos base garantidos; todos os agentes anotam `executar() -> AgenteResultado`

---

## v1.14 — 2026-05-06

**BLOCO 1 — T61 + T62 + T63 + T64 + T65 + T78: refatoração de dívida técnica.**

- T61: `api_server.py` (1317 linhas) quebrado em `api/` com 10 módulos; `api_server.py` vira shim de 1 linha
- T62: todos os `print()` restantes em `aya.py`, `heitor.py`, `sonia.py`, `espelho.py` → `self.logger`
- T63: CSS inline do AURA Design System (~455 linhas) extraído para `core/templates/aura.css`
- T64: `OfficeScene.tsx` (1627 linhas) → 5 arquivos em `dashboard/components/office/`
- T65: `ChatPanel.tsx` (1493 linhas) → `MessageBubble.tsx` + `ConfigSidebar.tsx` + orquestrador
- T78: Heitor migra 3 chamadas diretas para `_chamar_api()` da base; imports de baixo nível removidos

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
