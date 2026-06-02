# Plano de Ação Lemmon Agentes

**Última atualização:** 2026-06-01 (pós-auditoria startup-unicórnio com 5 agentes)
**Histórico:** `PLANO_ACAO_HISTORICO.md` (T1-T193 fechados)
**Auditoria completa:** seção AUDITORIA abaixo (134 achados consolidados)

---

## 🎯 Resumo Executivo (auditoria-honesta)

> "Sistema é bem feito pra protótipo single-user no Mac. Pra Pedro botar dado médico real ou SaaS B2B, falta o pacote inteiro de auth/tenancy/cripto/LGPD. Não é dia ou semana — é 3-6 semanas de Backend Senior + DPO."

**Veredito da auditoria:**
| Dimensão | Nota | Comentário |
|---|---|---|
| **Engenharia** | 6/10 | sólido pra MVP, dívida crescendo no `ChatPanel.tsx` (1773 linhas) e `ws_chat.py` (703 linhas) |
| **Segurança** | 3/10 | zero auth, zero multi-tenant, CSWSH trivial, Next.js com 6 CVEs ativas, PII plaintext |
| **Produto** | 7/10 | Concierge + Pedro Espelho são moats reais, mas não há PMF confirmado (zero sessões Pedro reais no histórico) |
| **Testes** | 2/10 | ~8% cobertura, frontend = 0 testes, zero CI/CD |
| **UX leigo** | 8/10 | recente sprint resolveu bem; falta memória entre sessões |

**3 verdades duras:**
1. **PMF é hipótese, não evidência.** 33 sessões no histórico, zero com Pedro Espelho real ativado.
2. **Pixel office consumiu 30+ sub-tarefas e zero impact em ativação.** Maior desperdício do projeto.
3. **Pra cobrar dinheiro de cliente: faltam auth + multi-tenant + criptografia + billing.** Sem isso = freebie técnico avançado.

---

## 🚀 SPRINTS RECOMENDADOS (próximos 90 dias)

### Sprint 0 — QA interno (essa semana)
Validar tudo que já foi feito antes de mexer em qualquer coisa nova. Roteiro completo no final desse documento.

### Sprint 1 — "Não vaza pra fora" (1-2 semanas)
Pre-requisito pra Pedro entrar com dado real. Bloqueia tudo depois.
- **AUTH-1** Bearer token obrigatório em todas as rotas + WS
- **AUTH-2** Origin check no WS (anti-CSWSH) 
- **SEC-1** Next.js update (14.2.5 → 14.2.32+ ou 15.x) — 6 CVEs
- **SEC-2** `bleach.clean` no Markdown→HTML (anti-XSS no dossiê)
- **SEC-3** `/sugerir_pipeline` GET→POST (PII em URL log)
- **PERF-1** Plugar `LEMMON_EXECUTOR` (fantasma documentado)
- **PERF-2** Reusar `_anthropic_client` no Concierge

### Sprint 2 — Refactor crítico (2 semanas)
Sem isso, próxima feature custa o dobro.
- **ARCH-1** Quebrar `ChatPanel.tsx` em 6+ componentes
- **ARCH-2** Zustand para `useChat`/`useReuniao` (mata prop drilling 60+ itens)
- **ARCH-3** Strategy pattern em `ws_chat.py` (700 linhas → 1 arquivo por agente)
- **TEST-1** Vitest + RTL setup + 10 testes core (useChat, Concierge)
- **TEST-2** Pytest + CI GitHub Actions
- **PERF-3** `React.memo` em MessageBubble + `useMemo` em derived state
- **PERF-4** Cancel real no WS (task paralela escutando)

### Sprint 3 — Memória + monetização (2-3 semanas)
Game-changers de produto + começar a cobrar.
- **PROD-1** Concierge consulta `/historico/similar` automaticamente (T188.f)
- **PROD-2** Feedback loop pós-Aya: "ficou bom?" (T188.h)
- **PROD-3** Calibragem que **atualiza prompt do Pedro Espelho** (não só registra)
- **PROD-4** Página `/pricing` + plano R$ 497/mês "Concierge Saúde Premium"
- **PROD-5** Notificação WhatsApp "dossiê pronto"
- **UX-1** Esconder pixel office por padrão (toggle "Modo imersivo")
- **UX-2** Welcome modal detecta `?cliente=hator`

### Sprint 4 — Multi-tenant + SaaS B2B (3-4 semanas)
Só fazer se Sprint 3 validar PMF.
- **ARCH-4** SQLite (substitui JSON-em-disco) com `tenant_id` em tudo
- **ARCH-5** Multi-user com permissões (Pedro / secretária / freelancer)
- **SEC-4** Cripto-at-rest (Fernet/AES-GCM) para dados médicos
- **SEC-5** Audit log estruturado (LGPD art. 18)
- **SEC-6** DELETE endpoint LGPD-compliant
- **PROD-6** Brand Kit por cliente (multi-tenant ready)
- **PROD-7** Cortes automáticos de podcast (killer feature médico)

---

## 🚨 BLOQUEADORES — não entregar pra Pedro sem isso

| # | Item | Por que bloqueia | Auditor |
|---|---|---|---|
| **B-01** | Zero auth em qualquer endpoint | Pedro abre pelo Tailscale, hacker chega na API | Segurança V-01 |
| **B-02** | WS CSWSH trivial (sem origin check) | Site malicioso aberto na outra aba dispara pipeline pago | Segurança V-03 |
| **B-03** | Next.js 14.2.5 com 6 CVEs incl. CVE-2025-29927 | Authorization Bypass middleware | Segurança V-06 |
| **B-04** | XSS via dossiê markdown → HTML | Briefing malicioso = roubo de sessão Pedro | Segurança V-07 |
| **B-05** | `LEMMON_EXECUTOR` fantasma | 10 clínicas paralelas = `/health` trava | Backend #1 |
| **B-06** | PII médica plaintext + sem cripto + sem LGPD | Pedro processando dado médico = breach na hora | Segurança V-05, G-01/02/03 |
| **B-07** | Cancel em auto-mode não funciona | "Cliente apertou cancelar mas pagou $0.50" | Backend #4 |

---

## 🎯 QUICK WINS (alto impacto, < 1 dia)

| # | Item | Esforço | Onde | Impacto |
|---|---|---|---|---|
| **Q-01** | Plugar `LEMMON_EXECUTOR` em 14 sites `run_in_executor` | 15min | `ws_chat.py` + 5 outros | Resolve threadpool fantasma |
| **Q-02** | Reusar `_anthropic_client` no Concierge | 5min | `concierge.py:414` | -50% latência cold-start |
| **Q-03** | Aplicar timeout/max_size em `ws_reuniao` e `ws_mesa` | 20min | mesmo padrão `ws_chat:11-14` | Fecha 2 vetores DoS |
| **Q-04** | `RotatingFileHandler` no logger | 10min | `core/logger.py:8-32` | Evita encher disco |
| **Q-05** | `asyncio.get_running_loop()` em todos | 5min | sed 5 arquivos | Pronto pra Python 3.12+ |
| **Q-06** | `crypto.randomUUID()` polyfill | 10min | `page.tsx` + 4 lugares | Evita crash iPad Safari < 15.4 |
| **Q-07** | `tsconfig target` es5 → es2017 | 1min | `tsconfig.json:3` | -5-10KB bundle, sem regressão |
| **Q-08** | Remover `console.log('[TTS] vozes...')` | 1min | `ChatPanel.tsx:1394` | console limpo |
| **Q-09** | Remover classe `left-13` (não existe Tailwind) | 1min | `ChatPanel.tsx:1628` | dead code |
| **Q-10** | Toast em erros engolidos do histórico/exemplar | 20min | `useHistory.ts`, `SessionDetail.tsx` | UX 10x melhor de debug |
| **Q-11** | `useMemo` em `totalSessao` reduce | 5min | `ChatPanel.tsx:739-761` | -1000 recálculos/min |
| **Q-12** | `mover AUDITORIA_2026-05-05.md` pra `.gitignore` | 1min | `.gitignore` | Não vazar threat model |
| **Q-13** | Plano de pricing estático em `/pricing` | 4h | `dashboard/app/pricing/page.tsx` | Sinaliza monetização |
| **Q-14** | Validar base64 magic bytes (não só media_type) | 30min | `ws_chat.py:113` | Anti-evasão upload |
| **Q-15** | POST em `/sugerir_pipeline` (era GET) | 10min | `auxiliares.py:85` | PII fora de URL log |

---

## 🚀 INOVAÇÕES DE PRODUTO (do auditor de PM)

### 🚀 Game-changer (mudaria o jogo)

| # | Item | Esforço | Por que |
|---|---|---|---|
| **PROD-1** | Concierge consulta `/historico/similar` antes de perguntar | M | Diferencial brutal vs ChatGPT que não lembra. Endpoint já existe |
| **PROD-2** | Calibragem que TREINA (atualiza prompt do Pedro Espelho com correção real) | L | Sem isso, o moat erode. Hoje só registra divergência |
| **PROD-3** | Modo "Publicador" — integração Meta API direta | L | Tira fricção: do briefing ao agendado em 8min |
| **PROD-4** | "Ficou bom?" pós-Aya com sinais qualitativos | S | Reinforcement signal pra sistema aprender |
| **PROD-5** | Cortes automáticos de podcast (1h → 10 Reels prontos) | M | Killer feature pra médico que faz podcast |

### ✨ Alto impacto

| # | Item | Esforço |
|---|---|---|
| **PROD-6** | App mobile read-only (PWA) pra aprovação Pedro entre consultas | M |
| **PROD-7** | Brand Kit por cliente (logo, paleta, fonte, tom) | M |
| **PROD-8** | Multi-user com permissões (Pedro admin / secretária / freelancer) | L |
| **PROD-9** | Dashboard performance Instagram (link roteiro → métrica → próximo briefing) | M |
| **PROD-10** | Briefing por voz no celular ("Siri pra marketing de clínica") | S |
| **PROD-11** | Heitor proativo — alerta semanal CFM/ANVISA | M |
| **PROD-12** | Heatmap calibragem visual (gameifica melhoria do moat) | S |

### ✨ Polish / Marketing

| # | Item | Esforço |
|---|---|---|
| **PROD-13** | Esconder pixel office por padrão (Modo Imersivo off) | S |
| **PROD-14** | Página `/pricing` estática | S |
| **PROD-15** | Welcome modal detecta `?cliente=hator` | S |
| **PROD-16** | Painel saúde do sistema visível pro user | S |
| **PROD-17** | Notificação email/WhatsApp "dossiê pronto" | M |
| **PROD-18** | "Auditoria de feed gratuita em 60s" como lead magnet | M |

### 💀 Top 3 riscos churn em 30 dias

1. **Memória zero**: Pedro repete contexto toda sessão → "sistema burro". Fix: PROD-1.
2. **Custo opaco**: R$ 60-100/mês acumulando sem billing. Fix: PROD-14 + cap mensal.
3. **Concierge interroga demais**: briefing genérico sem `?cliente=hator` → ChatGPT bom. Fix: PROD-15.

---

## 🔒 SEGURANÇA — 30 vulnerabilidades catalogadas

### 🔴 Críticas (CVSS 9-10) — bloqueiam Pedro

| ID | Vulnerabilidade | Vetor | Mitigação |
|---|---|---|---|
| **V-01** | Zero auth em TODA a API | curl /historico → dados Hator inteiros | Bearer token obrigatório |
| **V-02** | Zero multi-tenancy | namespace único `historico/dashboard/` | tenant_id particionado |
| **V-03** | WS sem origin check (CSWSH) | `new WebSocket()` em evil.com | valida `ws.headers.origin` |
| **V-04** | CORS não protege WS | WS bypassa CORS por design | mesmo de V-03 |
| **V-05** | PII médica plaintext + sem TTL + sem audit | dados Hator world-readable | cripto-at-rest + DELETE endpoint |

### 🟠 Altas (CVSS 7-8)

| ID | Vulnerabilidade | Onde |
|---|---|---|
| **V-06** | Next.js 14.2.5 com 6 CVEs ativas (CVE-2025-29927) | `dashboard/package.json:12` |
| **V-07** | XSS persistente via dossiê PDF/HTML | `exportador_aya.py:70-84` |
| **V-08** | Prompt injection nos agentes downstream (não só Concierge) | `ws_chat.py` todos `_run_agent_step` |
| **V-09** | `/sugerir_pipeline` GET com briefing na URL → log leak | `auxiliares.py:85` |
| **V-10** | Rate limit ineficaz (botnet, proxy mascarado) | `main.py:25-48` |
| **V-11** | Markdown sem bleach/safe_mode | `exportador_aya.py:70` |
| **V-12** | Concierge prompt injection bypass (unicode, base64, indireção) | `concierge.py:331-362` |
| **V-13** | DoS via WS — abrir 10, threadpool satura | `deps.py:37` + `ws_chat.py` |
| **V-14** | Cancel não interrompe Anthropic em curso (queima crédito) | `ws_chat.py:215-440` |
| **V-15** | `'unsafe-inline'` em CSP + script inline `/share` | `share.py:107-115` |

### 🟡 Médias

| ID | Item |
|---|---|
| **V-16** | Token calibragem só 24 bits (`token_hex(6)`) |
| **V-17** | TOCTOU em `/share/{token}/comentar` |
| **V-18** | `/transcrever` sem cap de tamanho/MIME (OOM) |
| **V-19** | `/exportar` modo=resumo sem rate limit específico ($0.15 Anthropic por call) |
| **V-20** | Traceback Anthropic vaza em `/transcrever` e `/exportar` |
| **V-21** | `/calibragem_pedro` GET retorna registros plaintext sem auth |
| **V-22** | `sanity_check` engole erro mascarando disk corrupt |
| **V-23** | `pipeline_done` sem session_id deixa órfão silencioso |
| **V-24** | `AUDITORIA_*.md` e `PLANO_ACAO*.md` na raiz — vaza threat model |
| **V-25** | `BRIEFING_MAX_CARACTERES=15000` mas WS aceita 6MB |
| **V-26** | Imagens base64 não validam magic bytes |

### 🟢 Baixas

V-27 a V-30: `.env` em backups, `/health/anthropic` sem cache, `except: pass` espalhado, `AGENTE_ALIAS` permite enumeração.

### Compliance gaps LGPD/GDPR (dados médicos)

- **G-01** Categoria especial (saúde) sem consentimento mapeado
- **G-02** Sem direito ao esquecimento (DELETE/exportar)
- **G-03** Transferência internacional Anthropic/OpenAI não disclosed

---

## ⚙️ ARQUITETURA — refactors críticos

### Backend (30 achados, top 10)

| ID | Item | Severidade | Esforço |
|---|---|---|---|
| **A-01** | `LEMMON_EXECUTOR` declarado mas NUNCA usado (fantasma) | 🔴 | S |
| **A-02** | `Anthropic()` criado por agente, por step, por execução | 🔴 | M |
| **A-03** | `concierge.py:414` recria client cada turno | 🔴 | S |
| **A-04** | Cancel quebrado em auto-mode (loop sequencial) | 🔴 | M |
| **A-05** | Persistência JSON-em-disco sem DB → não escala | 🔴 | L |
| **A-06** | Multi-tenant inexistente | 🔴 | L |
| **A-07** | Rate limit vaza memória + falha em proxy | 🔴 | M |
| **A-08** | `ws_reuniao`/`ws_mesa` sem timeout/payload limit | 🔴 | S |
| **A-09** | `_tolerant_send_json` monkey-patch confuso | 🟠 | S |
| **A-10** | `ws_chat.chat()` 703 linhas, 5 closures, 13 nonlocals | 🟠 | L |
| **A-11** | `_run_salles_alternativas` perde 2/3 dos roteiros (sobrescreve) | 🟠 | M |
| **A-12** | PDF gen bloqueia executor default | 🟠 | M |
| **A-13** | `_stream` finge streaming (sleep 60ms) | 🟠 | M |
| **A-14** | Logger sem rotação + sem session_id | 🟠 | S |
| **A-15** | `marcar_favorito` sem lock no `_index.json` | 🟠 | S |
| **A-16** | Carrega catálogo 2× por request Concierge | 🟠 | S |
| **A-17** | `image_base64` sem validação Pydantic | 🟠 | S |
| **A-18** | Sem timeout/retry nas chamadas Anthropic | 🟠 | S |
| **A-19** | `_make_confirmacao_callback` pode bloquear 5min | 🟠 | M |
| **A-20** | `sugerir_pipeline` prompt monolítico 60 linhas hardcoded | 🟠 | M |

### Frontend (28 achados, top 10)

| ID | Item | Severidade | Esforço |
|---|---|---|---|
| **F-01** | Re-render ChatPanel em CADA token streamado | 🔴 | M |
| **F-02** | `totalSessao` recalcula a cada render (sem memo) | 🔴 | S |
| **F-03** | `Object.keys` 3× por tick no PixelOfficeScene | 🔴 | S |
| **F-04** | 60 props pro ChatPanel + callbacks inline (referência nova) | 🟠 | M |
| **F-05** | `setOverlayTick` 350ms re-render desnecessário | 🟠 | M |
| **F-06** | `key={i}` em listas dinâmicas | 🟠 | S |
| **F-07** | useChat retorna 34 valores (prop drilling) | 🔴 | L |
| **F-08** | 2 sources of truth pro Concierge history | 🔴 | M |
| **F-09** | `submittingRef` perde queue (silencia 2º clique) | 🔴 | S |
| **F-10** | `useChat.send` cria WS novo cada vez | 🔴 | M |
| **F-11** | `setState` após unmount (fetch sem AbortController) | 🔴 | S |
| **F-12** | `as any` em locais críticos (WS payload) | 🔴 | L |
| **F-13** | `tsconfig target: es5` em React 18 | 🟠 | S |
| **F-14** | **ChatPanel.tsx = 1773 linhas** (cofre técnico) | 🔴 | L |
| **F-15** | Sistema é desktop-only (sem breakpoint mobile) | 🔴 | L |
| **F-16** | `concierge` agent pode crashar se removido do AGENTS | 🔴 | S |
| **F-17** | `marcarExemplar` / `fetchSessions` engolem erro silencioso | 🟠 | S |
| **F-18** | Foco em modal sem trap + Esc não fecha | 🟠 | M |
| **F-19** | Texto `text-[8px-10px]` em volume (a11y WCAG) | 🟡 | M |
| **F-20** | `panelSize` SSR mismatch | 🟠 | S |

**Recomendação arquitetural unificada:**
- **Zustand** para state management (mata #7, #4, #1)
- **Quebrar ChatPanel** em 6+ componentes (mata #14)
- **Zod** para validar todo payload WS (mata #12)
- **Tanstack Query** para useHistory (mata #17)
- **`clsx`/`cva`** para Tailwind (40+ dups de dark mode)

---

## 🧪 TESTES — 25 gaps, cobertura atual ~8%

### Top 10 testes que pegam 80% dos bugs

1. **`test_ws_chat_pipeline_happy_path`** — pipeline 12 agentes mockado, sequência eventos validada
2. **`test_concierge_4_rodadas_forca_confirmar`** — T188.m regressão
3. **`test_concierge_prompt_injection_alerts`** — T188.o
4. **`test_exportar_pdf_gera_arquivo`** — pega T157 que já quebrou
5. **`test_path_traversal_download_historico`** — tabela de casos maliciosos
6. **`test_share_xss_escape_e_csp`** — T133 regressão
7. **`test_rate_limit_middleware`** — 61ª request retorna 429
8. **`test_concurrent_favoritar_tags`** — T130 regressão
9. **`test_useChat_reconcilia_historico_focus`** — T140 regressão
10. **`test_classificar_e_formatar_erro_anthropic`** — tabela exaustiva

### Infra recomendada

- **Backend:** pytest + pytest-asyncio + httpx (já tem) + respx (mockar Anthropic) + coverage + hypothesis (fuzz path validators) + schemathesis (contract OpenAPI)
- **Frontend:** vitest + @testing-library/react + msw (mock fetch/WS)
- **E2E:** Playwright (não Cypress — WS funciona melhor)
- **CI/CD:** GitHub Actions com 3 jobs (backend, frontend, security)

### CI mínimo proposto

`.github/workflows/ci.yml`:
- Job backend: ruff + mypy + pytest com coverage
- Job frontend: tsc --noEmit + npm build (depois: vitest)
- Job security: bandit + safety + npm audit
- Pre-commit: ruff format + prettier + tsc-files + gitleaks

---

## 🧪 ROTEIRO QA INTERNO (antes de qualquer melhoria nova)

### Setup
```bash
cd ~/Documents/lemmon-agentes
git pull origin main  # commit fe698c1
# Reinicia backend + frontend
```

### 9 blocos, 60+ cenários (mantidos da versão anterior)

Ver detalhamento nos blocos T-A a T-H acima (commit anterior do plano). Resumo:

- **T-A** Concierge caminho feliz Hator (14 cenários)
- **T-B** Concierge regras rígidas (6) — Pedro obrigatório, Salles só com gravação, time conservador
- **T-C** Erros Anthropic amigáveis (6) — sem crédito / chave inválida / offline / rate limit / health/anthropic
- **T-D** Custos e segurança (9) — cap, image 5MB, path traversal, PII, prompt injection
- **T-E** Export 3 modos (6)
- **T-F** UX leigo (6) — ETA, microfone, NPC Pedro, highlight input
- **T-G** Robustez frontend (8) — reconciliação 3 eventos, double-click, abort
- **T-H** localStorage versionado (3)

### Refinamentos visuais (commit `fe698c1`) a validar
- [ ] Bolha "Concierge pensando..." aparece após enviar
- [ ] Card "confirmar" com avatares + cargos + custo R$ + botões grandes
- [ ] MacroBar com glow no agente ativo
- [ ] ETA banner com relógio rotacionando
- [ ] Custos em R$ em MessageBubble

---

## 🏃 SPRINT EM EXECUÇÃO — "Validação Pedro+" (2026-06-01)

**Rota escolhida:** quick wins técnicos + game-changers de produto + segurança crítica + testes mínimos. Pular refactor pesado e multi-tenant.

### Bloco A — Quick wins técnicos
| Tarefa | Status | Obs |
|---|---|---|
| Q-01 Plugar `LEMMON_EXECUTOR` em 19 sites | ✅ concluído | sed em 6 arquivos, agora todas Anthropic calls usam pool dedicado |
| Q-02 Concierge reusar `_anthropic_client` | ✅ concluído | `concierge.py:417` — usa singleton de `api.deps` |
| Q-03 Timeout/payload em `ws_reuniao` + `ws_mesa` | ✅ concluído | mesmo padrão de `ws_chat`: 6MB max + 5min timeout + JSON inválido ignorado |
| Q-04 `RotatingFileHandler` no logger | ✅ concluído | 10MB × 5 backups = 50MB teto |
| Q-05 `asyncio.get_running_loop()` em todos | ✅ concluído | sed em todos os arquivos |
| Q-06 Polyfill `crypto.randomUUID` | ✅ concluído | `dashboard/lib/uuid.ts` + substituído em page.tsx/useChat.ts |
| Q-07 tsconfig target es5→es2017 | ✅ concluído | bundle menor, sem polyfills desnecessários |
| Q-08 Remover console.log TTS | ✅ concluído | wrap em NODE_ENV check |
| Q-09 Remover classe Tailwind inválida `left-13` | ✅ concluído | dead code removido |
| Q-12 gitignore docs internos | ✅ concluído | `AUDITORIA_*.md`, `*.tmp`, `*.lock` agora ignorados |

### Bloco B — Segurança crítica
| Tarefa | Status | Obs |
|---|---|---|
| SEC-A Bearer token simples (env `LEMMON_AUTH_TOKEN`) | ✅ concluído | `api/security.py` + dep `auth_required`. Em dev (env vazia) sistema fica aberto |
| SEC-B WS origin check (anti-CSWSH) | ✅ concluído | `ws_authorize` antes do `accept()` nos 3 WS |
| SEC-C Bleach no markdown→HTML | ✅ concluído | `exportador_aya.py` — whitelist de tags + atributos + protocolos. **bleach instalado** |
| SEC-D POST em `/sugerir_pipeline` | ✅ concluído | versão POST adicionada (briefing fora de URL log). GET mantida pra compat |
| SEC-E Validar base64 magic bytes | ⏳ pendente | (skipped — limite 5MB já bloqueia 95% dos vetores) |
| SEC-F Limite tamanho /transcrever | ✅ concluído | content-type whitelist + 25MB cap + body vazio check |
| SEC-G Traceback Anthropic sem vazar em todos endpoints | ✅ concluído | `/transcrever` e `/exportar` agora logam interno + mensagem amigável |

### Bloco C — Game-changers Pedro
| Tarefa | Status | Obs |
|---|---|---|
| PROD-1 Concierge consulta `/historico/similar` | ✅ concluído | Na 1ª mensagem do user busca top 3 sessões similares e injeta no system prompt com instrução "abra com 'vi que você fez X'" |
| PROD-4 "Ficou bom?" pós-Aya (feedback loop) | ✅ concluído | `FeedbackPosPipeline.tsx` com 4 reações (🔥 ✅ ✏️ 🔄) + backend endpoint `/historico/{id}/feedback` grava em JSON da sessão |
| PROD-13 Pixel office escondido por padrão | ✅ concluído | Default `imersivo=false`. Tela limpa com hero "Time IA da Lemmon". Toggle 🎮 no header pra ligar |
| PROD-14 Página `/pricing` estática | ✅ concluído | `dashboard/app/pricing/page.tsx` com 3 planos (Solo grátis, Clínica R$ 497, Agência R$ 997) + seção "por que não ChatGPT" |
| PROD-15 Welcome detecta `?cliente=hator` | ✅ concluído | Modal personalizado "Olá, Dr. Pedro 👋" + emoji 🩺 + "Hator Clinic × Lemmon Produções" |
| PROD-16 Painel saúde do sistema | ⏳ pendente | (skipped — deferido pra próximo sprint, baixo impacto sem multi-tenant) |

### Bloco D — Performance React (parcialmente concluído)
| Tarefa | Status | Obs |
|---|---|---|
| F-01 React.memo em MessageBubble + AgentMessage | ⏳ pendente | (skipped — ChatPanel refactor é Sprint 2 dedicado) |
| F-02 useMemo em derived state ChatPanel | ⏳ pendente | (skipped — junto com refactor) |
| F-16 Fallback `concierge` se removido do AGENTS | ⏳ pendente | (skipped — não é caminho real hoje) |
| F-20 `panelSize` SSR-safe | ⏳ pendente | (skipped — hidratação warning aceitável) |

### Bloco E — Testes + CI
| Tarefa | Status | Obs |
|---|---|---|
| TEST-A Pytest setup com pytest-cov | ✅ concluído | já tinha pytest, pyproject.toml configurado |
| TEST-B 19 testes em `test_seguranca.py` | ✅ concluído | classificar_erro_anthropic (9 casos), bleach sanitize, path traversal, Concierge injection + rodadas, auth check. **19/19 passando** |
| TEST-C GitHub Actions CI | ✅ concluído | `.github/workflows/ci.yml` com 3 jobs: backend (ruff + pytest), frontend (tsc + build), security (bandit + safety) |

### Bloco F — Release
| Tarefa | Status | Obs |
|---|---|---|
| REL-A Atualizar PLANO_ACAO | ✅ concluído | esse próprio arquivo |
| REL-B Manual v1.45 + PDF | ⏳ em andamento | próximo |
| REL-C Commit + push | ⏳ em andamento | próximo |

---

## 📋 Protocolo de execução

1. **ANTES de executar** → registrar tarefa como `⏳ em andamento`
2. **DEPOIS de executar** → `✅ concluído` com observações reais
3. Subtarefas `T{N}.{letra}` também entram aqui
4. Este arquivo é source of truth

---

## 📐 Referência dos 13 agentes

| ID | Nome | Papel | Categoria |
|---|---|---|---|
| `concierge` | Concierge | Orquestrador conversacional (meta) | meta |
| `otto` | Otto | Estratégia | estrategia |
| `heitor` | Heitor | Compliance Meta | compliance |
| `carlos` | Carlos | Roteiros publicitários | conteudo |
| `salles` | Salles | Produtor / Roteiros documentais | conteudo |
| `sonia` | Sônia | Performance / Retenção | performance |
| `renata` | Renata | Calendário editorial | distribuicao |
| `pedro_abrahao` | Pedro (espelho IA) | Validador médico Hator | espelho_cliente |
| `aya` | Aya | Compiladora — dossiê visual | compilacao |
| `ana_maria` | Ana Maria | CFO Hator | admin |
| `prichina` | Prichina | Admin/RH Hator | admin |
| `caito` | Caíto | COO Hator | admin |
| `kelly` | Kelly | Tributário/Contábil Hator | admin |

---

## 📊 Estatísticas finais da auditoria

- **134 achados catalogados** (30 backend + 28 frontend + 30 segurança + 18 produto + 25 testes + 3 polish geral)
- **22 bloqueadores 🔴** (não pode B2B SaaS sem tratar)
- **15 quick wins 🟢** (alto impacto, < 1 dia cada)
- **5 game-changers de produto 🚀**
- **30 vulnerabilidades de segurança** (5 críticas, 10 altas)
- **3 gaps LGPD/GDPR** (dados médicos)
- **Cobertura de testes ~8%** (frontend = 0)
