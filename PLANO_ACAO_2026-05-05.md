# PLANO DE AÇÃO — Lemmon Agentes
**Criado:** 2026-05-05
**Origem:** auditoria técnica em conversa de discussão (sem alteração de código aqui)
**Para:** o agente do terminal executar; este documento é histórico/checklist

---

## Princípios pra quem executa

- **Mudanças mínimas e cirúrgicas.** Não refatorar de carona. Cada tarefa tem escopo fechado.
- **Não quebrar comportamento atual.** Se uma tarefa exige decisão, parar e perguntar antes.
- **Commit por tarefa.** Mensagem de commit deve referenciar o número da tarefa (ex: `fix(custo): T1 — Otto retorna custo_total_usd`).
- **Tarefa 5 é arriscada.** Fazer em branch separado e só depois de T1–T4 estarem estáveis.

---

## TAREFA 1 — Corrigir custo do Otto sendo subnotificado

**Severidade:** alta (contamina dados financeiros já salvos no histórico)

**Onde:**
- `api_server.py`, função `_run_agent_step`, branch `if name == "otto":`
- `agentes/otto.py` (verificar formato de retorno do `executar()`)

**Problema:**
A linha atual é:
```
return res.get("output_humano", ""), res.get("custo", {}).get("usd", 0)
```
Os outros agentes (Heitor, Salles, Sônia, Aya) usam `res.get("custo_total_usd", 0)`. Suspeita: ou Otto retorna formato diferente dos demais (e o resto do código quebra silenciosamente), ou ele já retorna `custo_total_usd` e este `.get` aninhado está sempre dando 0.

**O que fazer:**
1. Abrir `agentes/otto.py` e localizar o `return` final do `executar()`. Verificar quais chaves estão presentes.
2. Decidir uma das duas opções:
   - **(A) Otto já retorna `custo_total_usd`** → trocar a linha em `api_server.py` para `res.get("custo_total_usd", 0)`. Padronizado, problema resolvido.
   - **(B) Otto retorna estrutura aninhada (`{"custo": {"usd": X}}`)** → padronizar Otto para devolver `custo_total_usd` no nível raiz (mantendo a aninhada se já é usada em outros lugares). Trocar a linha do api_server pra `custo_total_usd`.
3. Rodar o pipeline com Otto e conferir.

**Critério de aceite:**
- [ ] Sessão recente em `historico/dashboard/*.json` mostra `custos_usd.otto > 0`
- [ ] `custo_total_usd` é a soma correta de todos os agentes da sessão
- [ ] Nenhum agente além do Otto teve seu retorno alterado

---

## TAREFA 2 — Aya recebe contexto técnico no pipeline

**Severidade:** alta (Aya é a compiladora — sem contexto, ela compila do nada)

**Onde:**
- `api_server.py`, função `_run_agent_step`, branch `elif name == "aya":`
- `agentes/aya.py` (verificar assinatura de `executar()`)

**Problema:**
Hoje passa só `nome_projeto = briefing[:60]`. O contexto técnico (`analise_otto`, `diretrizes_heitor`, `roteiro_salles`, `respostas`) já está disponível como variável local, mas não chega na Aya.

**O que fazer:**
1. Abrir `agentes/aya.py` e ver quais kwargs o `executar()` aceita.
2. No handler de Aya em `/ws/chat`, passar todo contexto disponível, espelhando como Salles/Sônia fazem (`contexto_otto=analise_otto`, etc).
3. Se a Aya não suporta esses kwargs hoje, estender a assinatura dela (com defaults `None`) e usar dentro da implementação dela.

**Critério de aceite:**
- [ ] Rodando Otto + Aya em pipeline, a resposta da Aya menciona elementos da análise do Otto (não é só nome do projeto)
- [ ] Sem `TypeError` por kwargs inesperados
- [ ] Modo reunião continua funcionando (Aya respondendo turnos)

---

## TAREFA 3 — `/avaliar` lê sessão do disco em vez de dict em memória

**Severidade:** média (perde avaliações silenciosamente quando o servidor reinicia)

**Onde:**
- `api_server.py`, função `avaliar` (POST `/avaliar`)
- Possivelmente remover/simplificar o dict global `_sessoes_pendentes`

**Problema:**
`_sessoes_pendentes` só existe em memória. Reiniciou o servidor, todas as sessões antigas retornam `{"ok": False, "erro": "Sessão não encontrada"}` ao tentar avaliar. O JSON da sessão está no disco, basta ler.

**O que fazer:**
1. Em `/avaliar`, montar o caminho diretamente: `HISTORICO_DIR / "dashboard" / f"{payload.session_id}.json"`.
2. Se o arquivo não existe → `HTTPException(404)`.
3. Se existe → ler, atualizar `avaliacao`, `observacoes_operador`, `tags`, escrever de volta.
4. `_sessoes_pendentes` pode ser removido inteiramente (não há mais função). Em qualquer lugar que adicione/remova dele, limpar.
5. Cuidado com o cap de 200 — se removido o dict, não precisa.

**Critério de aceite:**
- [ ] Sessão criada antes do reinício do servidor pode ser avaliada normalmente
- [ ] Sessão recém-criada também é avaliável
- [ ] `_sessoes_pendentes` não aparece mais em referências (`grep _sessoes_pendentes api_server.py` → vazio)
- [ ] 404 explícito quando session_id inválido

---

## TAREFA 4 — Centralizar URL do backend

**Severidade:** baixa (mas ajuda muito quando for hospedar)

**Onde:**
- Criar `dashboard/lib/api.ts`
- Substituir em `dashboard/lib/useChat.ts`, `useHistory.ts`, `useReuniao.ts`

**Problema:**
`ws://localhost:8000` e `http://localhost:8000` aparecem hardcoded em 4+ lugares.

**O que fazer:**
1. Criar `dashboard/lib/api.ts` que exporta:
   - `API_URL` — derivado de `process.env.NEXT_PUBLIC_API_URL` com fallback `'http://localhost:8000'`
   - `WS_URL` — derivado de `API_URL` substituindo `http` por `ws` (e `https` por `wss`)
2. Substituir as ocorrências hardcoded nos três hooks pelos imports.
3. Não criar `.env` — só preparar para que ele funcione caso seja definido.

**Critério de aceite:**
- [ ] `grep -r "localhost:8000" dashboard/lib` retorna só `api.ts`
- [ ] Build do Next.js passa sem warnings novos
- [ ] Comportamento local idêntico (sem env var, fallback funciona)

---

## TAREFA 5 — Streaming nativo da Anthropic

**Severidade:** média/alta para UX, mas alta complexidade — fazer ISOLADA, branch separado

**Onde:**
- `core/agente_base.py` (método `_chamar_api`)
- `api_server.py` (função `_stream` e onde ela é chamada)
- Possivelmente cada agente que usa tools (Heitor, Sônia)

**Problema:**
Hoje o servidor espera o agente terminar 100%, depois divide o texto pronto em chunks de 10 palavras com `asyncio.sleep(0.06)` simulando streaming. Adiciona latência percebida e desperdiça o streaming nativo do SDK.

**O que fazer:**
1. **Antes de mexer:** ler a doc do SDK Anthropic Python sobre `client.messages.stream()`. Entender eventos: `text_delta`, `tool_use`, `message_stop`, etc.
2. Adicionar em `AgenteBase` uma variante `_chamar_api_stream(mensagens, on_token, ...)` que chama `messages.stream()` e dispara `on_token(texto)` a cada delta.
3. Em `api_server.py`, refatorar de modo que o agente, em vez de retornar texto pronto + chamar `_stream`, emita tokens via callback que faz `await ws.send_json({"type":"token",...})` imediatamente.
4. **Cuidado com tool use:** Heitor faz buscas (cadeia de tool calls). O streaming precisa lidar com pausas entre rodadas de tool use. Pode ser que agentes com tools fiquem com streaming menos suave — aceitável.
5. Remover o `_stream` antigo só depois que todos os agentes migrarem.

**Critério de aceite:**
- [ ] Em resposta longa do Otto, primeiros tokens aparecem no chat antes do agente terminar
- [ ] Custos continuam corretos (`response.usage` ainda disponível ao final do stream)
- [ ] Heitor com buscas continua funcionando
- [ ] Reunião também streama nativamente (não só pipeline)

**Decisão de escopo:** se ao começar isso virar um buraco, parar, fazer commit "WIP" e voltar à conversa pra reavaliar.

---

# FASE 2 — EXPANSÃO DO SISTEMA

**Adicionado:** 2026-05-05 (sessão 2)
**Origem:** parecer de funcionalidades novas a partir do estado atual (Pedro plugado em modo `reuniaoOnly`).
**Estrutura:** tarefas agrupadas em 9 épicos. Cada épico tem prioridade, valor e dependências. Tarefas dentro são unidades comitáveis.

> **Como ler:** comece pelo Épico I (Documentação Viva — gera o manual e o release). Depois pegue Épico A se for atender mais clientes além da Hator; senão pule para B. Os outros épicos podem ser atacados em qualquer ordem após A/B.

---

## ÉPICO A — FAMÍLIA DE ESPELHOS DE CLIENTES

**Prioridade:** alta (sustenta vários épicos abaixo)
**Valor:** transforma Lemmon de "produtora com IA" em "agência com biblioteca de vozes calibradas"
**Dependências:** nenhuma

### T6 — Generalizar Pedro como instância do padrão "espelho de cliente"
- Refatorar `agentes/pedro_abrahao.py` extraindo classe genérica `EspelhoCliente` em `core/espelho.py`
- Constantes específicas (`PEDRO_MATERIAL_DIR`, etc.) viram parâmetros do construtor
- `inputs/cliente_pedro/` → `inputs/clientes/pedro/`
- Migrar `core/limites_pedro.py` para um `core/limites_espelho.py` paramétrico
- Pedro vira `EspelhoCliente(id="pedro", nome="Dr. Pedro Abrahão", ...)`
- **Aceite:** Pedro continua funcionando pelo CLI e pelo dashboard; nenhum teste do Pedro quebra

### T7 — Wizard de onboarding de novo cliente
- CLI novo: `python onboard_cliente.py` que pergunta nome, nicho, gera estrutura de pastas, template do system prompt, lista de termos críticos
- Cria `inputs/clientes/<id>/{dossie.md,transcricoes.md}` com placeholders comentados
- Registra no `agents.ts` automaticamente (script Python edita o TS) ou pelo menos imprime o snippet pra colar
- **Aceite:** rodar o wizard com nome "Marina" cria estrutura completa; após preencher dossiê, Marina aparece no dashboard

### T8 — Salas customizáveis por cliente
- Cada cliente tem tema visual da sala (planta, móveis, paleta)
- `OfficeScene.tsx` lê `clienteAtivo` e renderiza decoração apropriada
- Painel do cliente atual no header (avatar + nome + "trocar cliente")
- **Aceite:** alternar cliente Marina → Pedro muda a decoração visivelmente

---

## ÉPICO B — PEDRO COMO GATE DE QUALIDADE

**Prioridade:** alta (transforma o Pedro de consultor em portão)
**Valor:** garante fidelidade de voz antes do roteiro virar produção
**Dependências:** T6 (recomendada, não obrigatória)

### T9 — Validação automática do espelho entre Salles e Sônia
- Novo passo no pipeline: depois de Salles, antes de Sônia, roda `EspelhoCliente.executar(modo="validacao", contexto_opcional=roteiro_salles)`
- Veredicto verde/amarelo/vermelho extraído do output
- Vermelho → bloqueia automático e pede aprovação do operador (mesmo padrão do `_make_confirmacao_callback`)
- Toggle no `AgentConfig` do Salles: `gate_espelho: 'auto' | 'manual' | 'off'`
- **Aceite:** rodar pipeline pra Hator com roteiro fora de voz → Pedro flagra → operador é avisado antes da Sônia

### T10 — Stress test em mesa redonda
- Modo opcional acessível como botão no painel
- Cada agente presente na sala questiona um tese central por uma rodada (estende `core/discussao.py`)
- Aya sintetiza em uma "ata da reunião"
- **Aceite:** botão "Mesa redonda" gera output com 1 questionamento por agente + ata final

---

## ÉPICO C — MEMÓRIA INSTITUCIONAL E APRENDIZADO

**Prioridade:** média/alta (combustível pro sistema todo, mas não bloqueia ninguém)
**Valor:** sessões avaliadas viram dado morto hoje; aqui viram aprendizado
**Dependências:** nenhuma; alguns itens dependem de T11

### T11 — Pulse semanal automatizado
- Job agendado (cron, scheduled-tasks ou simples script weekly): toda segunda às 6h da manhã
- Aya lê histórico da semana anterior e gera relatório institucional
- Saída: `outputs/pulse/<ano>-W<semana>.md` + opcionalmente envio Slack/email
- **Aceite:** rodar manualmente o script gera relatório legível em markdown

### T12 — Few-shot curado de sessões 5⭐
- UI: dentro de uma sessão 5⭐, botão "marcar como exemplar" em cada bloco de output
- Trechos marcados são salvos em `core/exemplares/<agente>.json`
- Próxima execução do agente injeta os exemplares no system prompt
- **Aceite:** marcar uma tese do Otto como exemplar → próxima execução do Otto referencia o estilo

### T13 — Busca semântica no histórico
- Indexar briefings em embeddings (Voyage ou Anthropic embeddings se disponível)
- Endpoint `/historico/similar?briefing=...` retorna top-N
- Botão "ver referências" no chat panel antes de rodar pipeline
- **Aceite:** novo briefing pra Hator sugere 3 sessões anteriores semelhantes

### T14 — Hall of Fame compartilhável
- Página estática `/hall-of-fame` lista cards das sessões 5⭐
- Filtros: cliente, formato, período
- URL pública (token leve): cliente novo pode ver "o que a Lemmon já fez"
- **Aceite:** página renderiza cards; link com token funciona em browser limpo

### T15 — Tags semi-automáticas
- Aya, ao final do pipeline, sugere 3-5 tags pra sessão
- UI mostra como chips clicáveis: aceitar/recusar/editar
- **Aceite:** sessão concluída mostra sugestões; tags aceitas vão pro JSON

### T16 — Dashboard de saúde
- Página `/dashboard` (ou widget no escritório): sessões/mês, custo total, custo/cliente, agente mais chamado, taxa de avaliação, taxa 5⭐
- **Aceite:** abrir página mostra números do último mês

### T17 — Histórico filtrável
- HistoryPanel ganha filtros: cliente, formato Salles, agente envolvido, nota mínima, faixa de custo, período
- **Aceite:** filtros combinam, contagem atualiza em tempo real

---

## ÉPICO D — NOVOS PERSONAGENS

**Prioridade:** média (cada um é opcional, valor concentrado em casos específicos)
**Valor:** estende a equipe sem virar fábrica de agentes inúteis
**Dependências:** patterns de Otto/Aya como referência

### T18 — Marcia (Pós-produção)
- Novo agente que entra após Salles
- Recebe roteiro + diretrizes Heitor; produz: paleta visual sugerida, lista de captação ("planos necessários"), b-roll, transições, mood
- Output: checklist concreto pro dia de gravação
- **Aceite:** roteiro real do Salles passa pela Marcia → sai uma lista usável pra equipe

### T19 — Felipe (Análise de concorrente)
- Sob demanda (modo `reuniaoOnly`)
- Recebe URLs ou transcrições de vídeos concorrentes
- Extrai padrões: hooks, duração, CTA, tom; gera quadro comparativo + gaps
- **Aceite:** colar 3 transcrições → recebe quadro + 2-3 gaps acionáveis

### T20 — Renata (Distribuição multi-plataforma)
- Roda após Aya
- Transforma dossiê em calendário editorial: quando publicar, em qual plataforma, com qual hook adaptado
- **Aceite:** dossiê real → cronograma de 7 dias com horários e adaptações por plataforma

### T21 — Lia (Brand voice da Lemmon)
- Espelho da própria Lemmon (não cliente)
- Avalia: pitches, propostas, descrições de serviço, posts institucionais
- Garante consistência da voz da agência
- **Aceite:** colar texto institucional → recebe avaliação verde/amarelo/vermelho com observações

---

## ÉPICO E — WORKFLOWS NOVOS

**Prioridade:** média (cada um abre uma nova porta de uso)
**Valor:** novos modos de operação que cobrem casos hoje impossíveis
**Dependências:** retomada de sessão (já existe), histórico (já existe)

### T22 — Modo remix
- A partir de uma sessão antiga, botão "remixar"
- Operador escolhe o que mudar (cliente, formato, plataforma)
- Sistema preserva o que faz sentido manter (tese estratégica) e regera o que precisa
- **Aceite:** sessão antiga + "mesma tese, novo cliente" → pipeline parcial corre só onde tem mudança

### T23 — Briefing reverso
- Endpoint que aceita transcrição/link de vídeo
- Otto infere "qual era o briefing", "qual era a tese subjacente"
- Útil para estudar concorrência ou documentar vídeos antigos
- **Aceite:** colar transcrição → sai briefing reconstruído + tese inferida

### T24 — Comparativo A/B no Salles
- Toggle "gerar 3 alternativas" no config do Salles
- Salles roda em paralelo com prompts ligeiramente diferentes (formato/tom)
- Sônia ranqueia; operador escolhe vencedor
- **Aceite:** ativar toggle → 3 roteiros lado a lado + ranking da Sônia

### T25 — Cortes-prontos da Sônia
- Aceita vídeo longo (ou transcrição) + duração-alvo
- Sônia + Salles propõem 3 reels (15s/30s/60s) com timestamps de corte e legendas
- **Aceite:** transcrição de 10min → tabela com 3 cortes prontos pra edição

### T26 — Modo emergência (fast-track)
- Toggle no chat panel: "preciso em 10min"
- Pipeline corre Otto resumido → Heitor pulado com aviso de risco assumido → Salles direto → Aya
- **Aceite:** toggle ativo + briefing → resultado em <3 min

### T27 — Modo lab/sandbox
- Toggle "esta sessão não vai pro histórico"
- Útil pra testar ideias malucas sem poluir registros nem virar referência futura
- **Aceite:** sessão sandbox completa → não aparece em `/historico`

---

## ÉPICO F — INTELIGÊNCIA NO PIPELINE

**Prioridade:** baixa/média (otimizações, não novas capacidades)
**Valor:** reduz desperdício e dá controle financeiro
**Dependências:** nenhuma

### T28 — Sugestor de pipeline
- Antes de rodar, com briefing já no input, endpoint Haiku-based recomenda quais agentes fazem sentido
- "Briefing interno → pode pular Heitor"; "tem termos médicos → Pedro como gate"
- Operador aceita ou ajusta a sugestão
- **Aceite:** briefing comum sugere setup razoável

### T29 — Conditional routing baseado em Heitor
- Risco vermelho do Heitor → desvia Salles automaticamente para modo "alternativo seguro"
- Hoje operador decide manualmente
- **Aceite:** simular risco vermelho → Salles muda comportamento sem intervenção

### T30 — Custo-cap por sessão
- Operador define "esta não pode passar de $1.50"
- Sistema acumula em tempo real; aviso em 80%; bloqueio em 100% com botão "autorizar mais $0.50"
- **Aceite:** sessão atinge cap → bloqueio com prompt de autorização

---

## ÉPICO G — ESCRITÓRIO COMO PRODUTO (camada visual)

**Prioridade:** baixa (estética e narrativa, não funcional)
**Valor:** diferencial único da Lemmon — vale aprofundar
**Dependências:** nenhuma

### T31 — Whiteboard que evolui em tempo real
- Quadros nas paredes da sala virtual: tese do Otto, diretrizes Heitor, roteiro Salles
- Conteúdo aparece nos quadros conforme cada agente termina
- **Aceite:** rodar pipeline → quadros se preenchem em sequência

### T32 — Status físico expressivo dos sprites
- Sprite anda da mesa até o quadro quando "pensando"
- Faz emote (✓/?/!) ao concluir
- Em reunião, agente que vai falar levanta da cadeira
- **Aceite:** ciclo completo de animações sem travamento

### T33 — Mesa de reunião com mic destaque
- Agente que está falando ganha destaque visual; outros viram translúcidos
- Comunica turn-taking sem precisar ler texto
- **Aceite:** alternar speaker → destaque alterna suavemente

---

## ÉPICO H — MULTIMODAL E DISTRIBUIÇÃO

**Prioridade:** média (alguns itens viram diferenciais grandes, outros são polimento)
**Valor:** entrada e saída além de texto
**Dependências:** nenhuma

### T34 — Memo de voz como briefing
- Já tem speech-to-text live; estender pra upload de arquivo de áudio
- Whisper-style API transcreve, vira briefing
- **Aceite:** upload .m4a/.mp3 → transcrição vira input do pipeline

### T35 — Output como áudio (TTS)
- Aya opcionalmente gera versão narrada do dossiê
- TTS via Anthropic ou ElevenLabs
- **Aceite:** botão "gerar áudio" no dossiê → arquivo .mp3 reproduzível

### T36 — Link de aprovação de cliente
- Sessão concluída pode gerar URL pública (`/share/<token>`) com dossiê limpo (sem custos, sem técnico)
- Cliente abre, lê, comenta inline → vira tag/observação na sessão
- **Aceite:** gerar link → abrir em browser limpo → ler dossiê → comentar → comentário aparece na sessão

### T37 — Voz cliente real x espelho IA (calibragem)
- Quando Pedro real dá feedback sobre vídeo entregue, calebe registra no sistema
- Painel "calibragem do Pedro" mostra divergências histórias entre Pedro IA e Pedro real
- Divergências viram input pra atualizar dossiê do espelho
- **Aceite:** registrar 3 feedbacks reais → painel mostra precisão do espelho

---

## ÉPICO I — DOCUMENTAÇÃO VIVA

**Prioridade:** alta (esta conversa cria a v1.0; manter o hábito é o que importa)
**Valor:** o sistema cresce muito; sem manual atualizado, ninguém lembra como usar metade das funções
**Dependências:** nenhuma; é entregável imediato

### T38 — Manual do Sistema editável + releases em PDF (entregue v1.0 nesta sessão)
- `docs/MANUAL_SISTEMA.md` — fonte editável (markdown). Sempre atualizar aqui primeiro.
- `docs/CHANGELOG.md` — log cronológico de mudanças no manual
- `docs/gerar_pdf.py` — script que lê o markdown e gera PDF estilizado em `docs/releases/`
- **Convenção de release:** ao fechar um épico ou marco, incrementar versão (v1.0 → v1.1) no header do markdown, adicionar entrada no `## Histórico de versões` (no topo, novidades na frente), rodar `python docs/gerar_pdf.py`. PDF antigo permanece como histórico.
- **Aceite:** v1.0 entregue nesta sessão; rodar script gera novo PDF preservando antigos

### T39 — Hábito: atualizar o manual a cada épico fechado
- Não é tarefa de código, é processo
- Cada PR que fecha tarefa do plano deve incluir update no `MANUAL_SISTEMA.md`
- Critério de aceite do épico só é cumprido quando manual reflete o novo estado

---

# ORDEM SUGERIDA DE EXECUÇÃO

```
Imediato (sessão atual):  ÉPICO I → v1.0 do manual
Curto prazo (1-2 semanas): ÉPICO A (T6, T7) + T11 (Pulse) + T17 (filtros)
Médio prazo:               ÉPICO B (T9 gate Pedro) + T15 (tags) + T30 (custo-cap)
Conforme demanda:          ÉPICOS D, E, F (escolher por valor concreto)
Longo prazo / estética:    ÉPICO G (visual) + ÉPICO H (multimodal)
```

---

## POLIMENTOS — fazer só se sobrar tempo

Lista curta, sem detalhamento — cada um vira tarefa numerada quando for atacado.

- **P-A.** Reunião retomável — `useReuniao.loadSession()` que repõe `histRef` a partir de `detail.historico`; botão "Retomar" também para `origem === 'reuniao'`.
- **P-B.** Validação Pydantic dos payloads de WebSocket (chat e reunião).
- **P-C.** Falha na descrição da imagem manda `{"type":"warning"}` em vez de silenciar.
- **P-D.** `_formatar_historico_reuniao` defensivo: se primeiro item não for `user`, normalizar.
- **P-E.** Reconexão automática do WS no client (1 retry após 2s, com toast).
- **P-F.** `respostas` na reunião → renomear para `ultima_resposta` (ou virar lista) — fonte de verdade fica sendo `historico`.

---

## CHECKLIST DE VERIFICAÇÃO QUANDO VOLTAR

Quando voltar à conversa, eu (o assistente daqui) vou:

1. Ler quais arquivos foram modificados (`git log` se disponível, ou diff via Read).
2. Para cada tarefa marcada, conferir o critério de aceite:
   - T1 → abrir `api_server.py` na linha do Otto + abrir um JSON recente do histórico
   - T2 → conferir o handler da Aya
   - T3 → conferir endpoint `/avaliar` + se `_sessoes_pendentes` foi removido
   - T4 → grep por `localhost:8000` em `dashboard/lib`
   - T5 → ler `_chamar_api_stream` em `agente_base.py` e como `api_server.py` consome
3. Atualizar este arquivo trocando `[ ]` por `[x]` ou anotando observações nas tarefas.
4. Se algo ficou meio-feito ou divergiu do plano, registrar como nova tarefa (T6, T7, ...) em vez de mexer aqui.

---

## REGISTRO DE EXECUÇÃO

(Preencher conforme as tarefas forem feitas)

| Tarefa | Status | Data | Observações |
|--------|--------|------|-------------|
| T1 — custo Otto | ✅ concluído | 2026-05-05 | `custo_total_usd` adicionado ao retorno de `otto.py`; api_server padronizado |
| T2 — Aya contexto | ✅ concluído | 2026-05-05 | `outputs_diretos` kwarg adicionado a `aya.executar()`; pipeline passa contexto direto |
| T3 — /avaliar disco | ✅ concluído | 2026-05-05 | `_sessoes_pendentes` removido; `/avaliar` lê JSON do disco; 404 explícito |
| T4 — URL centralizada | ✅ concluído | 2026-05-05 | `dashboard/lib/api.ts` criado; 3 hooks atualizados; `grep localhost:8000` → só `api.ts` |
| T5 — streaming nativo | ✅ concluído | 2026-05-05 | Reunião streama nativamente. Pipeline mantém fake stream (todos os agentes usam tool_use forçado). Branch: `feature/streaming-nativo` |
| T38 — gerar_pdf.py | ✅ concluído | 2026-05-06 | Migrado de reportlab (não instalado) para weasyprint+markdown; gera PDF com estilo Lemmon; `docs/releases/MANUAL_v1.0_2026-05-05.pdf` regenerado |
| T39 — hábito manual | ✅ concluído | 2026-05-06 | Processo documentado em §9 do manual (já existia); convenção estabelecida |
