# Plano de Ação Lemmon Agentes

**Última atualização:** 2026-06-01 (sprint final pré-QA fechado)
**Histórico completo:** `PLANO_ACAO_HISTORICO.md` (T1-T193 fechados)

---

## 🎯 Estado atual

✅ **No ar** (`main` no GitHub):
- 12 agentes especialistas + Concierge orquestrador conversacional
- Layout pixel-art único (SVG removido)
- Concierge com tipo `confirmar` antes de mobilizar time
- Erros Anthropic traduzidos (sem crédito / chave inválida / rate limit / offline)
- Cap automático de custo $0.50/sessão (ceiling $5)
- Custos em R$ pra brasileiro
- CORS restrito, path traversal bloqueado, imagem ≤ 5MB, WS timeout 5min
- 3 modos de export (enxuto / completo / personalizar)
- Banner ETA durante pipeline
- Rate limit 60/min por IP
- ThreadPool dedicado 10 workers
- Endpoint `/health/anthropic` valida credencial sem custo
- Custo estimado por sessão exibido em "confirmar"
- Histórico Concierge persiste em refresh
- Anti prompt injection
- Hard-enforce limite 4 rodadas

🚫 **NÃO entregar atualização pro Pedro até completar QA interno.**

---

## 🧪 ROTEIRO QA INTERNO — pre-aprovação

### Preparação
```bash
cd ~/Documents/lemmon-agentes
git pull origin main
# Reinicia backend + frontend pelos scripts
```

### Bloco 1 — Concierge caminho feliz Hator
| # | Cenário | Esperado |
|---|---|---|
| 1.1 | Limpar localStorage (`localStorage.clear()`) e reabrir | Modal "menopausa" + header limpo (sem 🏆 🔍 ✂️ 🎯 + sem ComplianceToggle) |
| 1.2 | Empty state mostra 3 exemplos clicáveis Hator | Sim |
| 1.3 | Clicar exemplo "menopausa" | Texto preenche input |
| 1.4 | Input com highlight pulsante verde nos primeiros 5s | Sim |
| 1.5 | Enviar briefing simples | Concierge responde em ~3s com pergunta |
| 1.6 | Responder pergunta 1x | Concierge eventualmente responde tipo `confirmar` |
| 1.7 | Mensagem de "confirmar" lista agentes + razões | Sim |
| 1.8 | Toast info aparece com "💰 Custo estimado: R$ X,XX" | Sim |
| 1.9 | Briefing menciona "menopausa/Hator/Pedro" | `pedro_abrahao` aparece no time |
| 1.10 | Responder "ok pode rodar" | Pipeline dispara |
| 1.11 | Banner verde ETA aparece | "Restam ~X min — não feche a aba" |
| 1.12 | MacroBar mostra cargo abaixo do nome | Sim ("Estratég.", "Roteiri.", etc) |
| 1.13 | Pipeline termina | Toast verde "🎉 Dossiê pronto!" com 3 botões + share |
| 1.14 | Custos em R$ no chip | Sim, formato "R$ 2,75 / R$ 2,75" |

### Bloco 2 — Concierge regras rígidas
| # | Cenário | Esperado |
|---|---|---|
| 2.1 | Briefing "roteiros pro Instagram" | Inclui `carlos`, NÃO `salles` |
| 2.2 | Briefing "vamos gravar entrevista AO VIVO com médico" | Inclui `salles` (produção real) |
| 2.3 | Briefing "calendário editorial pro mês" | `renata` + `aya` apenas (2 agentes) |
| 2.4 | Briefing genérico simples | Concierge não convoca 6+ agentes (default conservador) |
| 2.5 | Briefing puro Hator | `pedro_abrahao` obrigatoriamente |
| 2.6 | Continuar conversando 5x sem chegar a "confirmar" | 5ª resposta força `confirmar` (T188.m) |

### Bloco 3 — Erros Anthropic amigáveis
| # | Cenário | Esperado |
|---|---|---|
| 3.1 | Sem crédito na conta Anthropic | Toast "💳 Sem crédito... console.anthropic.com → Billing" |
| 3.2 | Chave inválida no `.env` | Toast "🔑 Chave da API inválida ou ausente" |
| 3.3 | Backend desligado | Toast "Conexão com servidor perdida" (sem mencionar Terminal) |
| 3.4 | Sem internet | Toast "🌐 Sem conexão com a API Anthropic" |
| 3.5 | Rate limit Anthropic atingido | Toast "⏳ Limite de chamadas atingido" |
| 3.6 | `GET /health/anthropic` | `{"status":"ok"}` se OK; `{"kind":"sem_credito",...}` se sem crédito |

### Bloco 4 — Custos e segurança
| # | Cenário | Esperado |
|---|---|---|
| 4.1 | Não enviar custoCap pro WS | Backend usa default $0.50 (cap forçado server) |
| 4.2 | Tentar custoCap=999 | Backend limita a $5 (ceiling) |
| 4.3 | Anexar imagem > 5MB | Warning "Imagem muito grande" + pipeline segue sem visão |
| 4.4 | Tentar GET `/download/../../etc/passwd` | 400 "session_id inválido" |
| 4.5 | Briefing com PII (CPF, nome) | Logs não vazam dados sensíveis (verificar) |
| 4.6 | Briefing 6MB no WS | Backend desconecta com 1009 + msg amigável |
| 4.7 | Briefing com "ignore instructions" | Concierge NÃO revela system prompt |
| 4.8 | Cap atinge | Modal "R$ 2,75 / R$ 2,75" + botões "Autorizar +R$ X" / "Parar aqui" |
| 4.9 | 60+ requests/min do mesmo IP | 429 "Limite de chamadas atingido" |

### Bloco 5 — Export do dossiê
| # | Cenário | Esperado |
|---|---|---|
| 5.1 | Toast "Dossiê pronto" aparece | Sim, persistente (não auto-dismiss) |
| 5.2 | Clicar "✂️ Só demandas (enxuto)" | Baixa PDF só com Carlos/Salles + Renata |
| 5.3 | Clicar "📋 Completo" | Baixa PDF da Aya completa |
| 5.4 | Clicar "⚙️ Personalizar" + 3 checkboxes | Baixa PDF combinado das seções escolhidas |
| 5.5 | PDF tem seções nomeadas certas | "Roteiros (Carlos)", "Roteiros (Salles)", "Análise financeira (CFO)" etc |
| 5.6 | Sessão Hator admin (ana_maria) | PDF exporta com label "Análise financeira (CFO)" |

### Bloco 6 — UX leigo
| # | Cenário | Esperado |
|---|---|---|
| 6.1 | Banner ETA durante pipeline | Aparece e atualiza em tempo real |
| 6.2 | Microfone — negar permissão browser | Toast "🎤 Microfone bloqueado... cadeado" |
| 6.3 | Microfone — sem mic conectado | Toast "🎤 Não achei o microfone" |
| 6.4 | Empty state Auto | 14px legível + 3 exemplos clicáveis |
| 6.5 | Hover NPC Pedro no escritório | Tooltip "Pedro (espelho IA) — Validador médico" |
| 6.6 | Input do chat no 1º acesso | Highlight pulsante verde 5s |

### Bloco 7 — Robustez frontend
| # | Cenário | Esperado |
|---|---|---|
| 7.1 | Trocar de aba durante pipeline → voltar | Reconcilia via histórico |
| 7.2 | Cmd+Tab → voltar | Reconcilia (window.focus) |
| 7.3 | Wi-Fi off → on | Reconcilia (online event) |
| 7.4 | Duplo-clique no botão enviar | Só dispara 1 fluxo (submittingRef) |
| 7.5 | Clicar Abort durante pipeline | Backend para imediatamente (WS cancel) |
| 7.6 | Refresh durante "confirmar" | Histórico Concierge persiste (vê na próxima abertura) |
| 7.7 | F5 com sessão rodando | Estado parcial preservado + reconciliação dispara |
| 7.8 | Enviar 5 mensagens rápido (race condition) | Histórico fica balanceado, sem duplicação |

### Bloco 8 — localStorage versionado
| # | Cenário | Esperado |
|---|---|---|
| 8.1 | `localStorage.setItem('lemmon-auto-mode', 'invalido')` + reload | Não crasha, volta pro default |
| 8.2 | Dado novo gravado | Formato `{__v: 1, data: ...}` |
| 8.3 | Bump schemaVersion num hook | Reset limpo + console.info |

### Bloco 9 — Backend escalabilidade
| # | Cenário | Esperado |
|---|---|---|
| 9.1 | 5 abas rodando pipeline simultâneo | Backend não trava `/health` (executor dedicado) |
| 9.2 | `GET /health/anthropic` durante pipeline | Responde rápido (não bloqueia) |
| 9.3 | Modelo Anthropic override via env | `LEMMON_MODELO_CONCIERGE=claude-sonnet-4-5` funciona |
| 9.4 | sanity_check falha no startup | Backend sobe mesmo assim com log warning |

---

## ⏳ Pendências (não bloqueiam Pedro)

### Refactor arquitetural — pode ficar pra próxima rodada
| ID | Item |
|---|---|
| **T189.a-e** | Mover Concierge pra `agentes/concierge.py` herdando AgenteBase. Decisão: deixar como está enquanto está estável. Refactor não muda comportamento, apenas organização |

### Features novas (não bugs)
| ID | Item |
|---|---|
| **T188.f** | Concierge consulta `/historico/similar` ao receber briefing |
| **T188.g** | Execução parcial — pipeline em etapas |
| **T188.h** | Feedback loop pós-pipeline ("ficou bom? iterar?") |
| **T190.B12** | Calibragem Pedro proativa na 1ª sessão Hator |

### Polish opcional
| ID | Item |
|---|---|
| **T188.n** | Aviso visual "Concierge OFF" em modo Expert/Reunião |
| **T190.B5** | Painel resizable com handles visíveis |
| **T190.B6** | Responsividade iPad/mobile < 768px |
| **T190.C8** | Multi-tab sobrescreve sessão (BroadcastChannel) |
| **T190.C10/11** | Memory leaks sutis em refs |
| **T190.D2** | Prompt caching Anthropic (~40% economia input) |
| **T190.D9** | Tipar `any` em useChat progressivamente |
| **T185.3f/g** | PixelOfficeScene: modo reunião + pan/zoom |

---

## 📋 Protocolo de execução

1. **ANTES de executar** → registrar como `⏳ em andamento`
2. **DEPOIS de executar** → atualizar pra `✅ concluído` com observações reais
3. Subtarefas `T{N}.{letra}` também entram aqui
4. Este arquivo é source of truth — TaskCreate é navegação

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
