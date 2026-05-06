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

# FASE 3 — QA E CORREÇÕES PÓS-IMPLEMENTAÇÃO

**Adicionado:** 2026-05-06 (sessão 3)
**Origem:** auditoria QA completa após Épicos C/E/F/G/H/I (manual em v1.7).
**Estrutura:** 3 tarefas críticas (bloqueiam uso com cliente externo) + 8 médias (qualidade). Atacar em ordem.

> **Princípio especial desta fase:** as tarefas críticas (T40, T41) precisam ser fechadas **antes** de gerar qualquer link de aprovação real para o Hator ou outro cliente externo. Hoje a feature está implementada mas insegura e quebrada.

---

## CRÍTICAS (bloqueiam uso com cliente real)

### T40 — Corrigir endpoint `/share` quebrado (T36 inteiro não funciona)

**Severidade:** crítica · **Onde:** `api_server.py`, função `criar_share` (~linha 445)

**Problema:**
- Linha 449 faz `for f in sorted(HISTORICO_DIR.glob("*.json"), reverse=True)` — **path errado**: as sessões estão em `HISTORICO_DIR / "dashboard"`, não na raiz.
- Linha 452 compara com `data.get("session_id")` — campo que **não existe nos JSONs salvos** (o session_id vem do nome do arquivo, não do conteúdo).
- Resultado: `POST /share` sempre retorna 404 "Sessão não encontrada". Toda T36 (link de aprovação) está broken.

**O que fazer:**
1. Trocar o loop de busca por leitura direta:
   ```python
   session_dir = HISTORICO_DIR / "dashboard"
   sessao_path = session_dir / f"{payload.session_id}.json"
   if not sessao_path.exists():
       raise HTTPException(404, "Sessão não encontrada")
   sessao = json.loads(sessao_path.read_text(encoding="utf-8"))
   ```
2. O resto da função (gerar token, salvar share JSON) permanece igual.

**Critério de aceite:**
- [ ] `POST /share` com session_id válido retorna `{token: "..."}`
- [ ] Abrir `GET /share/{token}` no navegador mostra a página de aprovação preenchida
- [ ] Sem mudança no formato do JSON salvo em `historico/`

---

### T41 — Escapar HTML no `/share/{token}` para prevenir XSS

**Severidade:** crítica · **Onde:** `api_server.py`, função `ver_share` (~linha 476) e `comentar_share`

**Problema:**
Briefing, respostas de agentes, autor e texto de comentários são interpolados direto no HTML sem escape:
```python
blocos_html += f"<pre class='agent-content'>{txt}</pre>"
<div class="briefing">{briefing[:500]}</div>
<strong>{c["autor"]}</strong>: {c["texto"]}
```
Um briefing ou comentário com `<script>...</script>` é executado no browser do próximo visitante. Risco direto: o link compartilhado com cliente fica vulnerável.

**O que fazer:**
1. Importar `from html import escape as html_escape`.
2. Aplicar `html_escape(...)` em **toda string interpolada no HTML** de `ver_share`: briefing, txt (resposta do agente), autor e texto dos comentários.
3. Em `comentar_share`, validar payload:
   - rejeitar se `len(texto) > 2000` ou `len(autor) > 80`
   - rejeitar texto vazio (após strip)
4. Considerar adicionar rate limit simples por token (ex: máx 20 comentários por share) — opcional mas recomendado.

**Critério de aceite:**
- [ ] Comentário com `<script>alert('xss')</script>` aparece como texto literal, não executa
- [ ] Briefing com HTML é renderizado escapado
- [ ] Comentário com 5000 chars retorna erro 400
- [ ] Comentário vazio retorna erro 400

---

### T42 — Regularizar versionamento de PDFs do manual

**Severidade:** crítica de processo · **Onde:** `docs/releases/`

**Problema:**
Manual está em v1.7 mas `docs/releases/` só tem v1.0, v1.1 e v1.2. Os épicos C/E/F/G/H foram entregues sem gerar PDF correspondente. Quebra a regra que o próprio manual define em §9.3.

**O que fazer:**
1. Rodar `python docs/gerar_pdf.py` agora — gera `MANUAL_v1.7_2026-05-06.pdf`. Esse é o estado atual.
2. **Decisão a tomar:**
   - **Opção A (pragmática, recomendada):** aceitar que houve "salto" v1.2 → v1.7 e seguir adiante. PDFs intermediários ficam ausentes para sempre. Adicionar nota no CHANGELOG explicando.
   - **Opção B (purista):** voltar manualmente o cabeçalho do markdown a v1.3, gerar PDF; v1.4, gerar; v1.5, gerar; v1.6, gerar. Trabalho extra de ~5 minutos por versão. Resultado: histórico íntegro.
3. Adicionar gancho automático no fluxo de "fechar épico": commit que muda versão do manual deve obrigar geração do PDF (pode ser hook git ou simplesmente disciplina + checklist).

**Critério de aceite:**
- [ ] `docs/releases/MANUAL_v1.7_2026-05-06.pdf` existe e abre corretamente
- [ ] Decisão A ou B documentada no CHANGELOG
- [ ] Nenhum PDF antigo apagado (v1.0/v1.1/v1.2 preservados)

---

## MÉDIAS (qualidade e robustez)

### T43 — Atualizar `REGISTRO DE EXECUÇÃO` no plano

**Severidade:** média de processo · **Onde:** este arquivo, tabela final

**Problema:** Tabela só lista T1-T5 + T38 + T39. Mas T6, T7, T8, T9, T10, T11-T17, T22-T27, T28-T30, T31-T33, T34-T37 foram implementados (manual confirma). Plano fica como fonte enganosa.

**O que fazer:**
1. Adicionar uma linha por tarefa concluída na tabela.
2. Para épicos inteiros, agrupar: `T11-T17 (Épico C)`, `T22-T27 (Épico E)`, etc.
3. Marcar quais ficaram parcialmente implementadas (ex: T11 manual, sem cron — ver T49 abaixo).

**Critério de aceite:**
- [ ] Tabela reflete o estado real
- [ ] Tarefas com pendência têm coluna "Observações" preenchida

---

### T44 — Bug de UI no comparativo A/B do Salles

**Severidade:** média · **Onde:** backend `api_server.py:_run_salles_alternativas`, frontend `dashboard/lib/useChat.ts:153-159`

**Problema:**
Backend manda `agent_start salles` 3 vezes (uma por variante). Frontend faz `currentMsgId.current[data.agent] = msgId` toda vez — **só o último ID persiste**. As 3 variantes streamadas viram conteúdo da última bolha; as duas primeiras viram fantasmas no array.

**O que fazer (escolher uma das opções):**
- **Opção A — backend muda agent ids:** mandar `salles_v1`, `salles_v2`, `salles_v3` em `agent_start` e `token`. Frontend trata como 3 agentes distintos. Mais limpo.
- **Opção B — frontend deduplica via msg_id:** receber um campo `msg_id` único do backend em cada `agent_start` e usar isso como chave em vez do `agent`.

**Antes de mexer:** rodar pipeline com `alternativas: 3` no navegador e confirmar visualmente o bug. Se as 3 mensagens aparecem corretas, o bug pode estar mascarado pela ordem de eventos React e a tarefa vira só validação.

**Critério de aceite:**
- [ ] Pipeline com 3 variantes mostra 3 bolhas distintas, cada uma com seu texto
- [ ] Custos das 3 variantes aparecem somados no total da sessão
- [ ] Sônia continua recebendo as 3 versões para ranqueamento

---

### T45 — Validar valor positivo no `autorizar_custo`

**Severidade:** baixa · **Onde:** `api_server.py:_verificar_custo_cap` (~linha 966)

**Problema:**
`custo_cap_autorizado += float(ctrl.get("valor", 0.5))` aceita qualquer valor. Se o cliente mandar `valor: 0` ou negativo, o cap não sobe e cai em loop infinito de "cap atingido".

**O que fazer:**
Adicionar piso mínimo:
```python
incremento = max(0.1, float(ctrl.get("valor", 0.5)))
custo_cap_autorizado += incremento
```

**Critério de aceite:**
- [ ] Mandar `autorizar_custo` com valor 0 incrementa pelo menos $0.10
- [ ] Comportamento normal (0.5/2.0) inalterado

---

### T46 — Heurística de risco vermelho do Heitor mais robusta

**Severidade:** média · **Onde:** `api_server.py:763`

**Problema:**
Detecção atual: `if "🔴" in output_humano or "risco_geral: vermelho" in str(diretrizes_heitor or ""):`. Frágil: se Heitor trocar emoji por palavra, ou se `output_tecnico` mudar formato, o gate condicional para de funcionar silenciosamente.

**O que fazer:**
Ler do output_tecnico estruturado:
```python
risco = (diretrizes_heitor or {}).get("risco_geral", "").lower()
if risco in ("vermelho", "red", "high"):
    heitor_risco_vermelho = True
```
Manter o emoji como fallback se necessário.

**Critério de aceite:**
- [ ] Heitor com `risco_geral: "vermelho"` no JSON técnico ativa routing condicional
- [ ] Heitor com emoji 🔴 mas sem campo técnico ainda funciona (fallback)

---

### T47 — Calibragem do Pedro com autocomplete de session_id

**Severidade:** média de UX · **Onde:** `dashboard/app/calibragem/page.tsx`

**Problema:**
Campo `session_id` é input texto livre. Operador digita errado, ou esquece. Risco: registros de calibragem desconectados de sessões reais.

**O que fazer:**
1. Buscar `GET /historico` ao montar a página, filtrar últimas 20 sessões com Pedro envolvido.
2. Trocar input por combo (datalist/select) com session_id + briefing truncado.
3. Permitir mesmo assim entrada livre (caso a sessão seja antiga e não esteja na lista).

**Critério de aceite:**
- [ ] Dropdown mostra últimas 20 sessões com Pedro
- [ ] Selecionar uma preenche o campo automaticamente
- [ ] Entrada manual continua possível

---

### T48 — Onboard wizard com `idleQuote` placeholder

**Severidade:** baixa · **Onde:** `onboard_cliente.py:177`

**Problema:**
Snippet TS gerado tem hardcoded `'Avaliando pela ótica do cliente...'` — duplicado do Pedro. Operador colando 3 clientes novos termina com 3 frases iguais.

**O que fazer:**
Trocar para placeholder explícito que force atenção:
```python
idleQuote: 'TODO: defina a frase de fundo de {nome_curto}',
```

**Critério de aceite:**
- [ ] Wizard novo gera snippet com `TODO:` visível
- [ ] Operador vê e personaliza antes de colar

---

### T49 — Documentar automação do Pulse semanal

**Severidade:** baixa de processo · **Onde:** `docs/MANUAL_SISTEMA.md` §5 ou §8

**Problema:**
T11 do plano original pedia "automatizado, toda segunda 6h". Script `pulse_semanal.py` existe e roda manual, mas a parte "automático" não está cumprida.

**O que fazer:**
1. Adicionar seção no manual com snippet de cron (Linux/Mac):
   ```
   0 6 * * 1 cd /Users/calebe/Documents/lemmon-agentes && python scripts/pulse_semanal.py
   ```
2. Alternativa launchd para Mac (criar `com.lemmon.pulse.plist`).
3. Alternativa GitHub Actions/scheduled-task se um dia for hospedado.

**Critério de aceite:**
- [ ] Manual tem instrução clara de como agendar
- [ ] Calebe consegue rodar o snippet e ver pulse aparecendo na segunda seguinte

---

### T50 — Página `/share/[token]` renderizada no Next.js

**Severidade:** baixa (depende de plano de hosting) · **Onde:** `dashboard/app/share/[token]/page.tsx`

**Problema:**
Página atual faz `window.location.replace(\`${API_URL}/share/${token}\`)` — manda o cliente para o backend FastAPI direto. Em dev local funciona. Em produção, se backend e dashboard ficarem em domínios diferentes, o cliente externo termina em URL sem branding da Lemmon.

**O que fazer:**
1. Criar endpoint backend `GET /share/{token}.json` (puro JSON, sem HTML).
2. Página Next.js puxa via fetch e renderiza com componentes próprios (Tailwind, branding Lemmon).
3. Endpoint HTML atual (`GET /share/{token}` retornando HTMLResponse) pode ficar como fallback ou ser removido.

**Critério de aceite:**
- [ ] Cliente abrindo `/share/<token>` no domínio do dashboard vê página renderizada com identidade Lemmon
- [ ] Sem redirecionamento para outro domínio
- [ ] Comentários continuam funcionando (POST para backend)

---

# ORDEM SUGERIDA DA FASE 3

```
Imediato (mesmo dia):     T40 + T41 + T42 (críticas — bloqueiam cliente real)
Próxima sessão:           T43 (registro) + T44 (bug A/B Salles)
Quando puder:             T45, T46, T47, T48, T49, T50
```

---

# FASE 4 — BUGS DESCOBERTOS NA BATERIA DE TESTES E2E

**Adicionado:** 2026-05-06 (sessão 4)
**Origem:** bateria de testes manual no Chrome em `localhost:4000` rodando 14 de 23 cenários planejados. Custo total da bateria: ~$1.19. Janela coincidiu com `overloaded_error` na API Anthropic — alguns achados podem estar amplificados, mas o padrão sistêmico de tratamento de erro persiste mesmo em janela limpa.
**Estrutura:** 5 críticas, 4 médias, 1 cosmética agrupada.

> **Padrão sistêmico identificado:** três endpoints auxiliares (`/sugerir_pipeline`, `/briefing_reverso`, `/cortes_prontos`) e o WebSocket de reunião não tratam erros LLM com mensagem amigável — frontend mostra "Failed to fetch" ou repr de dict cru. O endpoint `/transcrever` está correto (T21 passou) e serve de modelo. Vale **fazer T52 e T53 ANTES** das outras: muitos bugs aparentes podem ser sintoma de erro de upstream mascarado.

---

## CRÍTICAS

### T51 — Parse de menções em reunião não casa nomes curtos com IDs compostos

**Severidade:** crítica · **Onde:** `api_server.py:_parse_mentions` (~linha 1101)

**Problema:**
Quando o operador escreve `@pedro` no chat de reunião, o regex tenta casar com o id `pedro_abrahao` e falha. Como `mentioned` fica vazio e o modo manual não está ativo, **todos os agentes presentes respondem** em vez de só o Pedro. Foi exatamente o que aconteceu no teste T10: Otto e Heitor responderam, Pedro nunca respondeu.

**O que fazer:**
1. Construir mapping `nome_curto → id` a partir do `agents.ts` ou hardcoded em Python:
   ```python
   AGENTE_ALIAS = {
       "otto": "otto", "heitor": "heitor", "salles": "salles",
       "sonia": "sonia", "aya": "aya",
       "pedro": "pedro_abrahao",  # alias do nome curto
   }
   ```
2. `_parse_mentions` deve testar tanto o id direto quanto qualquer alias que aponte para um id presente em `agents`.
3. Se um cliente novo for adicionado via wizard, o alias dele deve entrar nessa lista (documentar no onboard_cliente.py).

**Critério de aceite:**
- [ ] `@pedro o que você acha de X?` em reunião com Pedro presente faz **só Pedro** responder
- [ ] `@pedro_abrahao` (id completo) também funciona
- [ ] Outras menções (`@otto`, `@heitor`) seguem funcionando
- [ ] Se mencionar agente não presente na sala, é ignorado (comportamento atual)

---

### T52 — Padronizar tratamento de erro 503 em endpoints LLM-based (sistêmico)

**Severidade:** crítica · **Onde:** `api_server.py` em `/sugerir_pipeline`, `/briefing_reverso`, `/cortes_prontos`

**Problema:**
- `POST /briefing_reverso` retorna 503 sem detail → frontend mostra "Failed to fetch"
- `POST /cortes_prontos` mesma coisa
- `GET /sugerir_pipeline` mesma coisa, e botão fica sem feedback visual
- Quando a API Anthropic falha (overloaded, rate limit, key inválida), os endpoints simplesmente quebram

**Modelo a seguir:** `/transcrever` já faz certo:
```python
if not openai_key:
    raise HTTPException(503, "OPENAI_API_KEY não configurada. ...")
try:
    ...
except Exception as exc:
    raise HTTPException(500, f"Erro na transcrição: {exc}")
```

**O que fazer:**
1. Envolver as chamadas Anthropic em cada endpoint com try/except específico para `APIError`, `RateLimitError`, `AuthenticationError`.
2. Cada exceção mapeia para um `HTTPException` com `detail` legível em pt-BR:
   - `overloaded_error` → "API Anthropic temporariamente sobrecarregada. Tente em 30 segundos."
   - `rate_limit_error` → "Limite de chamadas atingido. Aguarde alguns segundos."
   - `authentication_error` → "Chave da API inválida. Verifique ANTHROPIC_API_KEY."
3. Frontend de cada feature (briefing-reverso, cortes, sugerir-agentes) precisa renderizar `error.detail` em vez de "Failed to fetch".

**Critério de aceite:**
- [ ] Forçar overloaded_error (mockar) e ver mensagem humana em todos os 3 endpoints
- [ ] Forçar key inválida e ver mensagem clara
- [ ] Frontend de cada feature mostra a mensagem do `detail` em UI legível

---

### T53 — Erros da API Anthropic vazando como repr de dict no chat

**Severidade:** crítica · **Onde:** `core/agente_base.py:_chamar_api` e `_chamar_api_stream` + `api_server.py /ws/reuniao` exception handler

**Problema:**
Durante o teste T10, o chat exibiu literalmente:
```
Erro da API Anthropic: {'type': 'error', 'error': {'details': None,
'type': 'overloaded_error', 'message': 'Overloaded'}, 'request_id':
'req_011CamaJsNtrMBEhTzRXHPM5'}
```
Isso é resultado de `f"Erro da API Anthropic: {e}"` onde `e` é um `APIError` com repr feio. Cliente não entende, expõe `request_id` interno, parece bug em vez de capacidade temporária.

**O que fazer:**
1. Em `core/agente_base.py` (ou criar helper `core/erros.py`):
   ```python
   def formatar_erro_anthropic(e):
       msg = str(getattr(e, "message", "")) or str(e)
       if "overloaded" in msg.lower():
           return "API temporariamente sobrecarregada. Tente em 30s."
       if "rate_limit" in msg.lower():
           return "Limite de chamadas atingido. Aguarde."
       return f"Erro temporário: {msg[:200]}"
   ```
2. Substituir `raise RuntimeError(f"Erro da API Anthropic: {e}")` pelo formatador em `_chamar_api`, `_chamar_api_stream` e em qualquer try/except de chamada Anthropic no `api_server.py`.
3. Em `/ws/reuniao` e `/ws/chat`, ao mandar `agent_error`, o `error` enviado deve ser a string formatada, não o `str(exception)` cru.

**Critério de aceite:**
- [ ] Chat nunca mostra `{'type': 'error', ...}` como string Python
- [ ] Mensagem clara em pt-BR para overloaded e rate_limit
- [ ] `request_id` interno não aparece pro operador

---

### T54 — URL inconsistente entre header link e página de cortes-prontos

**Severidade:** média/crítica de UX · **Onde:** `dashboard/app/page.tsx` (header) e `dashboard/app/cortes/...` ou `dashboard/app/cortes-prontos/...`

**Problema:**
Link do header aponta para `/cortes`, mas existe (ou deveria existir) `/cortes-prontos`. Resultado: 404 ao clicar no ícone ✂️.

**O que fazer:**
1. Decidir o nome canônico (sugiro `/cortes`, mais curto).
2. Renomear pasta da página se necessário (`dashboard/app/cortes-prontos/` → `dashboard/app/cortes/`).
3. Conferir se há outras referências a um ou outro nome (`grep -r "cortes-prontos\|/cortes" dashboard/`).
4. Atualizar manual `§4` se citar nome antigo.

**Critério de aceite:**
- [ ] Click no ícone ✂️ no header abre a página
- [ ] Sem 404 em nenhum link interno

---

### T55 — Tags sugeridas não estão sendo geradas (T15 documentado mas vazio)

**Severidade:** crítica · **Onde:** `api_server.py /ws/chat` (~linha 1071)

**Problema:**
Pipeline 5 agentes do teste T1 concluiu normalmente, mas o JSON da sessão tem `"tags": []` e nenhum chip apareceu na UI. Manual diz que Aya/Haiku gera 3-5 tags ao final.

**Hipóteses:**
- O try/except do bloco está engolindo erros silenciosamente (linha 1090). Se Haiku falhar, nada acontece.
- Pode ter coincidido com a janela de overloaded_error.

**O que fazer:**
1. Adicionar log explícito quando o bloco de tags falha (em vez de `except: pass`).
2. Mandar evento `tags_sugeridas_falhou` para o frontend quando der erro, com `detail`.
3. Reproduzir um pipeline limpo (sem overloaded). Se ainda assim não gerar tags, investigar o prompt do Haiku ou o parse das tags.
4. Considerar fallback: se o Haiku falhar, mandar lista de tags inferidas heuristicamente do briefing (até como sinal mínimo).

**Critério de aceite:**
- [ ] Pipeline normal pós-fix gera 3-5 tags como chips na UI
- [ ] Quando falha, log do servidor mostra a causa
- [ ] Frontend recebe sinal de falha (não fica em estado pendente)

---

## MÉDIAS

### T56 — Whiteboard ao vivo (T31) não está visível no DOM

**Severidade:** média · **Onde:** `dashboard/components/office/OfficeScene.tsx`

**Problema:**
`querySelector('[class*=whiteboard]')` retorna 0 elementos. Manual v1.7 documenta que existe e funciona, mas durante o teste T2 não foi possível identificar o componente. Possíveis causas: classe CSS não inclui "whiteboard"; componente foi montado em outra sala (reunião) que não estava ativa; regrediu silenciosamente em alguma mudança.

**O que fazer:**
1. Localizar o componente: `grep -rn "whiteboard\|barra.*progresso" dashboard/components/office/`
2. Se existe, conferir se renderiza condicionalmente em sala visível durante pipeline.
3. Se classes CSS não incluem "whiteboard", adicionar `data-testid="whiteboard"` para facilitar QA futuro.
4. Reproduzir o pipeline T1 e tirar screenshot do whiteboard funcionando.

**Critério de aceite:**
- [ ] Durante pipeline ativo, elemento com data-testid="whiteboard" existe no DOM
- [ ] Barras coloridas se preenchem visivelmente
- [ ] Screenshot anexado como prova

---

### T57 — TTS do dossiê (T22) sem áudio nem feedback

**Severidade:** média · **Onde:** `dashboard/components/chat/ChatPanel.tsx` botão "ouvir dossiê"

**Problema:**
Botão `▶ ouvir dossiê` aparece corretamente. Click não cria `<audio>` no DOM, sem requests, sem áudio audível, sem mensagem de erro. Falha silente.

**Hipóteses:**
- `window.speechSynthesis` pode estar disponível mas com voz pt-BR não instalada — `speak()` retorna sem erro mas não emite som.
- Browser pode estar bloqueando autoplay.

**O que fazer:**
1. Adicionar log no handler do botão: `console.log('voices:', window.speechSynthesis.getVoices())` antes do speak.
2. Verificar `speechSynthesis.speaking` após chamar — se ficar false em 1s, tem problema.
3. Se nenhuma voz pt-BR disponível, mostrar toast: "Seu sistema não tem voz pt-BR instalada. Tente Chrome ou instale uma voz no sistema."
4. Botão deve mudar para "⏸ pausar" durante narração e voltar quando termina.

**Critério de aceite:**
- [ ] Click no botão narra (em browser que suporta) ou mostra mensagem clara
- [ ] Estado visual do botão reflete narração ativa
- [ ] Console log indica voz selecionada para debug

---

### T58 — Botão "sugerir agentes" sem feedback de loading (T11)

**Severidade:** baixa/média · **Onde:** `dashboard/components/chat/ChatPanel.tsx` botão `✦ sugerir agentes`

**Problema:**
Click não muda estado visual. Se a request demora ou falha, operador não sabe. Combina mal com T52 — usuário acha que botão tá quebrado.

**O que fazer:**
1. Adicionar `isLoading` no estado local do botão.
2. Durante request: trocar texto para "⌛ analisando…" e desabilitar.
3. Em caso de erro (após T52 estar feito), mostrar `error.detail` em toast ou bubble.

**Critério de aceite:**
- [ ] Botão fica visualmente em estado loading durante request
- [ ] Falha mostra mensagem amigável

---

### T59 — Telemetria de latência por agente (observabilidade)

**Severidade:** média · **Onde:** `core/agente_base.py` (já tem `duracao` no retorno) + `api_server.py` (precisa salvar) + `dashboard/components/history/HistoryPanel.tsx` (exibir)

**Problema:**
Pipeline T1 levou ~17min com Heitor demorando 4min sozinho. Provavelmente agravado por overloaded_error e retries internos. Hoje não há visibilidade sobre tempo por agente — operador não sabe se foi lento por web search, retry, ou input grande.

**O que fazer:**
1. `_chamar_api` já calcula `duracao`. Garantir que cada agente registra isso no resultado.
2. No `api_server.py`, ao salvar a sessão, incluir `duracoes_segundos` por agente no JSON:
   ```python
   "duracoes_segundos": {"otto": 12.4, "heitor": 248.7, ...}
   ```
3. No HistoryPanel detalhe da sessão, mostrar mini-gráfico ou lista com duração por agente.
4. Bonus: alerta se algum agente passar de 120s (badge ⏱).

**Critério de aceite:**
- [ ] JSON da sessão tem `duracoes_segundos` por agente
- [ ] HistoryPanel exibe a informação
- [ ] Alerta visual para agente lento

---

## COSMÉTICOS

### T60 — Pacote de polimento UI (3 fixes pequenos juntos)

**Severidade:** cosmética · **Onde:** vários

**Lista:**
1. **Dashboard saúde — barra sem rótulo (`/saude`):** primeira barra de "Uso de agentes" mostra `8 / 67%` sem nome. Adicionar label do agente correspondente.
2. **Pop "Dossiê pronto!" sobre impressora:** após pipeline, popup aparece sobre o sprite da impressora mas não é claramente clicável. Adicionar `cursor:pointer`, hover state, ou mover para área mais óbvia.
3. **Outros pequenos achados visuais** que apareceram nos testes mas não foram detalhados — coletar enquanto faz os outros e juntar aqui.

**Critério de aceite:**
- [ ] Todas as barras de "Uso de agentes" têm label
- [ ] Popup do dossiê tem affordance visível de "clique para abrir"

---

# ORDEM SUGERIDA DA FASE 4

```
Imediato:                  T52 + T53 (sistêmicos — destravam diagnóstico do resto)
Em seguida:                T51 (Pedro reunião) + T54 (URL cortes) + T55 (tags)
Quando puder:              T56, T57, T58, T59
Polimento final:           T60
```

> **Antes de marcar T55 (tags) como concluída**, refazer a bateria de teste em janela sem `overloaded_error` na Anthropic. Se as tags voltarem a aparecer só com T52+T53 (mensageria correta), o "bug" T55 era sintoma — fechar como duplicata.

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
| T6-T8 (Épico A) | ✅ concluído | 2026-05-06 | `EspelhoCliente` base class extraída; wizard `onboard_cliente.py` criado; sala customizável por cliente no OfficeScene |
| T9-T10 (Épico B) | ✅ concluído | 2026-05-06 | Pedro como gate automático entre Salles e Sônia; stress test mesa redonda validado |
| T11-T17 (Épico C) | ✅ concluído | 2026-05-06 | Pulse semanal (manual, sem cron — ver T49); few-shot sessões ⭐5; busca semântica; Hall of Fame; tags semi-automáticas; dashboard de saúde; histórico filtrável |
| T22-T27 (Épico E) | ✅ concluído | 2026-05-06 | Modo remix; briefing reverso; comparativo A/B Salles; cortes-prontos Sônia; fast-track; modo sandbox |
| T28-T30 (Épico F) | ✅ concluído | 2026-05-06 | Sugestor de pipeline; conditional routing Heitor; custo-cap por sessão |
| T31-T33 (Épico G) | ✅ concluído | 2026-05-06 | Whiteboard ao vivo; sprites expressivos (celebrate/error); mic destaque em reunião |
| T34-T37 (Épico H) | ✅ concluído | 2026-05-06 | Upload áudio (Whisper); TTS dossiê; link aprovação cliente; calibragem Pedro |
| T40 — /share path | ✅ concluído | 2026-05-06 | Loop HISTORICO_DIR.glob substituído por leitura direta em dashboard/{session_id}.json. Testado: POST /share + abrir no browser |
| T41 — XSS escape | ✅ concluído | 2026-05-06 | html_escape em todos os campos; max_length autor/texto; guard vazio; cap 20 comentários. Testado: &lt;script&gt; aparece como texto literal. **Nota:** T40 e T41 landed no mesmo commit (7cf0992) por terem sido implementados antes do primeiro commit |
| T42 — PDFs manual | ✅ concluído | 2026-05-06 | Opção A documentada no CHANGELOG; MANUAL_v1.7 e v1.8 existem em releases/ |
| T43 — registro execução | ✅ concluído | 2026-05-06 | Esta tabela atualizada com todos os épicos e FASE 3 bloco crítico |
| T44 — bug A/B Salles | ✅ concluído | 2026-05-06 | Backend envia salles_v1/v2/v3; frontend faz fallback no AGENT_MAP. 3 bolhas distintas sem colisão |
| T45 — piso autorizar_custo | ✅ concluído | 2026-05-06 | `max(0.1, float(valor))` — uma linha |
| T46 — risco vermelho Heitor | ✅ concluído | 2026-05-06 | Lê `risco_geral` do dict output_tecnico; emoji 🔴 como fallback |
| T47 — autocomplete calibragem | ✅ concluído | 2026-05-06 | datalist alimentado por /historico filtrado em sessões com Pedro |
| T48 — idleQuote wizard | ✅ concluído | 2026-05-06 | Placeholder TODO visível no snippet gerado pelo onboard_cliente.py |
| T49 — pulse agendado | ✅ concluído | 2026-05-06 | Instruções de cron e launchd adicionadas ao §5.7 do manual |
| T50 — share Next.js | ✅ concluído | 2026-05-06 | GET /share/{token}.json + página Next.js com branding Lemmon; sem redirect |
