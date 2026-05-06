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

# FASE 5 — REFATORAÇÃO E DÍVIDA TÉCNICA

**Adicionado:** 2026-05-06 (sessão 5)
**Origem:** auditoria sistêmica de visão geral do código pós-FASE 4. Sistema chegou a ~14.4k linhas (8.5k Python + 5.9k TS/TSX) com três arquivos > 1300 linhas. Fase 5 foca em **dívida técnica e qualidade**, não em features.

> **CONVENÇÃO IMPORTANTE DESTA FASE — flag de impacto:** cada tarefa marca explicitamente se afeta o que o operador recebe (output dos agentes, comportamento da UI). A maioria é refatoração interna invisível. Personalidade dos agentes (Otto força tool_use, Heitor faz 3 chamadas, Sônia tem múltiplos modos, Aya monta markdown em Python puro, Pedro carrega material primário, Salles tem duas entradas) **continua exatamente igual** — não estou propondo amassar a função de cada um.

---

## 🔴 BLOCO URGENTE — fazer ANTES de qualquer outra tarefa

### T88 — Conectar repositório ao GitHub (backup remoto crítico)

**Severidade:** 🔴 URGENTE · **Afeta output: NÃO**

**Onde:** raiz do projeto (operação de git)

**Problema constatado em 2026-05-06:**
- ✅ Repo git local existe com commits.
- ✅ `.gitignore` correto (`.env`, `.venv`, `outputs/`, `historico/`, `node_modules/` etc.).
- ❌ **`git remote -v` retorna vazio** — não há remote configurado.
- ❌ **58 arquivos modificados não comitados** no momento da auditoria, incluindo a FASE 4 inteira (manual v1.13, plano, código novo).

**Risco:** se o Mac morrer ou o disco corromper hoje, **perdemos todos os commits feitos** (último: `2f128a6 fix(t57+t58)`) **mais as 58 mudanças pendentes**. Meses de trabalho num único HD.

**O que fazer (mesmo dia):**
1. Criar repositório privado no GitHub: `lemmon-produces/lemmon-agentes` ou similar.
2. No projeto:
   ```bash
   cd /Users/calebe/Documents/lemmon-agentes
   git remote add origin git@github.com:<usuario>/lemmon-agentes.git
   ```
3. **Antes do primeiro push**, comitar pendências em commits temáticos pequenos (não num commit gigante "WIP"):
   - Manual e plano: `docs: atualiza manual v1.13 e plano FASE 4 fechada`
   - Código FASE 4: aproveitar mensagens dos blocos T51/T54/T55, T52/T53, T56-T59, T60 (já estão claras no CHANGELOG).
   - REF VISUAL: separar — se forem só referências de design, considerar `git lfs` ou subir como release. Se for pesado, adicionar `REF VISUAL/` no `.gitignore` e manter local.
4. Push inicial: `git push -u origin main` (ou `master`).
5. Configurar branch protection na main: pelo menos exigir PR (mesmo trabalhando solo, fica como hábito).
6. Configurar 2FA na conta GitHub se ainda não tiver.

**Decisões já tomadas (Calebe, 2026-05-06):**
- **Privado** — código tem prompts proprietários e dossiê do Pedro Abrahão.
- **Pasta `REF VISUAL/` é mantida no repo** — referência de cenários e personagens, vai junto.
- **Conta GitHub: a mesma já configurada localmente** (`git config user.email` deve bater).
- **Histórico preservado** (não nuclear) — log atual vira documentação viva da evolução.

**Critério de aceite:**
- [ ] `git remote -v` mostra origin apontando pra GitHub
- [ ] `git status` limpo após o primeiro push
- [ ] `git log` no GitHub bate com `git log` local
- [ ] Repo é **privado**
- [ ] 2FA ativo na conta
- [ ] Pasta `REF VISUAL/` resolvida (subiu, ignorou, ou foi pra LFS — qualquer escolha consciente)
- [ ] Documentar no manual §8.6: "Push após cada bloco fechado de tarefa, ou no fim do dia"

**Nota sobre `historico/` e `outputs/`:**
Esses estão (corretamente) no `.gitignore` e **não vão pro GitHub**. Backup deles é trabalho separado (ver T84 — backup automatizado do histórico). T88 cobre só o código + docs.

---

## BLOCO REFATORAÇÃO (estrutura interna — ROI alto)

### T61 — Quebrar `api_server.py` em módulos

**Severidade:** média/alta · **Afeta output do agente: NÃO**

**Onde:** `api_server.py` (1317 linhas hoje)

**Problema:** 23 endpoints REST + 3 WebSockets num arquivo só. Difícil saber onde adicionar próximo endpoint, alto risco de merge conflict, lento de carregar mentalmente.

**Estrutura proposta:**
```
api/
├── main.py            (FastAPI app + CORS + montagem dos routers)
├── ws_chat.py         (WebSocket /ws/chat — pipeline)
├── ws_reuniao.py      (WebSocket /ws/reuniao)
├── ws_mesa.py         (WebSocket /ws/mesa_redonda)
├── routes/
│   ├── historico.py   (listar, similar, detalhe)
│   ├── exportar.py    (exportar dossiê + download)
│   ├── exemplares.py
│   ├── share.py       (share + comentar + share/{token}.json)
│   ├── auxiliares.py  (sugerir, briefing-reverso, cortes)
│   ├── transcrever.py
│   └── calibragem.py
└── schemas.py         (todos Pydantic models que hoje estão in-line)
```

**O que fazer:**
1. Criar pasta `api/` e os arquivos vazios.
2. Mover endpoints e schemas mantendo lógica intacta (find-and-cut).
3. `api_server.py` vira `api_server.py = from api.main import app` (compat com uvicorn).
4. Conferir que todos os imports continuam funcionando.

**Critério de aceite:**
- [ ] `uvicorn api_server:app --reload` continua funcionando idêntico
- [ ] Todos os 23 endpoints respondem como antes
- [ ] Cada arquivo do `api/routes/` tem < 200 linhas

---

### T62 — Trocar `print()` por `logger` em agentes/exportador

**Severidade:** média · **Afeta output do agente: SIM (trade-off documentado)**

**Onde:** `agentes/aya.py`, `agentes/heitor.py`, `agentes/sonia.py`, `core/espelho.py`, `core/exportador_aya.py`

**Problema:** `print()` polui stdout do uvicorn. Não é loggado, não tem nível, não vai pra arquivo. Em produção (uvicorn como serviço), os "🟢 Pedro pronto pra responder" somem ou poluem.

**Trade-off pro operador:** ao rodar `uvicorn` no terminal manualmente, **você para de ver os avisos coloridos rolando ao vivo no terminal**. Vão pro log estruturado em arquivo.

**Mitigação proposta:** manter os `print()` apenas quando o agente é chamado via CLI (`pedro_cli.py`, `heitor_cli.py`, etc.). Quando vem da API, usa `logger`. Detecção pode ser via flag passado ao construtor (`Agente(modo="cli")`) ou via `sys.stdout.isatty()`.

**O que fazer:**
1. Para cada `print(aviso_*)`, decidir: log ou print-condicional.
2. Sugestão: criar wrapper `self._aviso(texto, level="info")` em `AgenteBase` que decide.
3. Em CLIs, ativar print direto (operador quer ver).
4. Via API/WS, sempre logger.

**Critério de aceite:**
- [ ] CLI continua mostrando avisos coloridos como hoje
- [ ] Backend uvicorn não tem mais prints na stdout durante execução de pipeline
- [ ] Logs estruturados aparecem em `logs/` ou stdout do uvicorn em formato consistente

---

### T63 — Extrair CSS gigante de `core/exportador_aya.py`

**Severidade:** média · **Afeta output do agente: NÃO**

**Onde:** `core/exportador_aya.py` (829 linhas, das quais ~460 são CSS literal)

**Problema:** CSS está embutido como string Python e duplicado em `design_system.html`. Mudar uma cor exige edição em dois lugares — risco de drift visual entre dossiê PDF e dashboard.

**O que fazer:**
1. Criar `core/templates/aura.css`.
2. `exportador_aya.py` lê o CSS via `Path.read_text()`.
3. Se houver placeholders dinâmicos (cores variáveis, nome do projeto), usar simples `.replace()` ou Jinja2.
4. Documentar no topo do CSS: "Espelho do design_system.html — sincronizar manualmente."

**Critério de aceite:**
- [ ] PDF gerado pelo `exportar_dossie()` é visualmente idêntico ao atual
- [ ] `core/exportador_aya.py` cai pra ~370 linhas
- [ ] CSS único em `core/templates/aura.css`

---

### T64 — Splitar `OfficeScene.tsx` em sub-componentes

**Severidade:** média · **Afeta output da UI: NÃO**

**Onde:** `dashboard/components/office/OfficeScene.tsx` (1627 linhas)

**Problema:** SVG isométrico inteiro num componente. Sprites + sala work + sala meeting + transições + speech bubbles + whiteboard + animações tudo junto. Re-render caro durante streaming.

**Quebra proposta:**
- `OfficeScene.tsx` (orchestrator, < 300 linhas)
- `WorkRoom.tsx` (mesa de trabalho)
- `MeetingRoom.tsx` (sala de reunião)
- `Whiteboard.tsx` (já marcado com data-testid após T56)
- `SpeechBubble.tsx`
- `Sprite.tsx` (já existe como `CharacterSprite.tsx`)

**O que fazer:**
1. Identificar fronteiras claras (cada sub-componente tem props bem definidas).
2. Mover blocos pra arquivos separados.
3. Memoizar com `React.memo` os que não dependem de props que mudam a cada token.

**Critério de aceite:**
- [ ] Comportamento visual idêntico ao atual
- [ ] Cada arquivo < 400 linhas
- [ ] Re-render durante streaming não dispara em sub-componentes não afetados (verificar com React DevTools)

---

### T65 — Splitar `ChatPanel.tsx` em sub-componentes

**Severidade:** média · **Afeta output da UI: NÃO**

**Onde:** `dashboard/components/chat/ChatPanel.tsx` (1493 linhas, > 20 props)

**Quebra proposta:**
- `ChatPanel.tsx` (orchestrator, < 300 linhas)
- `ChatHeader.tsx`
- `ConfigSidebar.tsx` (configs do Otto/Heitor/Salles/Sônia)
- `MessageList.tsx`
- `InputBar.tsx`
- `ApprovalDialog.tsx`
- `AvaliacaoBar.tsx`
- `TagChips.tsx`
- `CustoCapModal.tsx`

**O que fazer:**
1. Identificar funções internas que já estão segmentadas.
2. Extrair pra arquivos próprios mantendo props strict.
3. Reduzir props do `ChatPanel` central usando context provider local se necessário.

**Critério de aceite:**
- [ ] Comportamento idêntico em todos os modos (pipeline, reunião, manual, fast-track, sandbox)
- [ ] Props do `ChatPanel` central caem de 20+ pra ≤ 8
- [ ] Cada sub-componente < 300 linhas

---

## BLOCO DX / QUALIDADE (semana)

### T66 — Configurar `ruff` + `mypy` no Python

**Severidade:** média · **Afeta output do agente: NÃO**

**Onde:** raiz do projeto, novo `pyproject.toml`

**Problema:** Type hints existem mas não são checados. Imports não usados acumulam (já encontrei 2 na auditoria).

**O que fazer:**
1. Adicionar `pyproject.toml` com:
   ```toml
   [tool.ruff]
   select = ["E", "F", "I", "B"]   # erros básicos + imports + bugs
   line-length = 100

   [tool.mypy]
   ignore_missing_imports = true
   check_untyped_defs = true
   ```
2. Rodar `ruff check . --fix` e corrigir o que sobrar manualmente.
3. Rodar `mypy agentes/ core/` e ajustar tipos onde precisar.

**Critério de aceite:**
- [ ] `ruff check .` passa sem erros (ou com lista controlada de exceções)
- [ ] `mypy agentes/ core/` passa em modo conservador
- [ ] Comportamento runtime inalterado

---

### T67 — Migrar `teste_*.py` interativos para `pytest` mínimo (smoke tests)

**Severidade:** alta para sustentabilidade · **Afeta output do agente: NÃO**

**Onde:** `teste_*.py` (7 arquivos hoje, todos com `input()`)

**Problema:** Sem testes automatizados. Cada deploy depende de QA manual via Chrome. Mudança em `_chamar_api` pode quebrar 6 agentes silenciosamente.

**O que fazer:**
1. Criar `tests/` com `pytest`.
2. Smoke tests por agente: instanciar, chamar com input mock, verificar shape do retorno.
3. Mockar Anthropic com `unittest.mock` ou pytest fixture (não chamar API real em testes).
4. Manter os `teste_*.py` antigos como "QA interativo" se forem úteis.
5. CI básico: `.github/workflows/test.yml` (mesmo que GitHub Actions não esteja em uso, deixa configurado).

**Critério de aceite:**
- [ ] `pytest` na raiz roda em < 10s sem custo Anthropic
- [ ] Smoke test pra cada um dos 6 agentes
- [ ] Smoke test pra cada endpoint REST básico

---

### T68 — Script `dev` que sobe backend + frontend juntos

**Severidade:** baixa de DX · **Afeta output: NÃO**

**Onde:** raiz do projeto, novo `Makefile` ou `package.json scripts`

**O que fazer:**
1. `Makefile` simples:
   ```makefile
   dev:
   	concurrently "uvicorn api_server:app --reload" "cd dashboard && npm run dev"
   ```
2. Ou usar `npm run dev:all` no `dashboard/package.json` com `concurrently`.

**Critério de aceite:**
- [ ] `make dev` (ou equivalente) sobe os dois processos com um comando
- [ ] Logs separados/coloridos por processo

---

### T69 — Auditar `.gitignore`

**Severidade:** baixa · **Afeta output: NÃO**

**Onde:** `.gitignore` na raiz

**O que fazer:**
1. Verificar se `.venv/`, `dashboard/node_modules/`, `dashboard/.next/`, `outputs/`, `historico/`, `*.pyc`, `__pycache__/` estão ignorados.
2. Se algum estiver versionado por engano, remover do tracking (`git rm -r --cached <path>`).

**Critério de aceite:**
- [ ] `git status` limpo após gerar PDF, rodar pipeline, rodar testes
- [ ] Repo não tem `.venv` versionada

---

## BLOCO PRODUÇÃO-READY (quando for hospedar)

### T70 — Auth simples no backend

**Severidade:** alta SE hospedar · **Afeta output: SIM (login na primeira vez)**

**Onde:** `api_server.py` middleware + `dashboard/lib/api.ts`

**Problema:** Sem auth. Hoje OK em dev local, perigoso se hospedar fora.

**O que fazer (variantes):**
- **Mínimo:** API key fixa no `.env`, header `X-Lemmon-Key` em todos os requests. Frontend lê de env public.
- **Médio:** OAuth via Google ou similar.
- **Pra agora:** mínimo. Implementar OAuth quando tiver mais usuários.

**Trade-off pro operador:** ao subir fora do localhost, vai precisar configurar a key na primeira vez. Em localhost (sem hospedagem), pode ficar opcional.

**Critério de aceite:**
- [ ] Endpoint sem header válido retorna 401
- [ ] Frontend manda header automaticamente
- [ ] Localhost dev continua funcionando sem header (modo permissivo)

---

### T71 — Rate limit nos endpoints LLM

**Severidade:** média (preventivo) · **Afeta output: indiretamente — só se você passar do cap**

**Onde:** `api_server.py` decorator nos endpoints LLM-based

**Problema:** Sem rate limit, alguém com acesso ao backend pode chamar `/sugerir_pipeline` em loop e estourar a conta Anthropic.

**O que fazer:**
1. Adicionar `slowapi` ao requirements.
2. Decorator `@limiter.limit("10/minute")` em `/sugerir_pipeline`, `/briefing_reverso`, `/cortes_prontos`, `/transcrever`.
3. Resposta 429 com `detail: "Limite de chamadas. Aguarde 1 minuto."`

**Critério de aceite:**
- [ ] 11ª chamada em < 1min retorna 429 amigável
- [ ] Frontend mostra a mensagem clara

---

### T72 — CORS restritivo via env var

**Severidade:** baixa (até hospedar) · **Afeta output: NÃO**

**Onde:** `api_server.py` middleware CORS

**O que fazer:**
1. Trocar `allow_origins=["*"]` por `os.getenv("CORS_ORIGINS", "*").split(",")`.
2. Em produção: `CORS_ORIGINS=https://lemmon.app,https://dashboard.lemmon.app`.

**Critério de aceite:**
- [ ] Sem env var, comportamento igual hoje (`*`)
- [ ] Com env var configurada, requisições de origens não listadas são rejeitadas

---

## BLOCO ARQUITETURA (continua)

### T73 — TypedDict `AgenteResultado` (shape comum, sem amassar personalidade)

**Severidade:** média · **Afeta output do agente: NÃO**

**Onde:** novo `core/tipos.py` ou `core/agente_base.py`

**Problema:** Cada agente retorna dict com chaves diferentes. Otto tem `custo` aninhado E `custo_total_usd`. Heitor tem `web_search_requests`. Aya tem `agentes_detectados`. Pedro tem `modo_execucao`. Sem garantia de shape mínimo, código consumidor (`api_server.py`) acaba com `.get()` defensivo em todo lugar.

> **Importante (refinado):** isso NÃO é forçar todos os agentes a terem mesma assinatura de `executar()` ou mesmo número de chamadas. Cada agente continua com sua personalidade — Otto força tool_use, Heitor faz 3 chamadas com web search, Sônia tem 3 modos, Aya monta markdown em Python, Pedro carrega material primário, Salles tem duas entradas. **Só estou propondo um SHAPE BASE garantido no retorno**, com campos extras livres por agente.

**O que fazer:**
1. Definir TypedDict mínimo:
   ```python
   class AgenteResultado(TypedDict):
       output_humano: str
       output_tecnico: dict
       custo_total_usd: float
       duracao_segundos: float
       # qualquer outro campo é permitido (TypedDict total=False)
   ```
2. Verificar cada agente: `Otto`, `Heitor`, `Salles`, `Sônia`, `Aya`, `EspelhoCliente`.
3. Onde algum dos 4 campos base estiver faltando, adicionar (sem remover nada existente).
4. Tipar retornos com `-> AgenteResultado`.
5. Mypy (após T66) garante que ninguém retorna sem os 4 campos base.

**Critério de aceite:**
- [ ] Os 6 agentes retornam pelo menos `output_humano`, `output_tecnico`, `custo_total_usd`, `duracao_segundos`
- [ ] Campos específicos de cada agente (web_search_requests, agentes_detectados, etc.) **continuam intactos**
- [ ] Output humano e técnico de cada agente é byte-igual ao atual
- [ ] mypy passa

---

### T74 — `lib/api-client.ts` no frontend (eliminar fetch duplicado)

**Severidade:** média de DX · **Afeta output: NÃO**

**Onde:** novo `dashboard/lib/api-client.ts` + 8 páginas que chamam `fetch` direto

**Problema:** 8 páginas (`briefing-reverso`, `calibragem`, `cortes`, `hall-of-fame`, `saude`, `share`, etc.) duplicam padrão `fetch + try + catch + setError`.

**O que fazer:**
1. Criar `dashboard/lib/api-client.ts` com funções tipadas:
   ```ts
   export async function fetchHistorico(): Promise<HistoryItem[]> { ... }
   export async function postBriefingReverso(t: string): Promise<{...}> { ... }
   export async function postCalibragem(p: ...): Promise<{...}> { ... }
   ```
2. Cada função encapsula `fetch + parse + error handling`.
3. Refatorar as 8 páginas pra usar.

**Critério de aceite:**
- [ ] Cada página perde código boilerplate
- [ ] Tipos TS dos retornos ficam centralizados
- [ ] Comportamento UI idêntico

---

### T75 — Hook `useApiQuery` padronizado

**Severidade:** baixa · **Afeta output: NÃO**

**Onde:** novo `dashboard/lib/use-api-query.ts`

**O que fazer:**
1. Hook genérico:
   ```ts
   function useApiQuery<T>(fn: () => Promise<T>) {
     const [data, setData] = useState<T | null>(null)
     const [loading, setLoading] = useState(true)
     const [error, setError] = useState<string | null>(null)
     useEffect(() => { ... }, [])
     return { data, loading, error, reload }
   }
   ```
2. Refatorar páginas para usar.

**Critério de aceite:**
- [ ] Loading/error padronizado entre páginas
- [ ] Possibilidade de refresh manual (`reload()`)

---

## BLOCO DOCUMENTAÇÃO

### T76 — Receitas §6 do manual cobrindo features novas

**Severidade:** baixa · **Afeta output: SIM (manual mais completo)**

**Onde:** `docs/MANUAL_SISTEMA.md` §6

**Problema:** Receitas atuais (§6) só cobrem cenários básicos. Modo Remix, Fast-track, Sandbox, A/B Salles, Briefing Reverso, Cortes-prontos não têm receita.

**O que fazer:**
Adicionar receitas:
- 6.7 — Variar uma estratégia que funcionou (Modo Remix)
- 6.8 — Roteiro emergencial sob deadline (Fast-track)
- 6.9 — Testar ideia maluca sem poluir histórico (Sandbox)
- 6.10 — Comparar 3 abordagens de roteiro (A/B Salles)
- 6.11 — Reverse-engineer um vídeo concorrente (Briefing Reverso)
- 6.12 — Preparar reels a partir de vídeo longo (Cortes-prontos)

**Critério de aceite:**
- [ ] §6 tem receitas pra todas as features documentadas no manual
- [ ] Cada receita tem 4-6 linhas com passo-a-passo claro

---

### T77 — Manual ganha seção "Como adicionar cliente espelho novo"

**Severidade:** baixa · **Afeta output: SIM (mais doc)**

**Onde:** `docs/MANUAL_SISTEMA.md` nova §10 ou §2.7

**O que fazer:**
1. Documentar uso do `onboard_cliente.py` passo a passo.
2. Mostrar onde editar o snippet TS gerado.
3. Como adicionar alias de menção (linkar T51).
4. Como personalizar idleQuote, sprite, sala (futuras features).

**Critério de aceite:**
- [ ] Operador novo consegue adicionar cliente seguindo só o manual
- [ ] Inclui snippet copiável e localização exata dos arquivos

---

### T78 — Auditar Heitor para padronizar uso de `_chamar_api`

**Severidade:** média · **Afeta output do agente: NÃO**

**Onde:** `agentes/heitor.py`

**Problema:** Heitor importa `APIError, AuthenticationError, RateLimitError` direto (linha 13), o que sugere que tem try/except espalhado fora do `_chamar_api` da base. Plus: faz 3 chamadas, cada uma com lógica própria — vale conferir se todas usam `_chamar_api` ou se alguma chama `client.messages.create` direto, contornando o helper.

**O que fazer:**
1. Ler `agentes/heitor.py` e localizar todas as chamadas Anthropic.
2. As que estão fora do `_chamar_api`, refatorar pra usar (ou criar variação `_chamar_api_com_tools` na base se necessário).
3. Remover imports desnecessários de erro Anthropic do topo.
4. Conferir comportamento de erro: deve usar `formatar_erro_anthropic` automaticamente via base.

**Critério de aceite:**
- [ ] Heitor não importa mais `APIError`, `AuthenticationError`, `RateLimitError` diretamente
- [ ] Todas as chamadas Anthropic passam por `_chamar_api` ou variação
- [ ] Comportamento e output do Heitor idêntico ao atual (verificar com pipeline normal)

---

## BLOCO INFRA, ESCALA E DÍVIDA LATENTE

> Tarefas que mencionei no relatório de visão geral mas que não tinham virado tarefa formal — agora documentadas para que **nada precise ser refeito mais tarde por esquecimento**. Maioria são "ainda não dói, mas vai doer".

### T79 — Índice cacheado para `/historico`

**Severidade:** baixa hoje, alta quando passar de ~500 sessões · **Afeta output: NÃO**

**Onde:** `api_server.py:listar_historico` + provavelmente `core/historico.py` (novo helper)

**Problema:** `/historico` faz `glob` + `read JSON` + `sort` em cada chamada. Cap atual de 200 mascara o problema. Em 500-1000 sessões reais, vai começar a ficar lento (~2-3s por chamada). HistoryPanel chama isso ao abrir — risco de UX ruim.

**O que fazer:**
1. Criar `historico/_index.json` mantido incremental: lista de `{session_id, timestamp, briefing[:120], custo, avaliacao, agentes_usados, origem}`.
2. Atualizar o índice a cada `_salvar_sessao()` e `_salvar_sessao_reuniao()` (append + dedupe por session_id).
3. `/historico` lê só o índice. Detalhe (`/historico/{id}`) continua lendo o JSON completo.
4. Sanity check no startup: se índice estiver dessincronizado vs disco (contagem diferente), reconstrói uma vez.

**Critério de aceite:**
- [ ] `/historico` responde em < 100ms mesmo com 1000+ sessões
- [ ] Detalhe segue lendo do JSON (nada perdido)
- [ ] Reconstrução automática do índice se ficar inconsistente

---

### T80 — Gráfico de latência por agente ao longo do tempo

**Severidade:** baixa, observabilidade · **Afeta output: NÃO** (extensão da T59)

**Onde:** `dashboard/app/saude/page.tsx`

**Problema:** T59 já registra `duracoes_segundos` por sessão. `/saude` mostra custo e contagem mas não latência ao longo do tempo. Sem isso, não dá pra ver se Heitor está demorando mais nas últimas semanas (sinal de degradação).

**O que fazer:**
1. Endpoint novo `/saude/latencias?agente=heitor&dias=30` que agrega médias por agente por semana.
2. Gráfico de linha (recharts ou similar) na página `/saude`.
3. Bonus: marca em vermelho semanas onde mediana > 120s.

**Critério de aceite:**
- [ ] Gráfico de latência por agente nos últimos 30 dias
- [ ] Visível tendência se Heitor (ou outro) começar a degradar

---

### T81 — `_chamar_api_chain` para multi-call uniforme (Heitor, Sônia)

**Severidade:** média de arquitetura · **Afeta output: NÃO**

**Onde:** `core/agente_base.py` + `agentes/heitor.py` + `agentes/sonia.py`

**Problema:** Heitor faz 3 chamadas (web_search → tool_use → format) com lógica própria de exception handling. Sônia tem múltiplos modos com chamadas customizadas. T78 (FASE 5) ataca o uso espalhado de `APIError` direto. Mas o padrão "agente que faz N chamadas em sequência somando custos" não tem helper na base — cada agente reinventa.

**O que fazer:**
1. Adicionar em `AgenteBase`:
   ```python
   def _chamar_api_chain(self, chamadas: list[dict]) -> tuple[list, Custo]:
       """Faz N chamadas, soma custos, retorna lista de responses + custo total."""
   ```
2. Refatorar Heitor pra usar (3 chamadas → 1 chain).
3. Refatorar Sônia pra usar onde fizer sentido.
4. Pedro continua single-call (não precisa).

**Critério de aceite:**
- [ ] Heitor com 3 chamadas usa `_chamar_api_chain`
- [ ] Sônia em modo cadeia idem
- [ ] Comportamento e output idênticos (testes manuais OK)
- [ ] Custos somados corretamente

---

### T82 — Splitar `HistoryPanel.tsx` (582 → componentes menores)

**Severidade:** baixa, mas começando a ficar grande · **Afeta output: NÃO**

**Onde:** `dashboard/components/history/HistoryPanel.tsx`

**Quebra proposta:**
- `HistoryPanel.tsx` (orchestrator + list, < 250 linhas)
- `SessionDetail.tsx` (detalhe da sessão selecionada)
- `FilterBar.tsx` (filtros — período, origem, agente, nota)
- `SessionCard.tsx` (item da lista)

**Critério de aceite:**
- [ ] Comportamento idêntico
- [ ] Cada arquivo < 300 linhas

---

### T83 — Permissões 0600 no `.env`

**Severidade:** baixa, segurança em depth · **Afeta output: NÃO**

**Onde:** `.env` na raiz + doc no manual

**Problema:** `.env` contém `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (futuro). Por padrão no Mac fica 644 (mundo lê). Vale forçar 600.

**O que fazer:**
1. Comando manual: `chmod 600 .env`.
2. Documentar no manual §8.5 (variáveis de ambiente).
3. Bonus: script `scripts/setup_seguro.sh` que ajusta permissões e checa.

**Critério de aceite:**
- [ ] `.env` com permissão 0600
- [ ] Manual documenta o passo

---

### T84 — Backup/restore automatizado do histórico

**Severidade:** média latente — alta quando perder o disco · **Afeta output: NÃO**

**Onde:** novo `scripts/backup_historico.py`

**Problema:** `historico/`, `outputs/`, `inputs/clientes/`, `core/exemplares/` são todos JSON em disco local. Se HD morrer ou você mover de máquina, perde tudo (sessões avaliadas, exemplares curados, calibragem do Pedro). Sem backup, dívida silenciosa.

**O que fazer:**
1. Script `scripts/backup_historico.py` que zipa as pastas críticas com timestamp.
2. Documentar no manual: rodar manualmente toda semana ou agendar via cron (junto com Pulse).
3. Opcional: rsync para drive externo / pasta de cloud.
4. Restore: descompactar de volta.

**Critério de aceite:**
- [ ] `python scripts/backup_historico.py` cria `backups/lemmon-AAAAMMDD.zip`
- [ ] Documentação clara de como restaurar

---

### T85 — Versionamento dos materiais primários dos espelhos

**Severidade:** baixa hoje, média quando criar 3+ espelhos · **Afeta output do agente: NÃO**

**Onde:** `inputs/clientes/<id>/dossie.md` e `transcricoes.md`

**Problema:** Material primário do Pedro (e futuros espelhos) muda com o tempo — Pedro real grava vídeo novo, posicionamento evolui. Hoje sobrescrevemos o `dossie.md` e perdemos histórico. Pior: não dá pra saber se o que o Pedro IA respondeu hoje usou o material de janeiro ou o de junho.

**O que fazer:**
1. Versionar `dossie.md` com sufixo `_v1`, `_v2`. Ou usar git tags. Ou simples pasta `inputs/clientes/pedro/historico/`.
2. `EspelhoCliente` registra em cada execução qual versão foi usada (hash do material).
3. Manual ganha receita "como atualizar dossiê de cliente preservando histórico".

**Critério de aceite:**
- [ ] Cada execução do espelho registra versão/hash do material no JSON
- [ ] Possível voltar a versão antiga do dossiê se necessário
- [ ] Manual documenta o processo

---

### T86 — Toast/snackbar global de erros no frontend

**Severidade:** baixa de UX · **Afeta output: NÃO**

**Onde:** novo `dashboard/lib/toast.ts` + integração nas páginas

**Problema:** Cada página/componente mostra erro do seu jeito (alert vermelho inline, p tag, toast custom...). Operador não tem feedback consistente.

**O que fazer:**
1. Adicionar lib leve (sonner, react-hot-toast) ou implementar custom em ~50 linhas.
2. Provider no `layout.tsx` global.
3. Refatorar páginas pra usar `toast.error(detail)` em vez de inline state.
4. Combina com T74 (api-client.ts) — toast pode ser disparado direto do client em erros padrão.

**Critério de aceite:**
- [ ] Erros aparecem consistentes em todo o app
- [ ] Toast some sozinho após X segundos
- [ ] Botão de "fechar" disponível

---

### T90 — Barra de progresso + ETA durante execução do agente

**Severidade:** média de UX · **Afeta output: SIM (visual durante execução)** · **Depende de:** T59 (telemetria já implementada)

**Onde:** `api_server.py` (novo endpoint), `dashboard/lib/useChat.ts` (estado de progresso), `dashboard/components/chat/ChatPanel.tsx` (UI da barra)

**Problema:**
Hoje, durante execução de um agente, o operador vê só "processando..." sem ideia de quanto falta. Heitor pode levar 1min ou 4min, Otto pode levar 10s ou 40s, e o operador fica sem âncora temporal — gera ansiedade e leva a abortar pipelines bons.

**Limitação técnica honesta:**
LLM não retorna progresso. ETA é **estimativa baseada em mediana histórica**, não verdade. Trade-offs documentados.

**O que fazer:**

1. **Backend: endpoint de medianas.**
   - Novo `GET /sessoes/medianas?agente=otto` que lê todas as sessões com `duracoes_segundos.<agente>` e calcula mediana das últimas 20 execuções.
   - Bonus: suportar `?config=<hash>` agrupando medianas por configuração (ex: Heitor com `max_buscas=3` tem mediana diferente de `max_buscas=0`). Hash da config gerado client-side a partir do `agentConfig`.
   - Se < 3 amostras, retornar `null` e frontend usa fallback fixo (Otto 20s, Heitor 40s, Salles 30s, Sônia 30s, Aya 15s, Pedro 25s).

2. **Frontend: estado de progresso por agente.**
   - Quando chega `agent_start`, capturar timestamp e fetchar mediana.
   - `setInterval` a cada 200ms calcula `progresso = min(95, decorrido / mediana * 100)`.
   - Quando chega `agent_done`, snap pra 100% e limpa o interval.
   - Cap em 95% antes de `agent_done` real — barra **nunca** chega em 100% sem confirmação.

3. **UI da barra.**
   - Barra fina abaixo da bolha de mensagem em construção, na cor do agente.
   - Texto à direita: `≈ 12s restantes` (com til indicando aproximação).
   - Hover mostra tooltip: `Tempo médio: 30s · decorrido: 18s · n=15 amostras`.
   - Quando passar de 1.5x da mediana sem terminar: muda cor pra âmbar e troca texto pra `Mais lento que o normal — possível overloaded`.

4. **Barra macro do pipeline (opcional, recomendada).**
   - No topo do chat, durante pipeline ativo: linha com bolinhas dos agentes selecionados.
   - Cada bolinha em um de quatro estados: `⏱ aguardando`, `▶ ativo (com mini-barra)`, `✓ concluído`, `✕ erro`.
   - Click em bolinha conclusiva pode rolar até a mensagem dela.

5. **Cuidados especiais:**
   - **Salles em modo A/B (3 variantes):** detectar `config.salles.alternativas === 3`, multiplicar mediana por 3.
   - **Heitor sem histórico de uma config específica:** cair no fallback fixo, não no timeout zero.
   - **Modo manual com aprovação:** barra trava em 100% esperando OK do operador (não fica regredindo).
   - **Fast-track:** Otto resumido tem mediana diferente — agrupar por config.

**Critério de aceite:**
- [ ] `GET /sessoes/medianas?agente=otto` retorna `{mediana_segundos: 28.5, amostras: 15}` ou `null`
- [ ] Pipeline real mostra barra enchendo em tempo real para cada agente
- [ ] Barra **nunca** atinge 100% antes de `agent_done` chegar
- [ ] Texto "Mais lento que o normal" aparece em janelas de overloaded
- [ ] Barra macro mostra estado de cada agente do pipeline em uma linha
- [ ] Em modo manual, barra trava no final e espera aprovação visualmente
- [ ] Sem histórico, fallback fixo funciona e não quebra UI

**Variantes de escopo (escolher antes de mandar pro agente):**
- **V1 mínima:** só barra micro do agente atual + ETA simples. Sem barra macro, sem detecção de overloaded.
- **V2 completa:** tudo acima.
- **V3 ambiciosa:** futuro — usar contagem de tokens streamados pra estimativa mais granular (não vale agora, V2 é suficiente).

---

### T89 — Tema claro/escuro no dashboard

**Severidade:** baixa de UX · **Afeta output: SIM (toggle visual)**

**Onde:** `dashboard/app/layout.tsx`, `dashboard/app/globals.css`, componentes que usam Tailwind classes

**Problema:** Hoje o dashboard tem só um tema. Calebe pediu adicionar toggle claro/escuro.

**O que fazer:**
1. Adicionar `next-themes` (lib leve, padrão de mercado): `npm i next-themes`.
2. `ThemeProvider` no `layout.tsx` envolvendo `<body>`.
3. Botão toggle no header (sol/lua) ao lado do relógio e ícone de histórico.
4. Refatorar uso de cores hardcoded (`bg-stone-50`, `text-stone-900`) pra suportar dark mode com classes `dark:` do Tailwind. Concentrar em `globals.css` ou via tokens Tailwind.
5. Cuidado especial: sprites do escritório, paleta dos agentes (cores Lemmon — Otto azul, Heitor verde etc.) devem manter identidade em ambos os temas. Provavelmente só ajustar fundo + bordas.
6. Persistir preferência (localStorage, padrão do `next-themes`).
7. Padrão inicial: seguir `prefers-color-scheme` do sistema do operador.

**Critério de aceite:**
- [ ] Toggle no header alterna claro ↔ escuro instantaneamente
- [ ] Preferência persiste após reload
- [ ] Nenhuma área visual fica ilegível em algum dos temas (texto preto sobre fundo preto, etc)
- [ ] Cores dos agentes (sprite, badges, idleQuotes) reconhecíveis nos dois modos
- [ ] Whiteboard, mic destaque, status físicos continuam visualmente coerentes

---

### T87 — Limpeza periódica de `outputs/`

**Severidade:** baixa latente · **Afeta output: NÃO**

**Onde:** novo `scripts/limpar_outputs.py`

**Problema:** `outputs/otto/`, `outputs/heitor/`, `outputs/salles/`, etc. acumulam markdown e JSON a cada execução. Em 6 meses de uso, fácil ter 1000+ arquivos. Hoje não há limpeza automática.

**O que fazer:**
1. Script `scripts/limpar_outputs.py --dias 90` que apaga arquivos > N dias.
2. Default conservador: 90 dias.
3. Sempre preserva sessões avaliadas com 5⭐ (cruzar com índice T79).
4. Dry-run obrigatório por padrão; flag `--executar` pra apagar de fato.

**Critério de aceite:**
- [ ] Script funciona em dry-run
- [ ] Sessões 5⭐ nunca apagadas
- [ ] Documentado no manual

---

# ORDEM SUGERIDA DA FASE 5

```
🔴 URGENTE (mesmo dia):            T88 (GitHub)  ← FAZER PRIMEIRO
Bloco refatoração (alto valor):    T61 → T62 → T63 → T64 → T65 → T78
Bloco DX/qualidade:                T66 → T67 → T69 → T68
Bloco arquitetura:                 T73 → T74 → T75 → T81 → T82
Bloco doc:                         T76 → T77 → T85
Bloco infra/escala (latente):      T79 → T80 → T83 → T84 → T86 → T87
Bloco UX:                          T90 (barra progresso) → T89 (tema claro/escuro)
Bloco produção (só se hospedar):   T70 → T71 → T72
```

> **Princípio especial desta fase:** todas as tarefas marcadas "Afeta output do agente: NÃO" podem ser executadas com confiança total — o que cada agente entrega para o operador (Otto continua entregando tese + conceito; Heitor continua com risco verde/amarelo/vermelho + fontes; Salles continua com roteiro bloco-a-bloco; Sônia continua com nota + cortes; Aya continua compilando dossiê; Pedro continua com voz fiel + zonas de recusa) **é byte-igual ao atual**. Personalidade dos agentes é deliberada e está preservada.
>
> As exceções marcadas explicitamente são: T62 (CLI vs API: trade-off de visualização do log), T70 (login se hospedar fora), T71 (mensagem 429 se passar do cap), T76/T77 (manual mais completo).

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
| T52 — erros 503 endpoints | ✅ concluído | 2026-05-06 | try/except com tipos específicos Anthropic em /sugerir_pipeline, /briefing_reverso, /cortes_prontos; frontend lê err.detail |
| T53 — erros API no chat | ✅ concluído | 2026-05-06 | formatar_erro_anthropic() helper em core/agente_base.py; _chamar_api/_chamar_api_stream consolidados; repr dict nunca chega ao operador |
| T51 — @pedro em reunião | ✅ concluído | 2026-05-06 | AGENTE_ALIAS dict; _parse_mentions testa alias curto + id completo |
| T54 — URL /cortes | ✅ concluído | 2026-05-06 | HTTP 200 confirmado por curl + build; 404 era estado anterior. Verificado em 2026-05-06 |
| T55 — tags fallback | ✅ concluído | 2026-05-06 | except:pass → warning log + fallback heurístico (Counter + stopwords pt-BR, prefix auto:); evento tags_sugeridas_falhou enviado |
| T56 — whiteboard testid | ✅ concluído | 2026-05-06 | data-testid="whiteboard" no outer `<g>` do componente Whiteboard; reteste visual no Chrome pendente do operador |
| T57 — TTS pt-BR robusto | ✅ concluído | 2026-05-06 | Detecção de voz via getVoices(); erro reportado em ttsError state se nenhuma pt-BR; toggle ▶/⏸ com amber; console.log de diagnóstico |
| T58 — share err.detail | ✅ concluído | 2026-05-06 | Página /share/[token] lê err.detail consistente com T52 |
| T59 — telemetria latência | ✅ concluído | 2026-05-06 | duracoes_segundos por agente em session JSON; HistoryPanel exibe ⏱ Xs (amber >120s); guard ?? {} para sessões antigas |
| T60 — polimento UI | ✅ concluído | 2026-05-06 | Saúde: labels visíveis (stone-300 + bolinha colorida, fix Aya #18181b invisível); speech bubble: cursor-pointer + hover CSS; sem outros achados nessa rodada |
| Manual v1.12+v1.13 | ✅ concluído | 2026-05-06 | v1.12 documenta T56-T59; v1.13 documenta T60; PDF gerado docs/releases/MANUAL_v1.13_2026-05-06.pdf |
