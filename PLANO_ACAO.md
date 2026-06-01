# Plano de Ação Lemmon Agentes

**Última atualização:** 2026-06-01 (pós-update v2 entregue ao Pedro)
**Histórico completo:** ver `PLANO_ACAO_HISTORICO.md` (4.4k linhas, T1-T193 fechados)

---

## 🎯 Estado atual do sistema

✅ **No ar** (commit `0b6239e` na `main` do GitHub):
- 12 agentes especialistas + Concierge orquestrador conversacional
- Layout pixel-art único (SVG removido)
- Concierge pede confirmação antes de mobilizar time (T188.a)
- Erros Anthropic traduzidos (sem crédito / chave inválida / rate limit / offline)
- Cap automático de custo $0.50/sessão (ceiling $5)
- Custos em R$ pra brasileiro
- CORS restrito, path traversal bloqueado, imagem ≤ 5MB, WS timeout 5min
- 3 modos de export (enxuto / completo / personalizar)
- Banner ETA durante pipeline

📦 **Última entrega:**
- ZIP: `~/Desktop/lemmon-update-2026-06-01-v2.zip` (192KB, 15 arquivos modificados)
- Pedro tem instalação + script `atualizar.sh` com auto-detect

---

## 🧪 ROTEIRO DE TESTES — pré-validação pré-envio Pedro

### Setup
```bash
# 1. Aplicar o patch (na sua máquina) num clone limpo OU
#    rodar o sistema atual depois de pull/restart:
cd ~/Documents/lemmon-agentes
git pull   # se quiser refletir GitHub
# Reinicia backend + frontend pelos scripts/atalho habitual
```

### T-A. Fluxo Concierge — caminho feliz Hator (CRÍTICO)
- [ ] **A1** Abrir sistema novo (limpa localStorage: `localStorage.clear()` no console)
- [ ] **A2** Modal de boas-vindas mostra exemplo "menopausa" (não café)
- [ ] **A3** Header limpo no 1º acesso (sem 🏆 🔍 ✂️ 🎯 SVG/PIX, sem ComplianceToggle)
- [ ] **A4** Empty state do chat tem 3 exemplos clicáveis Hator
- [ ] **A5** Clicar em exemplo "menopausa" → texto preenche o input
- [ ] **A6** Enviar → Concierge responde em ~3s
- [ ] **A7** Concierge faz pergunta (não dispara pipeline direto)
- [ ] **A8** Responder pergunta → próxima rodada
- [ ] **A9** Concierge eventualmente responde tipo `confirmar` propondo time + razões
- [ ] **A10** Responder "ok pode rodar" → pipeline dispara
- [ ] **A11** Pedro (espelho IA) está no time se mencionou menopausa/Hator
- [ ] **A12** Banner ETA aparece "Restam ~X min"
- [ ] **A13** Pipeline termina → toast verde "Dossiê pronto" com 3 botões + share
- [ ] **A14** Custos visíveis em R$ (não USD)

### T-B. Concierge regras rígidas (T188.b/c/d)
- [ ] **B1** Briefing "quero atrair pacientes pra consulta de menopausa" → Concierge inclui `pedro_abrahao`
- [ ] **B2** Briefing "quero roteiros pro Instagram" (só roteiros) → inclui `carlos`, NÃO `salles`
- [ ] **B3** Briefing "vamos gravar entrevista com o médico" → inclui `salles` (produção real)
- [ ] **B4** Briefing simples não vira time inteiro — Concierge propõe 2-4 agentes, não 8

### T-C. Erros Anthropic amigáveis (T193)
- [ ] **C1** Sem crédito (testar com chave de conta vazia OU mock): mensagem "💳 Sem crédito... console.anthropic.com → Billing"
- [ ] **C2** Chave errada no .env (renomear ANTHROPIC_API_KEY): mensagem "🔑 Chave da API inválida ou ausente"
- [ ] **C3** Backend desligado: mensagem "Conexão com servidor perdida. Avise suporte da Lemmon" (sem mencionar Terminal)

### T-D. Custos e segurança
- [ ] **D1** Cap atinge: modal aparece com botões "Autorizar +R$ 2,75" / "+R$ 11,00" / "Parar aqui"
- [ ] **D2** Tentar imagem >5MB: warning "Imagem muito grande, pipeline segue sem contexto visual"
- [ ] **D3** Tentar acessar `/download/../../../etc/passwd`: 400 "session_id contém caracteres não permitidos"
- [ ] **D4** Custo total da sessão fica ~R$ 2-3 (não R$ 8+)

### T-E. Export do dossiê (3 modos)
- [ ] **E1** Toast "Dossiê pronto" aparece após Aya terminar
- [ ] **E2** Clicar "✂️ Só demandas (enxuto)" → baixa PDF só com Carlos + Renata
- [ ] **E3** Clicar "📋 Completo" → baixa PDF da Aya completa
- [ ] **E4** Clicar "⚙️ Personalizar" → fecha toast + aparece ExportMenu abaixo no chat
- [ ] **E5** Selecionar 2-3 checkboxes específicos no ExportMenu → baixa PDF combinado
- [ ] **E6** PDF combinado tem seções nomeadas certas (Carlos = Roteiros publicitários, Salles = Roteiros documentais, etc)

### T-F. UX leigo
- [ ] **F1** Banner ETA aparece e atualiza durante o pipeline
- [ ] **F2** Microfone — negar permissão: toast "🎤 Microfone bloqueado... habilite no ícone do cadeado"
- [ ] **F3** Microfone — sem mic conectado: toast "🎤 Não achei o microfone"
- [ ] **F4** Empty state Auto: 14px legível com 3 exemplos clicáveis
- [ ] **F5** NPC do escritório: hover no Pedro mostra "Pedro (espelho IA) — Validador médico"

### T-G. Robustez WS
- [ ] **G1** Iniciar pipeline → trocar de aba (visibility hidden) → voltar → reconcilia
- [ ] **G2** Cmd+Tab pra outro app → voltar (window blur/focus) → reconcilia
- [ ] **G3** Wi-Fi off → on durante pipeline (online event) → reconcilia
- [ ] **G4** Aplicar duplo-clique no botão de enviar → só dispara 1 fluxo

### T-H. localStorage versionado (T190.C2)
- [ ] **H1** No console: `localStorage.setItem('lemmon-auto-mode', '"valor invalido"')` → reload → não crasha (volta pro default)
- [ ] **H2** Dado novo gravado tem formato `{__v: 1, data: ...}`

---

## ⏳ Pendências (após Pedro validar essa rodada)

### 🔴 Concierge — refactor arquitetural
| ID | Item | Esforço |
|---|---|---|
| **T189.a-e** | Mover Concierge pra `agentes/concierge.py` herdando AgenteBase. Prompt vai pra `prompts/concierge_system_v1.md`. Endpoint vira thin wrapper. Aparece em `/agentes/catalogo` com flag `meta:bool`. | ~3h |

### 🟠 Concierge — polish 12 itens
| ID | Item |
|---|---|
| **T188.e** | Mostrar custo estimado antes de rodar (somar `custo_medio_usd` dos escolhidos) |
| **T188.f** | Concierge consulta `/historico/similar` ao receber briefing |
| **T188.g** | Execução parcial — pipeline em etapas `[[carlos], [sonia, heitor], [aya]]` |
| **T188.h** | Feedback loop pós-pipeline — Concierge volta com "Ficou bom? Iterar ou arquivar?" |
| **T188.i** | Histórico Concierge persiste em refresh (`useLocalStorage('lemmon-concierge-history')`) |
| **T188.j** | Race condition em envios rápidos — disable do input enquanto loading |
| **T188.k** | Imagem sem texto = bolha vazia no chat (mostrar "📷 imagem anexada") |
| **T188.m** | Hard-enforce limite de 4 rodadas no backend (não confiar só no modelo) |
| **T188.n** | Concierge ignorado em modo Reunião → mostrar visual claro "Concierge OFF" |
| **T188.o** | Prompt injection — detectar "ignore instructions" / sanitização básica |
| **T188.p** | Histórico desbalanceado se API falha — gravar user msg só após resposta confirmada |
| **T190.A15** | Concierge propõe defaults inteligentes (linkado T188.d, parcialmente ok) |

### 🟠 UX leigo polish
| ID | Item |
|---|---|
| **T190.B5** | Painel resizável com grip-dots visíveis ou desativar resize no Auto |
| **T190.B6** | Responsividade iPad/mobile — stack vertical < 768px |
| **T190.B8** | Highlight pulsante no input do chat nos primeiros 5s |
| **T190.B10** | Mostrar cargo abaixo do nome do agente durante pipeline (já tem em agents.ts, só usar) |
| **T190.B12** | Calibragem Pedro nunca proposta — Concierge na 1ª sessão Hator: "quer subir vídeos do médico pra calibrar?" |

### 🟡 Estado frontend
| ID | Item |
|---|---|
| **T190.C3** | Concierge history dessincroniza do chat em append duplo |
| **T190.C4** | messages persistido cresce sem cap — debounce setItem 200ms OU só persistir done=true |
| **T190.C5** | send callback closure stale — fastTrack/sandbox/custoCap faltam nas deps |
| **T190.C6** | abort fecha WS mas backend continua queimando custo |
| **T190.C8** | Multi-tab sobrescreve sessão — BroadcastChannel ou storage listener |
| **T190.C9** | Pipeline continua após desconexão WS — detectar disconnect antes de chamadas custosas |
| **T190.C10** | Race agent_done vs fetch /sessoes/medianas (memory leak interval) |
| **T190.C11** | useReuniao histRef cresce ilimitado |
| **T190.C12** | pipeline_done sem session_id deixa órfão — log warn + notify |
| **T190.C13** | reset não cancela polling reconexão |

### 🟢 Backend polish
| ID | Item |
|---|---|
| **T190.D1** | run_in_executor esgota threadpool 40 — ThreadPoolExecutor dedicado max_workers=10 |
| **T190.D2** | Sem prompt caching — perda ~40% custo input (cache_control: ephemeral no system) |
| **T190.D3** | briefing[:60] vaza PII no path — sanitizar ou usar UUID |
| **T190.D5** | Sem rate limit endpoint — slowapi ou middleware IP-based |
| **T190.D6** | Logs podem vazar PII paciente — redactar antes de logar |
| **T190.D7** | Modelo Anthropic hardcoded em concierge — usar resolver_modelo() padrão |
| **T190.D8** | Sem /health/anthropic — ping leve pra confirmar API responde |
| **T190.D9** | TS: erros silenciosos com `any` em useChat — tipar progressivamente |

### 🟡 PixelOfficeScene polish (opcional)
| ID | Item |
|---|---|
| **T185.3f** | Modo reunião: agentes andam pro MEET_CHAR_POS_2D central |
| **T185.3g** | Pan + zoom 2D (wheel/drag/reset) |

---

## 📋 Protocolo de execução (firmado 2026-05-29)

1. **ANTES de executar** → registrar tarefa neste arquivo com status `⏳ em andamento`
2. **DEPOIS de executar** → atualizar pra `✅ concluído` com Observações reais (não planejadas)
3. Se falhar/abandonar → `❌ abandonada` + motivo
4. Subtarefas (`T{N}.{letra}`) também entram aqui
5. Este arquivo é o **source of truth** — TaskCreate interno é só navegação

---

## 📐 Referência rápida — agentes ativos

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
