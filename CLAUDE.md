# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Codebase, comments, prompts, docs and commit messages are in **Brazilian Portuguese**. Match that when editing — variable names, log strings, user-facing text, and new docs should stay in pt-BR. English-only is appropriate inside type annotations and a few stable identifiers.

## Commands

```bash
make dev          # backend (uvicorn :8000) + frontend (next :4000) em paralelo
make backend      # só FastAPI (api.main:app, reload, :8000)
make frontend     # só Next.js dashboard (:4000)
make lint         # ruff check . --fix
make type-check   # mypy agentes/ core/ api/
make test         # pytest tests/ -v
./start.sh        # alternativa: abre backend + frontend e abre o browser
```

Run a single test: `pytest tests/test_agentes_smoke.py::test_otto_smoke -v`.

CLI entry points (each takes a briefing/roteiro file from `inputs/`):

```bash
python pipeline_completo.py inputs/<briefing>.txt   # Otto → Heitor → Salles → Sonia
python otto_cli.py | heitor_cli.py | salles_cli.py | sonia_cli.py | aya_cli.py | renata_cli.py | pedro_cli.py
python avaliar.py                                   # avalia execuções pendentes
python onboard_cliente.py                           # bootstrap de novo cliente espelho
```

Frontend runs on **port 4000** (not 3000); backend on 8000. CORS is wide open in dev.

## Setup

`.env` requires `ANTHROPIC_API_KEY`. Optional: `OPENAI_API_KEY` (for audio transcription only), `LEMMON_MODELO_PADRAO` (default `claude-sonnet-4-6`), `LEMMON_MODELO_<AGENTE>` (per-agent override, e.g. `LEMMON_MODELO_OTTO=claude-opus-4-7`). See `.env.example`.

Python 3.11, ruff line-length 120, mypy with `check_untyped_defs=true` but **no** `disallow_untyped_defs` — partial type hints are accepted.

## Architecture

### Agent layer (`agentes/` + `core/agente_base.py`)

Seven agents, each a class extending `AgenteBase`:

| Agent | File | Role |
|-------|------|------|
| Otto | `agentes/otto.py` | Estrategista — decodifica briefing em tese criativa |
| Heitor | `agentes/heitor.py` | Compliance Meta (faz web search em domínios oficiais) |
| Salles | `agentes/salles.py` | Roteirista — transforma tese em roteiro filmável |
| Sonia | `agentes/sonia.py` | Performance — analisa roteiro, sugere cortes |
| Aya | `agentes/aya.py` | Compiladora — gera dossiê final (HTML/PDF) |
| Renata | `agentes/renata.py` | Distribuição multi-plataforma |
| Pedro Abrahão | `agentes/pedro_abrahao.py` | Espelho do cliente (instância de `EspelhoCliente`) |

Default pipeline: **Otto → Heitor → Salles → Sonia**. Aya/Renata/Pedro are invoked on demand.

`AgenteBase` (`core/agente_base.py`) provides:
- `_chamar_api()` / `_chamar_api_stream()` — single Anthropic call with cost + duration tracking
- `_chamar_api_chain()` — N independent calls with same input (returns combined cost)
- `responder()` — conversational mode used by `/ws/reuniao`
- Auto-loads prompt from `prompts/{nome}_system_{versao_prompt}.md` and appends curated few-shot exemplares (`core/exemplares/{nome}.json`)
- Resolves model via `resolver_modelo(self.nome)` → env `LEMMON_MODELO_<NOME>` or `MODELO_PADRAO`
- Persists every execution to `historico/{nome}/{timestamp}.json` (Camada 2 — base for future RAG)

Subclasses must implement `executar()` and return `AgenteResultado` (`core/tipos.py`): a dict with `output_humano: str`, `output_tecnico: dict`, `custo_total_usd: float`, `duracao_segundos: float` at minimum. Tests assert this contract — keep it.

**Structured output is via tool use** (forced `tool_choice`), not JSON parsing. See Otto's `FERRAMENTA_ANALISE` for the pattern: define a tool schema, force it with `tool_choice={"type": "tool", "name": ...}`, read `bloco.input` from the response. Salles, Heitor, Sonia, Aya all do the same; each makes 1–4 chained tool calls.

### Auto-router metadata (T139)

Every agent class declares class-level metadata used by `GET /agentes/catalogo` and `/sugerir_pipeline`:
- `papel_curto`, `quando_usar: list[str]`, `quando_nao_usar: list[str]`, `categoria`, `custo_medio_usd`

To add a new agent: create class with metadata + entry in `_FABRICAS` (`api/routes/agentes.py`) + entry in `_make_agent`/`AGENTE_ALIAS` (`api/deps.py`). No hardcoded routing — the catalog is the source of truth.

### Prompt versioning (`prompts/`)

Prompts are versioned files: `{nome}_system_v{N}.md`. **Never overwrite** an existing version — bump `N`, create new file, then update `Agente.versao_prompt = "vN"`. Each execution records which version it used (in `historico/`), so regressions are auditable. See `prompts/README.md`.

### API layer (`api/`)

FastAPI app (`api/main.py`) — `api_server.py` is a re-export shim. Routes in `api/routes/`:

- `agentes.py` — `/agentes/catalogo`
- `historico.py`, `sessoes.py`, `share.py`, `exportar.py`, `exemplares.py`, `calibragem.py`, `saude.py`, `transcrever.py`, `auxiliares.py`

WebSockets:
- `/ws/chat` (`ws_chat.py`) — main pipeline driver, supports image attachments (Haiku vision), `resume_context`, sandbox mode, cost caps
- `/ws/reuniao` (`ws_reuniao.py`) — conversational multi-agent meeting with `auto` / `loop` / round-robin modes, `[ENTREGA FINAL]` / `[PRECISO DE AYUDA OPERADOR]` sentinels
- `/ws/mesa_redonda` (`ws_mesa.py`) — fixed-turn discussion

Persistence helpers in `api/storage.py` (`_salvar_sessao`, `_salvar_sessao_reuniao`) write to `historico/dashboard/` and update the index via `core/historico_index.adicionar_entrada`. The index (`historico/_index.json`) is auto-rebuilt on FastAPI startup (`lifespan` → `sanity_check`) when divergence > 5%.

### Dashboard (`dashboard/`)

Next.js 14 app router (TypeScript, Tailwind). Excluded from ruff/mypy. Key modules:
- `dashboard/lib/api-client.ts` — typed REST client (uses `API_URL` from `lib/api.ts`)
- `dashboard/lib/useChat.ts`, `useReuniao.ts`, `useHistory.ts` — WebSocket + state hooks
- `dashboard/components/office/` — animated office scene (sprites, rooms)
- `dashboard/components/chat/`, `history/`

### Cost tracking (`core/custo.py`)

Every API call is priced via `Custo.calcular(input_tokens, output_tokens, modelo=self.modelo)`. Per-model rates live in `core/config.py:PRECOS_POR_MODELO` — update when Anthropic changes pricing. Per-agent thresholds (yellow/red warning, pre-confirmation prompt) are also in `core/config.py` (`HEITOR_AVISO_AMARELO_USD`, etc.) and consumed by `core/limites_*.py` modules.

### Client mirror pattern (`core/espelho.py`)

`EspelhoCliente` is a generic `AgenteBase` subclass parameterized at construction (id, name, material dir, limits, metadata). New cliente espelho = factory function in `agentes/<cliente>.py` that returns `EspelhoCliente(...)` + a prompt in `prompts/<id>_system_v1.md` + material in `inputs/clientes/<id>/`. See `agentes/pedro_abrahao.py` for the template.

### Tests (`tests/`)

Three smoke tests. They mock `core.agente_base.Anthropic` directly — no real API calls. `tests/conftest.py` exposes `_make_mock_client(...)`, `_make_tool_response(...)`, `_make_text_response(...)`, and pre-canned `{otto,heitor,salles,sonia,aya,pedro}_responses()` lists matching the exact call count of each agent's `executar()`. When you change the number of API calls an agent makes, update the corresponding fixture or the mock will under-/over-feed it.

The contract checked is minimal: `output_humano` non-empty + `custo_total_usd` is a float. Add more assertions if you need stronger guarantees.

## File layout & gitignore

`historico/`, `outputs/`, `shares/`, `backups/`, `.env`, `.claude/settings*.json` are gitignored. Pipeline outputs go to `outputs/pipeline/YYYYMMDD_HHMMSS_<basename>_<agente>_(humano.md|tecnico.json)`. Per-agent execution history lives in `historico/{agente}/{timestamp}.json`; dashboard/reunião sessions in `historico/dashboard/`.

`inputs/clientes/<cliente_id>/` is the canonical location for client mirror material (see `ESPELHO_CLIENTES_DIR` in `core/config.py`). `PEDRO_MATERIAL_DIR` points there for the Pedro Abrahão mirror.

## Conventions

- Errors from the Anthropic SDK are translated to pt-BR via `formatar_erro_anthropic()` — wrap raw SDK calls if you add new agents that bypass `_chamar_api`.
- Web search domains are whitelisted (`HEITOR_DOMINIOS_OFICIAIS`, `SONIA_DOMINIOS_OFICIAIS` in `core/config.py`). Anthropic blocks Brazilian news sites — keep lists conservative.
- `inputs/` is the place for briefings/roteiros consumed by CLIs. There's an example briefing in `inputs/`.
- `docs/MANUAL_SISTEMA.md` is the editable manual (source of truth); `docs/gerar_pdf.py` regenerates the PDF in `docs/releases/`. `docs/CHANGELOG.md` is the chronological log. Update both whenever a major epic closes (see `PLANO_ACAO_2026-05-05.md`).
- Heitor and Sonia have **opt-in web search** (`--profundo` / `--busca-sonia`); they ask for confirmation when predicted cost exceeds threshold unless `--no-confirm`.
- Pipeline warns when accumulated cost exceeds `PIPELINE_AVISO_CUSTO_TOTAL_USD` (default $1.00).
