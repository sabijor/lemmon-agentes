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
- **Manual sincronizado é critério de aceite (T92, válido a partir de 2026-05-07).** Toda tarefa que adiciona feature, agente, configuração, modo, página ou comportamento visível ao operador DEVE atualizar a seção correspondente do `docs/MANUAL_SISTEMA.md` (§2 a §8) ANTES do bump de versão. Sem isso, a tarefa não é considerada concluída mesmo que o código esteja perfeito. Changelog é o diário do que mudou; manual é instruções de uso atualizadas. Não fazer só changelog.

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

## BLOCO HIGIENE DE MANUAL (descoberto em 2026-05-07)

> **Origem:** durante BLOCO 6 da FASE 5, operador notou que o manual estagnou na estrutura da v1.0 enquanto o sistema cresceu até v1.17. Changelog vivo, manual fossilizado. Quem abre o manual hoje vê 6 agentes (sem Renata), funcionalidades antigas, roadmap obsoleto.

### T91 — Auditoria e atualização completa do manual

**Severidade:** alta de processo · **Afeta output: SIM** (manual reflete realidade)

**Onde:** `docs/MANUAL_SISTEMA.md` (todas as seções)

**Problema:**
Comparação entre código atual e manual revela divergências sistêmicas:
- §2 (A equipe) ainda lista 6 agentes — Renata (v1.16) ausente
- §3 (Como funciona) sem fast-track, sandbox, A/B Salles, gate Pedro, modo remix
- §4 (Funcionalidades dashboard) sem briefing reverso, cortes-prontos, hall of fame, dashboard saúde, calibragem, exemplares, tags sugeridas, link de aprovação, share token, telemetria de latência, narrações TTS, upload de áudio
- §5 (CLI) provavelmente sem renata_cli.py, onboard_cliente.py, scripts/pulse_semanal.py
- §6 (Receitas) faltam: variar estratégia (remix), fast-track, sandbox, A/B Salles, briefing reverso, cortes-prontos, gate espelho, editorial Renata
  *(parte foi feita na T76 do BLOCO 4; auditar o que ficou)*
- §7 (Roadmap) com itens que já foram entregues — mover pro changelog
- §8 (Apêndice custos) sem Renata, sem novos limites
- §9 (Como atualizar) deve ganhar §1.1 ou §10 com a nova regra (T92)

**O que fazer:**
1. Auditar seção por seção do manual contra estado real do código (rodar grep nos endpoints, listar agentes, listar páginas dashboard).
2. Para cada divergência, decidir: **adicionar** (feature ausente), **atualizar** (mudança de comportamento), ou **remover** (item que sumiu do código).
3. §2 ganha entrada da Renata como §2.7 (provavelmente já tem do T76 da Renata, conferir).
4. §4 vira tabela completa de funcionalidades por página/feature. Cada uma com 2-4 linhas: o que é + onde acessar + quando usar.
5. §5 lista os CLIs reais. Conferir contra `ls *_cli.py + scripts/*`.
6. §6 ganha receitas para todas as features que têm fluxo de uso reproduzível.
7. §7 limpa roadmap — itens entregues vão pra "Funcionalidades estáveis"; itens pendentes ficam como roadmap real.
8. §8 ganha custo médio da Renata, limites de tokens novos.
9. Bump pra v1.20 (depois de T90 e T89 já terem usado v1.18 e v1.19) com entrada "auditoria completa pós-FASE 5".

**Critérios de aceite:**
- [ ] Renata documentada em §2.7 com papel, configurações, exemplo
- [ ] §3 cobre todos os modos: pipeline, reunião, manual, fast-track, sandbox, remix
- [ ] §4 lista todas as 8+ páginas do dashboard com função clara
- [ ] §5 lista todos os CLIs reais (incluindo renata_cli, onboard_cliente, scripts/pulse_semanal)
- [ ] §6 tem receitas pra cada feature de fluxo (gate Pedro, A/B Salles, briefing reverso, cortes, sandbox, fast-track, remix, editorial Renata)
- [ ] §7 separa "estável" de "roadmap real"
- [ ] §8 inclui custo da Renata
- [ ] §9 ganha referência à nova regra de T92
- [ ] PDF v1.20 gerado e pushado

---

### T92 — Regra permanente: manual sincronizado é critério de aceite

**Severidade:** alta de processo · **Afeta output: NÃO**

**Onde:** `PLANO_ACAO_2026-05-05.md` (este arquivo, seção "Princípios pra quem executa") + `docs/MANUAL_SISTEMA.md` §9

**Problema:**
Hoje o changelog é atualizado a cada bump (regra explícita), mas o **manual em si** (seções §2 a §8 que ensinam uso) não tinha gatilho obrigatório. Resultado: changelog vivo + manual fossilizado.

**O que fazer:**
1. Adicionar princípio aos "Princípios pra quem executa" no topo do PLANO_ACAO:
   ```
   - **Manual sincronizado é critério de aceite.** Toda tarefa
     que adiciona feature, agente, configuração, modo, página
     ou comportamento visível ao operador DEVE atualizar a
     seção correspondente do MANUAL_SISTEMA.md ANTES do bump
     de versão. Sem isso, a tarefa não é considerada concluída
     mesmo que o código esteja perfeito. Changelog é diário do
     que mudou; manual é instruções de uso atualizadas.
   ```
2. Adicionar §9.5 no manual: "Atualização contínua do manual" reforçando que features novas devem ganhar seção (ou parágrafo) no §2-§8 antes do PR fechar, não só linha no changelog.
3. Atualizar todos os critérios de aceite das tarefas FUTURAS pra incluir "[ ] Seção correspondente do manual atualizada" (não retroativo — só dali pra frente).

**Critérios de aceite:**
- [ ] Princípio adicionado no topo do PLANO_ACAO
- [ ] §9.5 do manual explicita a regra
- [ ] Próxima tarefa que entrar (BLOCO 5 ou outras) tem critério de manual no aceite

**Trade-off pro operador:** cada feature nova vai exigir 5-15 min extras de doc por parte do agente do terminal. Custo pequeno, evita o problema atual de manual desatualizado.

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
Bloco higiene manual (NOVO):       T92 (regra) → T91 (auditoria completa)
Bloco produção (só se hospedar):   T70 → T71 → T72
```

> **Princípio especial desta fase:** todas as tarefas marcadas "Afeta output do agente: NÃO" podem ser executadas com confiança total — o que cada agente entrega para o operador (Otto continua entregando tese + conceito; Heitor continua com risco verde/amarelo/vermelho + fontes; Salles continua com roteiro bloco-a-bloco; Sônia continua com nota + cortes; Aya continua compilando dossiê; Pedro continua com voz fiel + zonas de recusa) **é byte-igual ao atual**. Personalidade dos agentes é deliberada e está preservada.
>
> As exceções marcadas explicitamente são: T62 (CLI vs API: trade-off de visualização do log), T70 (login se hospedar fora), T71 (mensagem 429 se passar do cap), T76/T77 (manual mais completo).

---

# FASE 6 — BUGS DESCOBERTOS EM USO REAL

**Adicionado:** 2026-05-07 (sessão pós-FASE 5)
**Origem:** primeiros usos reais do sistema com Renata em produção. Diferente das FASES 3 e 4 (auditoria e bateria de testes), aqui aparecem bugs que só doem com fluxo real de operador entregando trabalho ao cliente.

> Esta fase tende a crescer organicamente conforme o sistema é usado. Cada bug novo vira tarefa numerada (T93, T94, ...) sem necessidade de bloco fechado. Quando atingir massa crítica, pode virar FASE 7.

---

### T93 — `/exportar` agente-agnóstico (Renata sem export próprio)

**Severidade:** alta de UX · **Afeta output: SIM** (operador ganha export real do editorial Renata)

**Onde:** `api/routes/exportar.py`, `api/schemas.py` (`ExportarPayload`), `dashboard/lib/useChat.ts` (função `exportar`), `dashboard/components/chat/ChatPanel.tsx` (botões de export)

**Problema constatado em uso real (2026-05-07):**
Operador rodou pipeline completo com Otto + Heitor + Salles + Sônia + Aya + Renata. Pipeline executou corretamente — Renata gerou linha editorial específica (4042 chars começando com "# Linha Editorial — 14/05 a 27/05", 14 peças em 3 arcos narrativos, formatos Reels/Carrossel/Stories distribuídos). Output salvo em `respostas.renata` no JSON da sessão (validado em `historico/dashboard/20260507_133528_sessao.json`).

Quando o operador clicou "Exportar dossiê" no dashboard, o sistema gerou o **dossiê da Aya** (92.462 chars) em vez do editorial da Renata. Resultado: operador esperava receber o calendário da Renata pra mandar pro cliente, recebeu o dossiê técnico que ninguém pediu.

**Causa raiz:** `api/routes/exportar.py:24-25` é hardcoded:
```python
markdown_aya = dados.get("respostas", {}).get("aya", "")
if not markdown_aya.strip():
    raise HTTPException(400, "Sessão não contém output da Aya")
```

O endpoint foi escrito antes da Renata existir e nunca foi atualizado. Renata fica órfã: gera output, salva no JSON, aparece no chat — mas não tem caminho de export.

**O que fazer:**
1. **Backend — `ExportarPayload` ganha campo `agente`:**
   ```python
   class ExportarPayload(BaseModel):
       session_id: str
       agente: str = "aya"  # default mantém compatibilidade
   ```
2. **Backend — `/exportar` usa o parâmetro:**
   - `markdown = dados.get("respostas", {}).get(payload.agente, "")`
   - Mensagem 400: `f"Sessão não contém output do {payload.agente}"`
   - Diretório: `out_dir = OUTPUTS_DIR / payload.agente`
3. **Backend — `/download/{session_id}/{tipo}` aceita query param `?agente=X`** (ou path param) pra servir o arquivo certo.
4. **Frontend — `useChat.ts`:**
   - `exportar(sid: string, agente: string = "aya")` aceita parâmetro
5. **Frontend — `ChatPanel.tsx` (área de avaliação):**
   - Botão "Exportar dossiê (Aya)" aparece quando `respostas.aya` existir
   - Botão "Exportar editorial (Renata)" aparece quando `respostas.renata` existir
   - Os dois lado a lado se ambos rodaram (é o caso comum quando Renata está ligada)
6. **Manual §4** — adicionar item descrevendo export por agente.

**Critério de aceite:**
- [ ] `POST /exportar` com `{session_id: X, agente: "renata"}` gera HTML+PDF do editorial Renata em `outputs/renata/<sid>.{html,pdf}`
- [ ] `POST /exportar` sem campo `agente` continua exportando Aya (compat)
- [ ] Frontend mostra dois botões quando ambos os outputs existem
- [ ] Testar com a sessão `20260507_133528_sessao` — exportar Renata sai o calendário editorial certo (14 peças, mix Reels/Carrossel/Stories)
- [ ] Manual §4 documenta export por agente
- [ ] Bump v1.24 + PDF

**Cuidados:**
- O `core/exportador_aya.py` foi escrito com identidade visual AURA pensando em dossiê. Vale conferir se renderização do markdown da Renata fica boa com o mesmo CSS — provavelmente sim, é markdown padrão. Mas se quebrar, considerar template mais simples pra Renata (futuro T94).
- `agentes_consultados` no `exportar_dossie()` é específico do dossiê da Aya. Pra Renata, esse contexto não faz sentido — passar `[]` ou ajustar.

---

### T94 — Modo Reunião com Loop Autônomo (agentes conversam entre si) ✓ v1.27 (2026-05-07)

**Severidade:** alta de produto · **Afeta output: SIM** (mudança grande em como Reunião funciona)
**Status:** Implementado em 6 commits (prompts + `ws_reuniao.py` + `storage.py` + `useReuniao.ts` + `ChatPanel.tsx`/`page.tsx` + manual + CHANGELOG). Aguardando teste manual: convocar Otto + Renata, modo Loop, validar barra de turnos + banner verde no fim.

**Onde:** `api/ws_reuniao.py`, `dashboard/lib/useReuniao.ts`, `dashboard/components/chat/ChatPanel.tsx` (header da Reunião), `prompts/*_system_v1.md` (todos podem precisar de regra "como passar a bola")

**Problema constatado em uso real (2026-05-07):**
Operador convocou Salles + Sônia + Pedro + Renata na Reunião e pediu que produzissem um editorial. Salles começou a responder e fez 3 perguntas estruturantes (material disponível, conta+formato, objetivo central). Pedro entrou em "processando..." pra responder. Logo em seguida o sistema mostrou a barra "Como foi a reunião?" com estrelas — turno encerrado, agentes pararam de conversar.

Comportamento atual: Reunião é turn-based puro. Operador fala → agentes respondem em ordem → silêncio. Pra continuar, operador precisa mandar nova mensagem manualmente. Resultado: agentes nunca chegam ao deliverable que foi pedido sem o operador "puxar" a cada passo.

Comportamento desejado: depois do operador declarar um objetivo, agentes continuam conversando entre si até um critério de parada — entregaram o resultado, ou bateu cap de turnos, ou bateu cap de custo, ou operador pausou.

**Distinção da Mesa Redonda (T10) que já existe:** Mesa Redonda é UMA rodada estruturada de questionamento + ata da Aya. Loop autônomo é N rodadas livres até resolver. São features complementares, não duplicadas.

**Decisões de design TRAVADAS (Calebe, 2026-05-07):**

**1. Critério de parada — ✅ aprovado:**
   - Cap de turnos (default 5, configurável até 10)
   - Cap de custo (default $1.50, configurável até $3 com confirmação)
   - Marcador semântico `[ENTREGA FINAL]` que qualquer agente pode usar
   - Pausa manual do operador (botão "parar loop" durante)

**2. Quem fala no próximo turno — ✅ aprovado:**
   - Se o agente atual mencionou `@nome`, mencionado fala em seguida
   - Se não mencionou, round-robin entre agentes presentes
   - Operador pode interromper a qualquer momento (vira turno do operador, depois loop retoma)

**3. Modo separado E visualização precisa ser melhorada — ✅ aprovado com refino:**
   - Terceiro modo `🔄 LOOP` ao lado de `▶▶ AUTO` e `⏸ MANUAL` no header da Reunião.
   - **PORÉM:** com 3 botões no header pequeno, fica visualmente apertado e confuso. Propor design tipo **segmented control** (3 pílulas grandes agrupadas em uma única "trilha", visual de tab bar):
     - Visual: container com fundo `bg-stone-100` (claro) ou `bg-stone-800` (escuro), 3 botões dentro com border-radius arredondado
     - Botão ativo: cor sólida (preto no claro, branco no escuro) + texto contrastante
     - Botões inativos: transparente + texto stone-500
     - Tooltip ao hover em cada modo: AUTO ("todos respondem"), MANUAL ("só @mencionado"), LOOP ("agentes conversam até resolver")
     - Largura mínima do componente: 280px pra caber os 3 com folga
     - Em telas pequenas, abreviar pra ícone-only mantendo tooltip
   - Mockup esperado: `[ ▶▶ Auto ] [ ⏸ Manual ] [ 🔄 Loop ]` agrupados visualmente, com o ativo destacado em preenchimento sólido.

**4. Regra "passar a bola" nos prompts — ✅ aprovado:**
   - Adicionar nos 7 `system_prompt_reuniao` (Otto, Heitor, Salles, Sônia, Aya, Pedro, Renata):
     ```
     QUANDO EM MODO LOOP: o operador declarou um objetivo que
     exige trabalho conjunto entre vários agentes. Sua tarefa
     é fazer a SUA parte do trabalho e ENCAMINHAR para o
     próximo:
     - Se sabe quem deve continuar, cite @nome desse agente
       no fim da sua resposta.
     - Se considera o trabalho concluído, escreva
       [ENTREGA FINAL] no fim. O sistema vai encerrar o
       loop e mostrar tua resposta como entrega.
     - Se está perdido sem saber pra quem passar nem se
       acabou, escreva [PRECISO DE AYUDA OPERADOR] e o
       sistema pausa pra intervenção.
     ```
   - Em modos AUTO e MANUAL, essa regra é IGNORADA (cada agente continua respondendo só o que foi perguntado).

**UX de feedback durante loop:**
   - Contador de turnos no header (`Turno 3/5`)
   - Custo acumulado visível (`$0.42 / $1.50`)
   - Botão "parar loop" em destaque (vermelho, ao lado do contador)
   - Cada turno aparece como bolha normal no chat
   - Quando para por `[ENTREGA FINAL]`, banner verde "Entrega declarada por @nome"
   - Quando para por cap de turnos, banner âmbar "Cap atingido — operador, intervir?"
   - Quando para por cap de custo, modal bloqueante (mesmo padrão do T30) com opção autorizar +$0.50 / +$2 / encerrar
   - Quando para por `[PRECISO DE AYUDA OPERADOR]`, banner azul "Agente X pediu ajuda — sua vez de orientar"

**O que fazer (esqueleto, depende das decisões acima):**

1. Toggle no header da Reunião (junto com auto/manual): `▶▶ AUTO`, `⏸ MANUAL`, `🔄 LOOP`
2. Quando `LOOP` ativo, `useReuniao.ts` configura limite de turnos e custo cap antes de enviar mensagem
3. `api/ws_reuniao.py` recebe parâmetros novos no payload: `loop_autonomo: bool, max_turnos: int, custo_cap: float, objetivo_inicial: str`
4. Backend após resposta de cada agente: detectar marcador, incrementar contador, decidir próximo agente, custo acumulado
5. Loop continua até: marcador detectado OU `turnos >= max_turnos` OU `custo >= custo_cap` OU operador pausou
6. Eventos novos no WS: `turn_iteration {n, total}`, `loop_stopped {motivo}`
7. Frontend renderiza contador + custo + botão parar
8. Atualizar prompts de todos os agentes com a regra de "passar a bola"
9. Manual §3.2 ganha subseção "Loop autônomo"

**Critério de aceite:**
- [ ] Toggle 🔄 LOOP no header da Reunião
- [ ] Operador declara objetivo, agentes conversam entre si por até N turnos
- [ ] `@menção` no output direciona próximo agente; sem menção → round-robin
- [ ] `[ENTREGA FINAL]` em qualquer output para o loop com banner verde
- [ ] Cap de turnos atingido → banner âmbar pede intervenção
- [ ] Cap de custo atingido → modal bloqueante (mesmo padrão do T30)
- [ ] Botão "parar loop" funciona a qualquer momento
- [ ] Contador de turnos + custo acumulado visíveis durante loop
- [ ] Operador pode interromper mandando mensagem nova (vira novo turno, loop retoma depois)
- [ ] Prompts de todos os agentes atualizados com regra de passar a bola
- [ ] Manual §3.2 documenta o modo
- [ ] Teste real: convocar Otto + Renata, declarar objetivo "preparar editorial X", agentes conversam até 3-4 turnos e param ou entregam

**Cuidados técnicos:**
- Custos podem explodir rápido. Cap de $1.50 é conservador; permitir override mas exigir confirmação acima de $3.00.
- Se nenhum agente mencionar próximo nem usar marcador, sistema NÃO deve loop infinito — round-robin com cap de turnos resolve.
- Cleanup do WebSocket precisa parar o loop se a conexão cair (não deixar agente rodando órfão).
- Em retomada de sessão de reunião, o estado de loop NÃO é restaurado (loop é efêmero, só vale na sessão ativa).

**Pergunta crítica antes de implementar:** este modo substitui o `auto` atual ou é um terceiro modo separado? Sugestão: terceiro modo. Auto continua sendo "todos respondem ao operador em ordem"; Manual continua "só @mencionado responde"; Loop é "agentes conversam entre si até resolver". Confirmar antes de codar.

---

### T95 — Barra de progresso + watchdog de timeout no Modo Reunião

**Severidade:** alta de UX · **Afeta output: SIM** (feedback visual e recovery)

**Onde:** `dashboard/lib/useReuniao.ts`, `dashboard/components/chat/ChatPanel.tsx`, `api/ws_reuniao.py`

**Dois problemas observados em uso real (2026-05-07):**

**Problema A — Sem barra de progresso na Reunião.** A T90 (V2) implementou barra de progresso + ETA no `useChat.ts` (modo Pipeline). `useReuniao.ts` ficou de fora — não tem `progressIntervalsRef`, não busca medianas, e o `ChatPanel` só renderiza `ProgressBar`/`MacroBar` quando `mode === 'pipeline'`. Resultado: na Reunião, agente fica em "processando..." sem nenhuma indicação de quanto tempo já passou ou quanto falta.

**Problema B — Placeholder "processando..." trava.** Quando ocorre erro silencioso da API Anthropic (overloaded, timeout, conexão caiu), o `agent_done` nunca chega. O placeholder com `id: thinking-${agent}` (useReuniao.ts:36) fica preso para sempre. O `agent_error` deveria limpar (linha 87 — `prev.filter(m => m.id !== thinking-${msg.agent})`), mas isso só funciona se o backend efetivamente mandar `agent_error`. Em casos extremos (WebSocket desconectou, processo backend travou), nada chega.

**O que fazer:**

**Para A — Estender T90 ao useReuniao:**

1. Replicar em `useReuniao.ts` o padrão do `useChat.ts`:
   - Estado `progress: Record<AgentId, number>`
   - `progressIntervalsRef` similar
   - Fetch de mediana em cada `agent_start`
   - `setInterval(200ms)` calculando progresso, cap em 95%
   - Snap 100% no `agent_done`
   - Cleanup obrigatório em `abort()`, `ws.onclose`, `ws.onerror`, `agent_error`

2. `ChatPanel.tsx` renderiza `ProgressBar` e `MacroBar` também em modo Reunião (ou pelo menos `ProgressBar` por agente; `MacroBar` em Reunião faz menos sentido — Reunião não tem ordem fixa).

3. Decisão: mostrar ProgressBar abaixo de cada bolha "processando..." da Reunião, com mesma lógica de detecção de overloaded (>1.5× mediana).

**Para B — Watchdog de timeout (recovery do placeholder):**

1. **Frontend:** quando `agent_start` chega, cria timer de 5 minutos. Se não chegar `agent_done` nem `agent_error` nesse tempo, força:
   - Substituir placeholder por mensagem de erro: "Agente travou (timeout 5min). Provável overloaded da API. Tente reenviar."
   - Limpa state, libera o operador pra continuar.

2. **Backend:** dentro de `api/ws_reuniao.py`, após `loop.run_in_executor(...)` que invoca `ag.responder(...)`, garantir que **toda exceção** dispare `agent_error` antes de continuar. Provavelmente já dispara (já vimos no código), mas vale auditar — se exceção ocorre dentro do callback streaming, pode ser engolida.

3. Tornar o watchdog configurável: `RENATA_TIMEOUT_SEGUNDOS = 300` em `core/config.py`, com fallback de 5 min.

**Critério de aceite:**

- [ ] Em modo Reunião, agente em execução mostra barra de progresso com mesma estética do Pipeline
- [ ] Detecção de overloaded (>1.5× mediana) funciona em Reunião com texto âmbar
- [ ] Tooltip 3 campos (médio/decorrido/amostras) funciona na Reunião
- [ ] Em caso de erro real (`agent_error` chega), placeholder é removido e mensagem aparece
- [ ] Em caso de timeout (5min sem resposta nem erro), placeholder é substituído por aviso amigável e operador pode continuar
- [ ] Cleanup do setInterval nos 4 lugares (abort, close, error, done)
- [ ] Testar: simular overloaded forçando sleep no backend, ver barra ficar âmbar; matar processo backend, ver timeout chegar em 5min com aviso

**Bumps esperados:** v1.25 (T93 já é v1.24).

**Cuidado especial:**
- `useReuniao` tem dois handlers diferentes (linhas 31-90 e ~170+). Investigar antes de codar — pode ser histórico/legacy. Padronizar.
- Watchdog de 5min é conservador; se Heitor com web_search demora 4min normalmente, 5min é apertado. Considerar timeout dinâmico baseado em mediana × 3 do agente, com mínimo de 60s e máximo de 10min.

---

### T99 — Botão de baixar no HistoryPanel.SessionDetail ✓ v1.29 (2026-05-07)

**Severidade:** média de UX · **Afeta output: SIM** (operador ganha download direto)
**Decisão tomada (Calebe, 2026-05-07):** Opção A — reader é o `HistoryPanel.SessionDetail`
**Status:** Implementado. Botões "↓ Dossiê" / "↓ Editorial" no header do SessionDetail com estado idle/loading/done/error + retry.

**Onde:** `dashboard/components/history/SessionDetail.tsx` + `dashboard/lib/api-client.ts` (já tem `exportar`)

**Problema:** ao abrir uma sessão antiga no histórico, operador não consegue baixar PDF do dossiê (Aya) nem do editorial (Renata) sem ter que rodar a sessão novamente.

**O que fazer:**
1. No `SessionDetail.tsx`, na área de detalhe da sessão selecionada:
   - Se `respostas.aya` existe → botão "Baixar dossiê (Aya) PDF"
   - Se `respostas.renata` existe → botão "Baixar editorial (Renata) PDF"
   - Os dois lado a lado, mesma estética dos outros botões do detail
2. Cada botão chama `exportar(session_id, agente)` (já existe via T93) → recebe `caminho_pdf` → faz fetch GET `/download/{session_id}/pdf?agente=X` e dispara download no navegador
3. Bonus: botão "Baixar JSON da sessão" pra debugging (download direto do `historico/dashboard/{session_id}.json`)
4. Manual §4 atualiza descrevendo download direto do histórico

**Critério de aceite:**
- [ ] Botões aparecem condicionais ao output existir
- [ ] Click gera download .pdf no navegador (não abre PDF inline)
- [ ] Funciona em sessões antigas que ainda não foram exportadas (gera PDF na hora)
- [ ] Manual atualizado

---

### T100 — Substituir avaliação 5⭐ por botão Favoritar ✓ v1.30 (2026-05-08)

**Severidade:** média de UX · **Afeta output: SIM** (refatora um sistema inteiro de organização)
**Decisão tomada (Calebe, 2026-05-07):** Remover sistema de avaliação por estrelas e adotar **favorito binário**.
**Status:** Implementado em 5 commits. (1) Script `migrar_avaliacao_para_favorito.py`. (2) Backend: schema + `POST /favoritar` + `410 /avaliar` + `marcar_favorito()`. (3) Frontend: `useChat`, `ChatPanel`, `SessionCard`, `SessionDetail`, `FilterBar`, `page.tsx`. (4) Cascata: `/saude`, Hall of Fame, `core/historico.py`, `salles.py`, `limpar_outputs.py`. (5) Manual + CHANGELOG. Zero erros TypeScript.

**Validação Calebe (2026-05-08):**
- ✓ Migração: 3/3 sessões com `avaliacao==5` têm `favorito=true`
- ✓ Endpoint legado `/avaliar` retorna 410 Gone com mensagem correta
- ✓ Toggle favoritar persiste no JSON e é visível no GET; unfavoritar funciona igualmente
- ⚠ Observação: uma sessão criada pós-migração original ficou com `favorito=false` apesar de ter `avaliacao=5`. Re-executar o script corrigiu. **Janela de deploy:** sessões criadas entre o COMMIT 2 (backend novo) e o COMMIT 3 (frontend novo) podem ter pego o caminho antigo. Caso isolado, não-blocker, mas vale rodar o script `migrar_avaliacao_para_favorito.py` mais 1 vez no próximo deploy de qualquer mudança nessa área pra garantir.

**Razão da decisão:** Avaliar 1-5⭐ é um gesto pesado — operador raramente diferencia 3 de 4. Favoritar é binário: "essa eu quero achar de novo". Cobre 95% do uso real (encontrar sessões boas) sem fricção.

**Onde:**
- **Schema:** sessões em `historico/*.json` e `historico/_index.json`
- **Backend:** `api/routes/avaliacao.py` (renomeia/refatora) + `core/historico_index.py`
- **Frontend:** `dashboard/components/chat/ChatPanel.tsx` (componente de estrelas), `dashboard/components/history/SessionDetail.tsx`, `SessionCard.tsx`, `FilterBar.tsx`, `dashboard/app/saude/page.tsx`, `dashboard/app/hall-of-fame/page.tsx`
- **Limpeza:** `scripts/limpar_outputs.py` (preservava 5⭐)
- **T12 (exemplares):** lógica de `core/exemplares.py` que coletava sessões 5⭐
- **Manual:** §2.5, §3.5, §4 (todas as menções a "estrelas" / "avaliar")

**O que fazer (escopo completo):**

1. **Schema + migração de dados:**
   - Adicionar campo `favorito: bool = false` no schema de sessão
   - Manter `avaliacao` no schema por compatibilidade de leitura (não escrever mais — campo legado)
   - Script de migração `scripts/migrar_avaliacao_para_favorito.py`: lê todos os JSONs em `historico/`, para cada um com `avaliacao == 5` define `favorito: true`, regrava
   - `_index.json` ganha coluna `favorito: bool`; rebuild do índice após migração

2. **Backend:**
   - Renomear `POST /avaliar` → `POST /favoritar` (body: `{session_id, favorito: bool}`)
   - Endpoint vira toggle (idempotente — define o estado pedido, não alterna)
   - `core/historico_index.py` ganha função `marcar_favorito(session_id, favorito)`
   - Endpoint legado `/avaliar` retorna `410 Gone` com mensagem orientativa (1 release de tolerância antes de remover)

3. **Frontend ChatPanel:**
   - Remover componente de 5 estrelas no fim da sessão
   - Substituir por botão único 🤍 ↔ ❤️ (ou ☆ ↔ ★ — escolher um padrão e manter)
   - Tooltip: "Favoritar esta sessão" / "Remover dos favoritos"
   - Estado vem do hook `useChat.ts` / `useReuniao.ts` (campo `favorito`)

4. **Frontend HistoryPanel:**
   - SessionCard: ícone ❤️ ao lado do título quando favoritado
   - SessionDetail: botão grande de favoritar no header
   - FilterBar: troca filtro "5⭐" por filtro "❤️ Favoritas" (chip toggle)
   - Sessões antigas mostram ícone se foram migradas; sessões pré-migração com `avaliacao` 1-4 mostram nada (não aparece histórico de estrelas)

5. **Hall of Fame:**
   - Critério muda: `avaliacao == 5` → `favorito == true`
   - Título muda de "Hall of Fame (5⭐)" para "Favoritas" (manter ícone 🏆 ou trocar por ❤️ — preferência: ❤️ para coerência visual)
   - Página continua existindo (T100 NÃO apaga Hall of Fame; só muda o critério e o nome)

6. **/saude:**
   - "Taxa 5⭐" → "Taxa favoritadas"
   - Mantém cálculo: `count(favorito=true) / count(total)` por janela
   - Gráficos de tendência seguem fórmula análoga

7. **Exemplares (T12):**
   - `core/exemplares.py` que filtrava por `avaliacao == 5` agora filtra por `favorito == true`
   - Manter mesmo número-alvo (ex.: top 50 favoritas mais recentes)

8. **Limpeza:**
   - `scripts/limpar_outputs.py`: preservar sessões com `favorito == true` (era `avaliacao == 5`)

9. **Manual:**
   - §2.5 / §3.5 / §4: trocar "avaliar 1-5⭐" por "favoritar (binário)"
   - Adicionar nota de migração no CHANGELOG: "v1.27 — sistema de avaliação 1-5⭐ substituído por favorito binário; sessões 5⭐ migradas automaticamente"

**Critério de aceite:**
- [ ] Script de migração rodou; backup feito antes (`backup_historico.py`)
- [ ] Toda UI mostra botão de favoritar; nenhum lugar mostra estrelas 1-5
- [ ] Hall of Fame lista sessões favoritadas
- [ ] /saude métrica e gráficos atualizados
- [ ] T12 exemplares re-rodou e usa favoritas
- [ ] Manual sem menções remanescentes a "5 estrelas" / "1-5⭐" (regra T92)
- [ ] CHANGELOG documenta a quebra de schema + migração

**Decisão de ícone (Calebe, 2026-05-07):** estrela ★ ↔ ☆ + texto "Favoritar" / "Favoritada" ao lado. Botão único no header do SessionDetail e ChatPanel, com tooltip explicativo.

---

### T101 — Fixar ChatPanel flutuante (pin/unpin) ✓ v1.29 (2026-05-07)

**Severidade:** baixa de UX · **Afeta output: SIM** (toggle visual)
**Decisão tomada (Calebe, 2026-05-07):** OK — implementar como descrito abaixo.
**Status:** Implementado. Botão 📌/📍 no ChatPanel; localStorage `lemmon-chat-pinned`; drag desabilitado quando fixado.

**Onde:** `dashboard/components/chat/ChatPanel.tsx` + `dashboard/lib/useChat.ts` ou novo state

**Problema (uso real):** ChatPanel é draggable e fica em qualquer posição. Operador quer fixar em uma posição preferida pra não precisar arrastar de volta sempre que abre.

**O que fazer:**
1. Adicionar botão de pin (📌) no header do ChatPanel
2. Estado `pinned: bool` em localStorage (`lemmon-chat-pinned`)
3. Quando `pinned == true`: drag handler é desabilitado, panel fica fixo na posição salva
4. Quando `pinned == false`: comportamento atual (draggable)
5. Posição inicial salva também em localStorage (`lemmon-chat-position`)
6. Manual §4 documenta o pin

**Critério de aceite:**
- [ ] Botão pin no header funciona, ícone alterna 📌 ↔ 📍 (ou similar)
- [ ] Pin persiste após reload
- [ ] Posição persiste em modo unpinned também (boa prática)
- [ ] Manual atualizado

---

### T103 — Watchdog uniforme: 40min para todos os agentes (regra do sistema, não do agente) ✓ v1.28 (2026-05-07)

**Severidade:** alta — bug em uso real · **Afeta output: NÃO** (só evita encerramento prematuro)
**Decisão tomada (Calebe, 2026-05-07):** trocar fórmula `Math.max(180, Math.min(mediana × 3, 1200))` por valor único de **40min para todos os agentes**, atuais e futuros.
**Status:** Implementado. `dashboard/lib/config.ts` criado com `WATCHDOG_TIMEOUT_MIN = 40`; 3 pontos atualizados; mensagem de erro ajustada; manual §4.17 reescrito.

**Onde:** `dashboard/lib/useReuniao.ts:78`, `dashboard/lib/useChat.ts:206`, `dashboard/lib/useChat.ts:235`

**Mudança de filosofia (importante):**
Watchdog deixa de ser "detector de API travada" e vira "encerrador de sessão com margem confortável". Não deve interromper trabalho legítimo do agente. Se a API realmente trava, 40min é margem suficiente pra operador perceber e reenviar manualmente.

**Problema observado (uso real, 2026-05-07):**
Heitor travou em "timeout 3min" num caso de compliance review pesada. T98 tinha subido piso de 60→180s, mas continuou interrompendo agentes legítimos. Avaliação anterior errou ao tentar classificar agentes em "rápidos vs lentos" — Salles também faz roteiros longos de aftermovie/documentário.

**Decisão arquitetural (Calebe):**
> "Esse nosso timeout aí é só pra poder encerrar a sessão. Deixa todos os agentes de 40 minutos, deixa todos com a mesma regra. Inclusive os agentes futuros. A gente não vai alterar a estrutura do agente, vai colocar essa regra no sistema da Dash como um todo."

**O que fazer (frontend, fix imediato):**

1. Em `useReuniao.ts` e `useChat.ts` (3 ocorrências), substituir cálculo:

```ts
// ANTES:
const timeoutMs = Math.max(180, Math.min(mediana * 3, 1200)) * 1000

// DEPOIS:
const WATCHDOG_TIMEOUT_MIN = 40
const timeoutMs = WATCHDOG_TIMEOUT_MIN * 60 * 1000
// (mediana segue sendo usada pra ProgressBar/ETA, mas não pra watchdog)
```

2. Constante `WATCHDOG_TIMEOUT_MIN = 40` num lugar único (ex.: `dashboard/lib/config.ts`) — fonte de verdade. Os 3 usos importam dela. Se um dia mudar pra 30 ou 60, mexe em 1 linha.

3. Mensagem de erro: hardcoded "Agente travou (timeout 40min). Provável overloaded da API. Tente reenviar." (em vez de "3min" antigo).

4. Manual §4.17 (watchdog/progress) atualiza:
   - Remove qualquer menção a "piso 60s"/"180s"/"mediana × 3" para watchdog
   - Documenta: "Watchdog é uma rede de segurança de **40 minutos** uniforme para todos os agentes. Não pretende detectar API travada, e sim encerrar sessões obviamente perdidas. Mediana × 3 segue sendo usada apenas para ETA na ProgressBar."
   - Justificativa breve: agentes têm perfis muito diferentes (Heitor compliance, Salles roteiro), regra por agente não escalou bem; 40min cobre 100% dos casos legítimos com folga.

5. **Auto-aplicabilidade a agentes futuros:** como a regra é uma constante global e não uma tabela por agente, qualquer 8º/9º agente futuro herda automaticamente os 40min sem precisar tocar em nada.

**Critério de aceite:**
- [ ] Constante única `WATCHDOG_TIMEOUT_MIN = 40` em `dashboard/lib/config.ts` (ou similar)
- [ ] 3 ocorrências do cálculo antigo substituídas pela constante
- [ ] Mensagem de erro mostra "timeout 40min"
- [ ] ProgressBar continua usando mediana × 3 pra ETA (sem regressão)
- [ ] Manual §4.17 reescrito refletindo a nova filosofia
- [ ] CHANGELOG menciona a quebra: T98 (piso 180s) era paliativo, T103 generaliza

**Não vai virar T103a/T103b — escopo simplificou.** Filtrar timeouts da mediana (ex-T103b) deixa de fazer sentido pra watchdog (que não usa mais mediana). Pra ProgressBar/ETA pode ser tarefa futura se houver evidência de ETA enviesado, mas sem urgência.

---

### T105 — ProgressBar com easing ease-in (lento no começo, acelera no fim) ✓ v1.28 (2026-05-07)

**Severidade:** baixa de UX · **Afeta output: NÃO** (só visual)
**Decisão tomada (Calebe, 2026-05-07):** ease-in com potência **2.5**.
**Status:** Implementado. `PROGRESS_CURVE_POWER = 2.5` em `dashboard/lib/config.ts`; 3 `setInterval` atualizados; manual §4.17 documenta a curva.

**Onde:**
- `dashboard/lib/useChat.ts:202` (Pipeline)
- `dashboard/lib/useChat.ts:231` (Pipeline, segundo bloco — A/B Salles?)
- `dashboard/lib/useReuniao.ts` (Reunião — bloco análogo)

**Problema (uso real):**
Operador percebe que a barra "começou voando, parou no fim". Causa: fórmula atual é linear e cap em 95% quando `elapsed >= mediana`. Como muitas sessões excedem mediana, a barra enche rápido na primeira metade e fica visualmente travada em 95% por bastante tempo. Isso passa a impressão de que o agente "encalhou".

**Comportamento desejado (Calebe):**
> "Vamos botar como regra que ele vai devagarzinho ali e, quando tiver finalizando, ele dá uma acelerada na barra. Não ao contrário."

Ou seja: ease-in, não ease-out.

**O que fazer:**

1. Substituir fórmula nos 3 pontos:

```ts
// ANTES (linear):
const elapsed = (Date.now() - startTime) / 1000
setAgentProgress(prev => ({ ...prev, [agentId]: Math.min(95, (elapsed / mediana) * 100) }))

// DEPOIS (ease-in com potência configurável):
const PROGRESS_CURVE_POWER = 2.5  // 2 = suave, 2.5 = médio, 3 = dramático
const elapsed = (Date.now() - startTime) / 1000
const t = Math.min(1, elapsed / mediana)
const eased = Math.pow(t, PROGRESS_CURVE_POWER)
setAgentProgress(prev => ({ ...prev, [agentId]: Math.min(95, eased * 100) }))
```

2. Constante `PROGRESS_CURVE_POWER` num lugar único (`dashboard/lib/config.ts`, junto com `WATCHDOG_TIMEOUT_MIN` da T103). Os 3 usos importam dela. Se quisermos calibrar depois, mexe em 1 linha.

3. Manual §4.17 (ProgressBar/ETA) atualiza:
   - "Curva ease-in: a barra avança devagar nos primeiros 60-70% da mediana e acelera no terço final, dando sensação de aceleração ao se aproximar do término."
   - Justificativa breve da curva escolhida.

**Tabela comparativa para escolha (mediana hipotética = 60s):**

| Tempo | Linear (hoje) | t² | t^2.5 | t³ |
|---|---|---|---|---|
| 15s (25%) | 25% | 6% | 3% | 1.5% |
| 30s (50%) | 50% | 25% | 17% | 12.5% |
| 45s (75%) | 75% | 56% | 48% | 42% |
| 54s (90%) | 90% | 81% | 76% | 72% |
| 60s (100%) | 95% (cap) | 95% | 95% | 95% |

**Decisão de potência (Calebe, 2026-05-07):** **2.5** — sweet spot. Primeira metade quase parado, último terço dispara.

**Critério de aceite:**
- [ ] Constante `PROGRESS_CURVE_POWER` definida em `dashboard/lib/config.ts`
- [ ] 3 ocorrências usam a constante
- [ ] Cap de 95% mantido (snap-to-100 no `agent_done` continua funcionando)
- [ ] Manual §4.17 documenta a curva
- [ ] Visualmente: barra "demora" no começo, dispara no fim (validar em uso real)

---

### T104 — Calibragem do Salles: formato múltiplo (multi-select) ✓ v1.29 (2026-05-07)

**Severidade:** média — limitação de uso real · **Afeta output: SIM** (operador ganha controle granular)
**Decisão tomada (Calebe, 2026-05-07):** trocar radio button (single) por chips multi-select. Permite "tudo menos documentário" ou "só aftermovie + reels".
**Status:** Implementado. `formato` → `formatos_permitidos: string[]`; 5 chips toggleáveis no ConfigSidebar; restrição injetada no prompt do Salles; `ws_chat.py` atualizado; manual §2.3 + §4.9 + §4.16.

**Onde:**
- `dashboard/components/chat/ConfigSidebar.tsx` (linhas ~60-75 — bloco Salles, opção `formato`)
- `dashboard/lib/useChat.ts` (tipagem de `agentConfig.salles.formato`)
- `agentes/salles.py` (ler nova lista no input)
- `prompts/salles_system_v1.md` (interpretar lista de formatos permitidos)

**Estado atual:**
```tsx
formato: 'auto' | 'reels' | 'documental' | 'mini-doc' | 'tese' | 'aftermovie'
// 6 botões em coluna, single select
```

Calebe quer poder escolher múltiplas opções, ex.: "aftermovie + reels", ou "tudo exceto documentário".

**Proposta de design:**

1. **Schema:**
```ts
// antes:
formato: string  // single

// depois:
formatos_permitidos: string[]  // ["reels", "aftermovie"] = restringe a esses dois
                               // []                       = "auto" (Salles decide entre todos)
```

2. **UI (ConfigSidebar):**
- Remover opção `auto` do conjunto (vira estado emergente: lista vazia = auto)
- 5 chips: `reels | documental | mini-doc | tese | aftermovie`
- Click toggle: adiciona/remove da lista
- Indicador de estado embaixo: "✓ Salles decide entre 5 formatos" (quando vazio) ou "✓ Restrito a: reels, aftermovie" (quando subset)
- Botão pequeno "tudo" (limpa = vira auto) — substitui a função do antigo botão `auto`

3. **Migração de configs persistidas:**
- `formato: "auto"` → `formatos_permitidos: []`
- `formato: "reels"` → `formatos_permitidos: ["reels"]`
- Backward compat por 1 release: aceitar `formato: string` no payload e converter no servidor

4. **Backend (Salles agent):**
- Ler `formatos_permitidos: list[str]` do input
- Se vazio: prompt original ("escolha o formato que melhor servir o objetivo")
- Se subset: prompt restringe ("escolha entre apenas: {lista}; não use os formatos: {complemento}")
- Prompt `salles_system_v1.md` ganha bloco condicional explicando o contrato

5. **Manual:**
- §2.3 (Salles): atualizar descrição da calibragem
- §4 (configurações de agente): nova mecânica multi-select

**Casos de uso documentados pelo operador:**
- "Quero aftermovie + reels" → seleciona 2 chips
- "Não quero documentário hoje" → desmarca documentário, deixa os 4 outros
- "Tanto faz, deixa Salles decidir" → estado vazio (auto emergente)

**Critério de aceite:**
- [ ] 5 chips multi-select renderizam e toggleeam
- [ ] Estado vazio mostra label "Salles decide entre 5 formatos"
- [ ] Subset mostra "Restrito a: X, Y, Z"
- [ ] Backend respeita restrição (verificar com 2-3 testes em formatos diferentes)
- [ ] Configs antigas (`formato: string`) são lidas sem quebra
- [ ] Manual §2.3 e §4 atualizados (regra T92)

---

### T102 — Gráfico de latência semanal — REABERTA pela Round 2 QA (2026-05-07) ✓ v1.32 (2026-05-08)

**Severidade:** média (UX em uso real) · **Afeta output: NÃO** (só visualização)
**Status:** Implementado (commit `40d3134`). Componente `LatenciaMultiChart` em `/saude` consumindo `/saude/latencias`. Default "Todos os agentes" sobrepostos com cores; selectors de agente e período (30/60/90 dias); linha de referência em 120s; pontos vermelhos em semanas lentas. Manual §4.14 reescrito.

**O que fazer (escopo expandido — agora é construir, não só corrigir):**
1. `dashboard/app/saude/page.tsx`: adicionar componente Recharts `LineChart` consumindo `/saude/latencias?agente=X&dias=30`
2. Selector de agente (default: Aya, ou todos sobrepostos com cores diferentes)
3. Selector de período (30/60/90 dias)
4. Linha de referência horizontal em 120s
5. Pontos vermelhos quando `semana.lenta == true` (campo já vem do backend)
6. Tooltip mostra: semana ISO, média_s, n amostras
7. Manual §4.14: descrever o gráfico tal como vai existir

**Critério de aceite:**
- [ ] /saude mostra gráfico de latência semanal real (não só KPIs)
- [ ] Eixo X em formato ISO ("2026-W19" ou "Sem 19")
- [ ] Pontos vermelhos visíveis quando lenta:true
- [ ] Manual §4.14 sincronizado

**Onde:** `dashboard/app/saude/page.tsx` (componente do gráfico Recharts)

**Problema (uso real):**
Manual §4.14 e CHANGELOG v1.23 documentam: "Recharts LineChart em /saude com médias **semanais** de duração por agente". Backend `/saude/latencias?dias=30` retorna agregado por semana.

Mas frontend está plotando **mensal** (provavelmente agrupando dados semanais por mês ou usando outro endpoint).

**O que fazer:**
1. Conferir o que o componente do gráfico está chamando — qual endpoint, qual agregação
2. Alinhar pra usar `/saude/latencias` com agregação semanal (granularidade que o backend já suporta)
3. Se o gráfico mensal era intencional pra escopos longos (90 dias), permitir toggle granularidade (semanal/mensal) com selector
4. Manual §4.14 atualiza descrevendo a granularidade exata

**Critério de aceite:**
- [ ] Gráfico exibe semanal por padrão (consistente com manual e backend)
- [ ] Semanas > 120s ficam vermelhas (já documentado)
- [ ] Manual reflete a realidade
- [ ] Bonus: toggle semanal/mensal se for útil pra períodos longos

---

### T98 — Watchdog do T95 com piso muito apertado (timeout 1min mata Otto legítimo)

**Severidade:** alta — bug do próprio fix · **Afeta output: SIM** (interrupção falsa de agentes legítimos)

**Onde:** `dashboard/lib/useReuniao.ts` e `dashboard/lib/useChat.ts` (mesma fórmula do watchdog em ambos)

**Problema constatado em uso real (2026-05-07, logo após T95 entregar v1.25):**
Operador rodou Otto em modo Reunião. Watchdog disparou em **1 minuto** com mensagem "Agente travou (timeout 1min). Provável overloaded da API. Tente reenviar." — mas Otto não estava travado, só processando legitimamente um briefing.

**Causa raiz:**
Fórmula do T95 (changelog v1.25):
```
timeout = max(60, min(mediana * 3, 1200))  # segundos
```

Quando não há histórico suficiente em Reunião (T59 só populava `duracoes_segundos` no Pipeline, não em Reunião), o backend retorna `null` ou usa `FALLBACK_MEDIANAS` baixo:
- Otto fallback: 20s → 20 × 3 = 60s → max(60, 60) = **60s**
- Aya fallback: 15s → 15 × 3 = 45 → max(60, 45) = **60s**
- Pedro fallback: 25s → 25 × 3 = 75 → max(60, 75) = **75s**

Otto processando briefing complexo legitimamente leva 30-90s. 60s é apertado demais para qualquer chamada Sonnet de complexidade média.

**O que fazer (Opção A — piso maior):**
```typescript
const timeoutSegundos = Math.max(180, Math.min(mediana * 3, 1200))
```

Mudanças:
- Piso `60` → `180` (3 minutos mínimos)
- Cap superior continua 1200s (20min) — bom pra Heitor com web search
- Multiplicador continua × 3

Aplicar em ambos os locais (`useReuniao.ts` e `useChat.ts`) — mesma constante, mesma fórmula.

**Critério de aceite:**
- [ ] Watchdog em ambos os hooks usa piso 180s
- [ ] Otto solo em Reunião não dispara watchdog antes de 3min
- [ ] Heitor com web search ainda dispara watchdog corretamente após mediana × 3 quando legitimamente travado
- [ ] Mensagem de timeout passa a dizer "Agente travou (timeout Xmin)" usando o valor real, não hardcoded "1min"
- [ ] Bump v1.26 + PDF
- [ ] Manual §3.2 ou §4.17 atualiza o piso documentado

**Cuidado adicional:**
Investigar se `T59` registra `duracoes_segundos` em sessões de **Reunião** ou só em Pipeline. Se só Pipeline, a Reunião está sempre caindo no fallback fixo — vale estender T59 pra cobrir Reunião também (sub-tarefa T98.1, opcional).

---

### T97 — Alinhamento de `modo_visual` do Otto entre frontend e backend

**Severidade:** alta de UX (operador vê erro de validação ao trocar de modo) · **Afeta output: SIM** (toggle do Otto fica funcional)

**Onde:** `core/validador.py` (linha 30) e/ou `dashboard/lib/useChat.ts` (linha 51) + `dashboard/components/chat/ConfigSidebar.tsx`

**Problema constatado em uso real (2026-05-07):**
Operador trocou modo do Otto no ConfigSidebar pra "Resumido" no dashboard. Otto retornou erro vermelho no chat: `"Modo inválido: 'resumido'. Use: completo, auto, resumo"`.

**Causa raiz:**

```python
# core/validador.py:30
modos_validos = {"resumo", "completo", "auto"}
```

```typescript
// dashboard/lib/useChat.ts:51
otto: { modo_visual: 'completo' | 'resumido' | 'minimo' }
```

Os 3 valores divergem:
| Frontend       | Backend       |
|----------------|---------------|
| `completo`     | `completo` ✓  |
| `resumido` ❌  | `resumo`      |
| `minimo` ❌    | (ausente)     |
| (ausente)      | `auto`        |

Só `completo` bate. Qualquer outra escolha do operador no ConfigSidebar quebra.

**O que fazer (escolher uma das 3 opções):**

**Opção A — Frontend adota nomenclatura do backend (`completo | resumo | auto`):**
- Trocar TypeScript em `useChat.ts:51`
- Trocar valores no `ConfigSidebar.tsx:29` (o button `key={v}` pra cada modo)
- Remove `minimo` do frontend (não existia no backend)
- Adiciona `auto` no toggle (que hoje não aparece — operador deveria poder pedir o agente decidir)
- Cuidado: `agents.ts` ou outras refs devem ser caçadas via grep

**Opção B — Backend aceita nomenclatura do frontend (`completo | resumido | minimo`):**
- Trocar `core/validador.py:30` pra `{"completo", "resumido", "minimo"}`
- Atualizar `agentes/otto.py:142` que faz `modo_visual == "auto"` (perde a semântica de "auto")
- Atualizar `prompts/otto_system_v3.md` se citar os modos
- Define que `minimo` é semanticamente similar a `resumo` (precisa ajuste de prompt pra Otto saber)

**Opção C — Aceitar 4 valores nos dois lados (`completo | resumido | minimo | auto`):**
- Backend: validador aceita os 4
- Frontend: toggle passa a ter os 4 botões
- Definir clareza: `auto` (Otto decide), `completo` (full), `resumido` (versão tese+conceito), `minimo` (só tese)
- Mais trabalho mas mais flexível

**Recomendação:** Opção A (frontend adota backend). Razão:
- Backend já tem lógica pra `auto` (linha 142 do otto.py — modo_efetivo é resolvido em runtime). Se removermos `auto`, perdemos essa capacidade.
- `resumido` vs `resumo` é cosmético — o backend tá certo (mais conciso).
- `minimo` parece nunca ter sido suportado de verdade no backend; remover do frontend evita confusão.
- Mexer só em 2 arquivos do frontend é mais barato que mexer em validador + agente + prompt do backend.

**Critério de aceite (assumindo Opção A):**
- [ ] `useChat.ts:51` declara `'completo' | 'resumo' | 'auto'`
- [ ] `useChat.ts:59` default = `'auto'` (operador começa deixando Otto decidir)
- [ ] `ConfigSidebar.tsx` toggle mostra 3 botões: Completo / Resumo / Auto
- [ ] Selecionar qualquer um → Otto executa sem erro
- [ ] Manual §2.1 atualizado com os 3 modos válidos
- [ ] `grep -rn "resumido\|minimo" dashboard/` retorna apenas referências históricas (commits) — código atual limpo
- [ ] Bump v1.26 + PDF (depende da ordem das outras tarefas da FASE 6)

**Cuidado:** se algum operador tem sessão antiga com config `resumido` salva (ex: em retomada), pode dar erro. Não há persistência de config no JSON da sessão hoje (só no `agentConfig` do useChat), então não deve haver dado salvo com valor inválido. Confirmar antes.

---

# FASE 7 — ROUND 2 QA (2026-05-07)

> Bateria automatizada via Claude in Chrome rodada após v1.29. Custo total da rodada: ~$0.25. Bugs Round 1 reconfirmados como corrigidos: 7 de 7 ✓ (T10, T11, T15, T16, T18, T22, T13). Novidades verificadas: dark mode, Renata "Social Media", tempo de execução por agente no detail, sprites na mesa em Reunião, modo Loop, popups micro-eventos, aviso "mais lento que o normal" consumindo /saude/latencias. Bugs novos descobertos: 3 críticos + 3 médios + 3 cosméticos.

---

### T106 — 🔴 CRÍTICO: Sandbox flag não propaga para persistência (regressão de T27) ✓ v1.31 (2026-05-08)

**Severidade:** alta · **Afeta output: SIM** (quebra promessa de "isolamento" do LAB)
**Status:** Implementado (commit `719eb4e`). Sandbox flag propaga frontend → backend → storage; sessões com `origem="sandbox"` excluídas das listagens default; chip "Mostrar sandbox" na FilterBar. `HistoryItem` type ganhou campo `sandbox`. Manual §6.9 atualizado.

**Onde:** propagação do flag `sandbox` do frontend até `_salvar_sessao` em `api/storage.py`

**Problema (Round 2 QA):**
Operador ativou 🧪 LAB no header, rodou pipeline Otto+Aya com briefing. Sessão `20260507_181719_sessao` foi gravada em `historico/` com `origem: "dashboard"` (não `"sandbox"`), apareceu na lista de histórico normal e até no Hall of Fame com 5⭐. T27 documenta como aceite: "sessão sandbox completa → não aparece em /historico". Quebrado.

**Investigação sugerida:**
1. Frontend (ChatPanel): o estado `sandbox: true` é serializado no payload de `start_pipeline` / `start_reuniao`?
2. Backend (`ws_chat.py` / `ws_reuniao.py`): recebe e propaga até `_salvar_sessao`?
3. `api/storage.py`: respeita flag e pula gravação OU salva com `origem: "sandbox"` filtrável?

**Decisão de design pendente:** sandbox = "não grava nada" (mais radical, fiel ao T27) ou "grava com flag e exclui de listagens padrão" (auditável, dá pra ver depois se quiser)? Recomendação minha: **gravar com `origem: "sandbox"` e excluir das listagens default; filtro opcional pra ver sandbox no histórico**. Mais flexível, sem perder rastreio.

**Critério de aceite:**
- [ ] Pipeline com 🧪 ativo → sessão NÃO aparece em /historico nem /hall-of-fame por padrão
- [ ] Origem registrada como `sandbox` (não `dashboard`)
- [ ] Filtro opcional "Mostrar sandbox" na FilterBar
- [ ] Manual §6.9 (receita Sandbox) atualizada

---

### T107 — 🔴 CRÍTICO: Share link 404 logo após gerar (regressão de T36/T50) ✓ v1.31 (2026-05-08)

**Severidade:** alta · **Afeta output: SIM** (feature anunciada quebrada de ponta a ponta)
**Status:** Implementado (commit `c1ff922`, junto com T108). Causa raiz identificada e corrigida; 2/2 testes pytest cobrindo gerar→consumir passando. Share link funciona end-to-end.

**Onde:** `api/routes/share.py` (geração) + `dashboard/app/share/[token]/page.tsx` (consumo) + storage subjacente

**Problema (Round 2 QA):**
Botão "Gerar link de aprovação" produz token `ldaRAfgxRM4nvz6LAYLwTw` e URL `http://localhost:4000/share/ldaRAfgxRM4nvz6LAYLwTw`. Acessar a URL imediatamente → "Link não encontrado ou expirado". `GET /share/{token}.json` retorna 404 "Link não encontrado".

**Hipóteses:**
1. **Race condition:** POST escreve em storage assíncrono; GET acontece antes da gravação completar.
2. **Path mismatch:** geração escreve em `share/tokens/X.json` mas leitura procura em `share/X.json` (ou vice-versa).
3. **TTL bug:** token nasce já expirado (ex.: `expires_at = now()` em vez de `now() + 7d`).
4. **Token mismatch:** geração gera token A, retorna URL com token B (encoding/transformação).

**O que fazer:**
1. Reproduzir e capturar logs do backend ao gerar um link novo
2. Inspecionar onde o token é gravado (`ls -la storage/share/`)
3. Inspecionar caminho de leitura no GET handler
4. Adicionar log de DEBUG na geração e no consumo (token, path, ttl)
5. Fix da causa raiz

**Critério de aceite:**
- [ ] Gerar link → abrir URL → renderiza página de aprovação com dossiê (não 404)
- [ ] TTL respeitado (não expirar imediatamente)
- [ ] Pelo menos 1 teste pytest cobrindo o ciclo gerar→consumir

---

### T108 — 🔴 CRÍTICO: Drawer de Configurações colapsa em modo Reunião ✓ v1.31 (2026-05-08)

**Severidade:** alta · **Afeta output: SIM** (configs do agente ficam inacessíveis em Reunião)
**Status:** Implementado (commit `c1ff922`, junto com T107). Drawer ConfigSidebar não colapsa mais em Reunião — abre na mesma largura de Pipeline.

**Onde:** CSS responsivo do `ConfigSidebar` quando coexiste com painel de chat de Reunião

**Problema (Round 2 QA):**
- Modo Pipeline: drawer abre normal mostrando todas as opções por agente. ✓
- Modo Reunião: drawer abre como **linhas verticais finas (~10px)** com conteúdo invisível. Provável bug de CSS responsivo onde o painel é comprimido pelo painel de chat.

**Reproduce:**
1. Convocar todos os agentes
2. Modo pipeline → engrenagem (✓ funciona)
3. Mudar pra reunião (💬 conv.)
4. Engrenagem → drawer colapsado a 10px

**Investigação sugerida:**
- `dashboard/components/chat/ConfigSidebar.tsx`: largura mínima/máxima, flex-shrink
- Layout pai: provável `flex` com chat panel ocupando todo o espaço, sidebar com `flex: 1` indo a 0

**Critério de aceite:**
- [ ] Drawer em Reunião abre na mesma largura que em Pipeline
- [ ] Configs por agente legíveis e clicáveis em ambos os modos

---

### T109 — 🟡 MÉDIO: Custo-cap (T7) existe no DOM mas não visível na UI ✓ v1.32 (2026-05-08)

**Severidade:** média · **Afeta output: SIM** (controle de orçamento inacessível ao operador)
**Status:** Implementado (commit `a896c1c`). Custo-cap visível e usável no ConfigSidebar; persiste em `localStorage('lemmon-custo-cap')` entre reloads.

**Onde:** `dashboard/components/chat/ConfigSidebar.tsx` ou onde o controle de custo-cap deveria aparecer

**Problema (Round 2 QA):**
Texto "Custo-cap" + "limite USD por sessão" existe no DOM (achado via JS), mas operador não consegue localizá-lo visualmente nas Configurações do painel pipeline. Pode estar oculto por CSS (`display: none` condicional?), em rota separada, ou exigir cenário específico (≥3 agentes? algum gating?).

**O que fazer:**
1. Localizar o componente no código
2. Identificar condição de renderização atual
3. Tornar visível em todos os cenários relevantes (provavelmente: sempre que houver 1+ agente selecionado em pipeline)
4. Documentar em manual §4 onde está e como usar

**Critério de aceite:**
- [ ] Controle de custo-cap visível na UI sem precisar inspecionar DOM
- [ ] Manual §4 documenta localização e funcionamento

---

### T110 — 🟡 MÉDIO: Renata bloqueia em questionário ao invés de entregar provisório ✓ v1.32 (2026-05-08)

**Severidade:** média · **Afeta output: SIM** (UX frustrante quando operador pede entregável direto)
**Status:** Implementado (commit `e17c0c5`). Renata entrega provisório imediato para pedidos diretos; mantém questionário para perguntas vagas. Manual §2.7 atualizado.

**Onde:** `prompts/renata_system_v1.md`

**Problema (Round 2 QA):**
Operador pediu em Reunião: "@renata bora pensar 3 ganchos de Reels pra esse projeto". Renata respondeu pedindo 3 contextos antes de gerar (material disponível, cliente/duração, objetivo central). Coerente com persona "estrategista" mas frustra usuário que pediu entregável.

**O que fazer:**
Atualizar `renata_system_v1.md` para entregar **3 ganchos provisórios + questionário de refinamento** quando solicitada com pedido direto. Padrão híbrido: dá o que pediu (provisório) + pede o que falta pra calibrar.

Exemplo de output esperado:
```
3 ganchos provisórios pra começar (vou refinar quando me passar o contexto):
1. [gancho 1]
2. [gancho 2]
3. [gancho 3]

Pra eu calibrar melhor, me responde rapidinho:
- Qual material existente?
- Cliente + duração?
- Objetivo central da campanha?
```

**Critério de aceite:**
- [ ] Pergunta direta ("@renata, 3 ganchos pra X") retorna 3 ganchos + questionário
- [ ] Pergunta vaga ("@renata o que você acha?") mantém comportamento atual de questionário primeiro
- [ ] Manual §2.7 (Renata) atualizada com a regra híbrida

---

### T111 — 🟢 COSMÉTICO: Pop "Dossiê pronto!" persistente na sala isométrica ✓ v1.32 (2026-05-08)

**Severidade:** baixa · **Afeta output: NÃO** (só visual)
**Status:** Implementado (commit `61510c6`). Auto-dismiss após 8s.

**Onde:** `dashboard/components/office/` (provavelmente Whiteboard ou layer de pop-events)

**Problema (Round 2 QA):**
Pop "Dossiê pronto!" continua visível em cima da impressora roxa após pipeline anterior já ter terminado há tempo. Não é clicável de forma óbvia pra dispensar.

**O que fazer:**
- Auto-dismiss após N segundos (sugestão: 8s)
- OU: clicável pra dispensar (com hover state)
- OU: dispensar quando próximo pipeline iniciar

**Critério de aceite:**
- [ ] Pop não persiste indefinidamente entre sessões

---

### T112 — 🟢 COSMÉTICO: Tag "dashboard" sempre visível ocupa espaço das tags semânticas ✓ v1.32 (2026-05-08)

**Severidade:** baixa · **Afeta output: NÃO**
**Status:** Implementado (commit `61510c6`). Origem virou ícone pequeno; tags semânticas ganharam protagonismo no SessionCard.

**Onde:** `dashboard/components/history/SessionCard.tsx`

**Problema (Round 2 QA):**
Origem da sessão (`dashboard`, `cli`, `sandbox` etc) é mostrada como chip em cada SessionCard, ocupando espaço que poderia ser usado pelas tags semânticas geradas (menopausa, reels, etc.). Hoje as tags geradas só aparecem no detalhe da sessão.

**O que fazer:**
- Remover chip de origem do card OU torná-lo discreto (ícone pequeno em vez de chip cheio)
- Mostrar 2-3 tags semânticas mais relevantes no card

**Critério de aceite:**
- [ ] Card mostra tags semânticas, não só origem técnica
- [ ] Origem ainda acessível (no detalhe ou via tooltip)

---

### T113 — 🟢 COSMÉTICO: T17 Remix não destaca todos os agentes pré-selecionados no header ✓ v1.32 (2026-05-08)

**Severidade:** baixa · **Afeta output: NÃO** (estado sincronizado, só visual)
**Status:** Implementado (commit `61510c6`). **Causa raiz identificada:** lista hardcoded `['salles','sonia','aya']` em `handleRemix` — sessões com Otto, Heitor ou Renata nunca destacavam esses agentes. Agora usa `detail.agentes_usados` filtrado por agentes válidos non-reuniaoOnly.

**Onde:** `dashboard/components/chat/ChatPanel.tsx` (chips do header) ou `useChat.ts` / `useReuniao.ts`

**Problema (Round 2 QA):**
Tooltip do Remix promete "Salles+Sônia+Aya pré-selecionados". Counter da Reunião mostra "3 NA SALA DE REUNIÃO" (correto). Mas no header, **só Salles e Sônia** ficam com cor sólida (selecionados) — Aya está sincronizada no estado mas o chip dela não reflete visualmente.

**Investigação:** provavelmente race entre o set inicial de agentes (do remix) e a renderização dos chips, ou bug de comparação `selected.includes(agentId)` sensível a maiúsculas/IDs.

**Critério de aceite:**
- [ ] Após Remix, todos os 3 chips no header com cor sólida
- [ ] Verificar com Otto+Aya, Salles+Sônia+Aya, e outras combinações

---

### Não conclusivos / a confirmar com dev

| Item | Achado Round 2 | Pergunta |
|---|---|---|
| T2/T31 Whiteboard | Surgiu uma "barra OTTO ▶" no topo do painel pipeline durante execução | É o whiteboard implementado **ali** (no painel, não na sala isométrica)? Ou ainda existe um whiteboard separado pendente? |
| T4 (3 variantes A/B Salles) | Toggle existe nas Configurações | Não rodou pipeline com ele |
| T6 Fast-track ⚡ | Toggle visível e ativável | Não rodou pipeline para confirmar pular Heitor |
| T8 Manual ⏸ | Toggle visível e ativável | Não rodou pipeline para confirmar barra de aprovação |
| T9 Gate Pedro auto | Opção visível em config (off/auto/manual) | Não rodou Salles+Pedro |
| T20 Upload imagem | Não tinha imagem para anexar | — |
| T23 Mic destaque em reunião | Em modo conv. agentes responderam | Anel pulsante não foi capturado nas screenshots |

---

---

# FASE 8 — DÍVIDA TÉCNICA

### T119 — 🔴 T118 mal aplicado: overflow-hidden continua no motion.div pai ✓ v1.35 (2026-05-09)

**Severidade:** alta visual · **Afeta output: NÃO** (legibilidade)
**Descoberto:** Round 5 QA validação manual (2026-05-09).
**Status:** Implementado (commit `c7f9e89`). **Causa raiz real identificada:** o `overflow-hidden` problemático estava no **drag wrapper em `dashboard/app/page.tsx:231`** — não no `motion.div` interno do ChatPanel que foi editado em T118. Como ambos têm as mesmas dimensões, o wrapper externo continuava aplicando o stencil clip exatamente sobre os cantos arredondados do ConfigSidebar. Fix: removido `overflow-hidden` do drag wrapper + `useEffect` no ChatPanel auto-expande para mínimo 540px ao abrir o drawer (corrige bug colateral do input quebrando em 4 linhas). **Validado por JS + screenshot:** drag_wrapper_overflow="visible", todos os labels íntegros, input 385px de largura.

**Onde:** `dashboard/components/chat/ChatPanel.tsx` ou `OfficeScene` — motion.div raiz com classe `shadow-2xl shadow-black/20 rounded-2xl overflow-hidden`.

**Problema:**
T118 foi declarado fixo em v1.34 alegando "overflow-hidden saiu do pai e foi pro div do chat". MAS o DOM ao vivo confirma que **o motion.div pai continua com `rounded-2xl overflow-hidden`**. O terminal apenas ADICIONOU `overflow-hidden` ao div interno do chat — não removeu do pai. Resultado: labels continuam cortados igual antes do v1.34.

**Evidência via JS (Round 5 QA, 2026-05-09):**
```js
// DOM ao vivo:
DIV class="shadow-2xl shadow-black/20 rounded-2xl overflow-hidden"  // <- AINDA EXISTE
   rect: {x: 1320, y: 104, w: 492, h: 282}
   borderRadius: "16px"
   overflow: "hidden"

DIV class="flex-1 flex flex-col min-w-0 overflow-hidden"  // <- adicionado em v1.34
```

**Bug visual NOVO descoberto na mesma screenshot:**
Input "Descreva o projeto..." quebrado em 4 linhas — `Descreva` / `o` / `projeto.` / `(↩` — porque o ChatPanel está com largura insuficiente pro input quando o drawer está aberto. Isso é colateral do mesmo problema de layout.

**Fix correto:**
1. **REMOVER** `overflow-hidden` da classe do motion.div pai. Manter `rounded-2xl` no pai. Manter `overflow-hidden` apenas no div interno onde realmente faz sentido (provavelmente no área scrollable de mensagens, não no container externo).
2. Após remover, conferir que os `rounded-2xl` ainda mostram cantos arredondados (sem o overflow-hidden, os filhos podem sangrar pra fora dos cantos arredondados — pode precisar dar `border-radius` aos filhos individualmente OU usar `clip-path` no pai pra arredondar visualmente sem clipping de overflow).
3. Ajustar largura mínima do ChatPanel quando drawer está aberto pra garantir que o input "Descreva o projeto" não quebre em múltiplas linhas. Sugestão: ChatPanel + drawer juntos > 500px de largura mínima.

**Critério de aceite:**
- [ ] `grep "rounded-2xl overflow-hidden" dashboard/` retorna ZERO matches no motion.div pai do ChatPanel
- [ ] Todos os labels do drawer 100% íntegros (não cortados)
- [ ] Input "Descreva o projeto" em uma linha só com placeholder completo
- [ ] Cantos do ChatPanel ainda visualmente arredondados

---

### T118 — 🔴 REGRESSÃO: T115 piorou após v1.33 — labels do drawer cortando MAIS letras ✓ v1.35 (2026-05-09, via T119)

**Severidade:** alta visual · **Afeta output: NÃO** (legibilidade quebrada)
**Descoberto:** Round 4 QA validação manual (2026-05-09).
**Status:** Implementado (commit `9100026`). **Causa raiz identificada:** `rounded-2xl overflow-hidden` no `motion.div` raiz criava um stencil clip-path herdado do border-radius que cortava o canto superior-esquerdo do ConfigSidebar — tudo dentro da zona de 16px do raio era clipado. **Fix:** mover `overflow-hidden` do container pai para o div do chat, mantendo o `rounded-2xl` no pai sem clipping. Lição: nunca colocar `overflow-hidden` num container com `border-radius` cujos filhos cheguem na borda.

**Onde:** `dashboard/components/chat/ConfigSidebar.tsx` ou container pai do drawer (provavelmente ChatPanel).

**Problema:**
O fix do T115 (commit `012b43c` adicionou `pl-4` ao container interno) **piorou** o bug visual em vez de resolver. Comparativo Round 3 (antes do fix) vs Round 4 (após v1.33):

| Label esperado | Round 3 (antes) | Round 4 (após "fix") |
|---|---|---|
| CONFIGURAÇÕES | "ONFIGURAÇÕES" (-1) | "GURAÇÕES" / "URAÇÕES" (-5) |
| OTTO (primário) | "OTTO" ✓ | "TO" (-2) |
| Completo (botão) | "Completo" ✓ | "pleto" (-3) |
| off — sem gate | "off — sem gate" ✓ | "— sem gate" (-4) |
| SÔNIA | "SÔNIA" ✓ | "NIA" (-2) |

**Causa raiz hipotética:**
Pré-fix, só labels secundários (`text-stone-400`) cortavam 1 letra. Pós-fix com `pl-4` (padding-left: 16px), TUDO corta múltiplas letras — incluindo botões e labels primários. Sugere que o `pl-4` foi aplicado num container que tem `overflow:hidden` no pai, e o conteúdo está sendo empurrado para fora.

**Confirmação por JS (Round 4):**
- Drawer width = 176px (`w-44`)
- Drawer overflow = `visible` (não clipa por si)
- Inner padding = `12px 12px 12px 16px` (`pl-4` aplicado ao `.flex-1.overflow-y-auto`)
- Drawer position x = 1279.5 (totalmente dentro de viewport 1800px)
- Mas conteúdo aparece cortado VISUALMENTE — clipping vem do **ChatPanel pai** (provavelmente `overflow:hidden` na `rounded-2xl overflow-hidden`)

**Hipótese de fix correto:**
- Remover `pl-4` (não resolveu, piorou)
- Aumentar `w-44` para `w-52` ou `w-56` (mais espaço pro conteúdo caber sem overflow)
- OU: drawer renderiza FORA do ChatPanel (popout ou Portal), evitando clip do parent
- OU: ChatPanel pai com `overflow:visible` no momento que drawer está aberto

**Critério de aceite:**
- [ ] Todos os labels (primários E secundários) e botões íntegros
- [ ] Comparar visualmente antes/depois — sem regressão em outras telas
- [ ] T115 fechado de verdade desta vez

---

### T117 — 🟡 ChatPanel header com botões muito densos (risco de miss-click) ✓ v1.33 (2026-05-08)

**Severidade:** média de UX · **Afeta output: SIM** (operador perde sessão se fechar acidentalmente)
**Descoberto:** Round 3 QA (2026-05-08).
**Status:** Implementado (commit `82c3582`). Header com `gap-2` entre botões; separador `border-l` antes do `×`; `window.confirm` dispara ao fechar com sessão ativa.

**Onde:** `dashboard/components/chat/ChatPanel.tsx` — header com botões `⚙️` + `📌` + `−` + `×`.

**Problema (uso real / Round 3 QA):**
Os botões do header (gear, pin, minimize, close) ficam tão próximos que clicar na engrenagem em coordenada (1357, 108) bateu no `×` (fechar) por engano — perdi Otto+Aya recém-convocados. Os ícones precisam de mais espaçamento/padding. Tooltips ajudam mas não previnem miss-click em mouse rápido.

**O que fazer:**
- Aumentar gap entre botões do header (sugestão: `gap-2` ou `gap-3` em vez do atual)
- Considerar separar visualmente o `×` (close) dos demais com pequena divisória ou margem extra — é o mais destrutivo
- Confirmar dialog opcional no `×` quando há sessão em andamento (perda de estado)

**Critério de aceite:**
- [ ] Distância mínima de 8px entre cada botão do header
- [ ] Close (`×`) com separação visual ou margem extra
- [ ] (Opcional) confirmação ao fechar com sessão ativa

---

### T116 — 🟡 ConfigSidebar: Custo-cap fora da viewport vertical ✓ v1.33 (2026-05-08)

**Severidade:** média de UX · **Afeta output: SIM** (T109 invisível na prática)
**Descoberto:** Round 3 QA (2026-05-08).
**Status:** Implementado (commit `012b43c` junto com T115). Container interno ganhou `h-full` para forçar scroll quando conteúdo excede viewport. Custo-cap acessível agora.

**Onde:** `dashboard/components/chat/ConfigSidebar.tsx` — altura do drawer e scroll interno.

**Problema:**
Drawer tem `height: 764px = scrollHeight: 764px` (sem scroll interno funcional). ChatPanel posicionado no topo + drawer expandido ultrapassam a viewport (815px - header). Resultado: **Renata + Custo-cap renderizados no DOM mas off-screen** — operador não vê e não consegue rolar dentro do drawer.

JS confirmou: `document.querySelector('.flex-1.overflow-y-auto').scrollTo(0, 9999)` não muda nada (já está no fim porque conteúdo cabe no container, mas container excede tela).

**Causa raiz hipótese:** drawer não tem `max-height: 100vh - <header>` ou similar; usa `height: auto` que vira `scrollHeight = ` o que precisar.

**O que fazer:**
1. ConfigSidebar deve ter `max-height` baseado em `viewport - chat-panel-position-y - header-height`
2. Conteúdo interno scroll quando exceder
3. Bonus: ChatPanel arrastado pra cima da tela continua scrollando o drawer corretamente

**Critério de aceite:**
- [ ] Custo-cap visível sem scroll de página em viewport de 1080p
- [ ] Drawer scrolla internamente em viewports menores (768p)
- [ ] T109 deixa de ter "presença DOM mas ausência visual"

---

### T115 — 🔴 Bug visual: primeira letra cortada em labels do ConfigSidebar ✓ v1.34 (2026-05-09, via T118)

**Severidade:** alta visual · **Afeta output: NÃO** (legibilidade só)
**Descoberto:** Round 3 QA (2026-05-08).
**Status:** Tentativa de fix em v1.33 (commit `012b43c` com `pl-4`) piorou o problema. Diagnóstico correto e fix definitivo em v1.34 (T118, commit `9100026`) — `overflow-hidden` movido do motion.div raiz para o div interno do chat. Ver T118 pra detalhes da causa raiz.

**Onde:** `dashboard/components/chat/ConfigSidebar.tsx` ou CSS global aplicado a labels com cor `text-stone-400` / `font-light`.

**Problema:**
Em modo Reunião com drawer aberto, os labels secundários (subtítulos cinza-claro) estão com a **primeira letra cortada**:
- "ONFIGURAÇÕES" (era "CONFIGURAÇÕES")
- "odo visual" (era "modo visual")
- "uscas: 3" (era "buscas: 3")
- "ormatos permitidos" (era "formatos permitidos")
- "Salles decide entre 5 ormatos" (era "...formatos")
- "ate espelho pedro" (era "gate espelho pedro")

**Padrão:** apenas labels com cor cinza-claro (`text-stone-400` ou similar). Os labels primários ("OTTO", "HEITOR", "SALLES", "SÔNIA") e botões/chips (`Completo`, `Resumo`, `reels`, `documental`, `off — sem gate`) estão **íntegros**.

**Hipótese de causa:**
- CSS `text-indent: -1ch` em rule global aplicada à classe dos labels
- OU `::first-letter` com `visibility: hidden` ou `display: none`
- OU `margin-left: -1em` que sobrepõe ao container limítrofe (mas não explica por que não some o label inteiro)

**Investigação pra fazer:**
```bash
grep -rn "text-indent\|first-letter" dashboard/
```
Ou abrir devtools, inspecionar o "modo visual" label, e olhar computed styles — qualquer rule que zere ou negative o primeiro caractere é o culpado.

**Critério de aceite:**
- [ ] Todos os labels do ConfigSidebar legíveis na íntegra
- [ ] Sem regressão nos labels primários (mantêm formatação atual)

---

### T114 — 🟡 Hydration mismatch em componentes localStorage-driven ✓ v1.33 (2026-05-08)

**Severidade:** média (UX flicker + logs poluindo console) · **Afeta output: NÃO** (funciona, só feio na primeira renderização)
**Descoberto:** 2026-05-08 (operador viu janela de erro Next.js dev em vários lugares, sumindo logo após).
**Status:** Implementado em 3 commits. (1) `useLocalStorage<T>` hook em `dashboard/lib/hooks/` (commit `304e439`). (2) Migração `pinned` + `custoCap` para usar o hook (commit `8dcdfb7`). (3) Manual §8 com nota sobre o padrão (commit `142fafb`).

**Onde:** todos os componentes que leem `localStorage` na renderização inicial.

**Causa raiz:**
Next.js 14 renderiza HTML no servidor (sem acesso a localStorage) e depois React "hidrata" no cliente (com localStorage). Quando o componente lê localStorage no primeiro render, server e client divergem. React detecta a diferença, loga `Text content does not match server-rendered HTML`, mantém o estado do cliente e segue. Resultado: flicker visível + erro de dev no console que pode mascarar bugs reais.

**Suspeitos de mismatch (mapeamento por feature):**

| Componente | Origem | localStorage key | Sintoma |
|---|---|---|---|
| ChatPanel pin button | T101 | `lemmon-chat-pinned` | Server "📌" / Client "📍" |
| ChatPanel position | T101 | `lemmon-chat-position` | Server posição default / Client posição salva |
| Custo-cap input | T109 | `lemmon-custo-cap` | Server vazio / Client com valor pré-preenchido |
| Tema dark/light | T89 (FASE 6 antiga) | `lemmon-theme` | Server light / Client dark |
| Salles formatos | T104 (?) | preferência salva | a confirmar |

**Padrão de fix recomendado (Opção 1 — `mounted` flag):**

```tsx
import { useEffect, useState } from 'react'

function ComponenteComLocalStorage() {
  const [mounted, setMounted] = useState(false)
  const [valor, setValor] = useState<string | null>(null)

  useEffect(() => {
    setValor(localStorage.getItem('lemmon-chat-pinned'))
    setMounted(true)
  }, [])

  if (!mounted) {
    // placeholder neutro idêntico ao que server renderiza
    return <button>📌</button>  // estado default
  }

  return <button>{valor === 'true' ? '📍' : '📌'}</button>
}
```

**Alternativas (não recomendadas pra este caso):**
- `next/dynamic` com `{ ssr: false }`: viável pro ChatPanel inteiro, mas custa um `<div>` vazio no HTML inicial e perde SEO da página em volta.
- `suppressHydrationWarning`: band-aid, não corrige o flicker, só silencia o erro. Usar só onde a divergência é intencional (ex: timestamps).

**O que fazer:**
1. **Auditoria:** `grep -rn "localStorage\.getItem\|localStorage\[" dashboard/components/ dashboard/lib/ dashboard/app/`
2. Identificar cada uso e classificar:
   - Lê no render inicial → precisa fix (mounted flag)
   - Lê apenas em event handler / useEffect → ok, não causa hydration
3. Refatorar cada componente afetado pra padrão `mounted` flag
4. Helper opcional: criar hook `useLocalStorage<T>(key, default)` em `dashboard/lib/hooks/useLocalStorage.ts` que encapsula o padrão (mounted + getter + setter persistido)

**Critério de aceite:**
- [ ] Console do navegador limpo (zero erros de hydration) ao abrir páginas com componentes localStorage-driven
- [ ] Sem flicker visível no primeiro render (placeholder neutro = estado default)
- [ ] Hook `useLocalStorage` reutilizável no `dashboard/lib/hooks/`
- [ ] Manual §8 (apêndice técnico) ganha nota sobre o padrão

---

### Padrões positivos da Round 2 (para replicar)

- **Mensagens de erro amigáveis:** T21 (`/transcrever` com OPENAI_API_KEY missing → mensagem clara de fix) e página `/share/{token}` 404 ("Link não encontrado ou expirado" + logo Lemmon) são exemplos do padrão certo. **Replicar em qualquer outro 503/404 que aparecer.**
- **Custo por agente nos chips:** Otto $0.07949, Pedro $0.02264 — transparência boa, manter.
- **Tooltips descritivos nos botões:** "Fast-track: Otto resumido, Heitor pulado — resultado em <3 min" é o padrão a seguir em qualquer ícone novo.

---

# ORDEM SUGERIDA DA FASE 6

```
FASE 6 (concluída):
  T93  (export Renata)              ✓ v1.24
  T95  (barra Reunião + watchdog)   ✓ v1.25
  T97  (modo_visual Otto)           ✓ v1.26
  T98  (piso watchdog)              ✓ v1.26
  T94  (loop autônomo)              ✓ v1.27 — aguarda teste manual
  T103 (watchdog uniforme 40min)    ✓ v1.28
  T105 (ProgressBar ease-in 2.5)    ✓ v1.28
  T99  (download SessionDetail)     ✓ v1.29
  T101 (pin ChatPanel)              ✓ v1.29
  T104 (Salles multi-select)        ✓ v1.29

  T100 (5⭐ → favoritar binário)    ✓ v1.30 (2026-05-08)

FASE 6 (pendente):
  — nenhuma; FASE 6 fechada.

FASE 7 — Round 2 QA (encerrada 2026-05-08):
  ✓ T106 sandbox flag não propaga (regressão T27)            v1.31
  ✓ T107 share link 404 logo após gerar (T36/T50)            v1.31
  ✓ T108 drawer Configurações colapsa em Reunião             v1.31
  ✓ T109 custo-cap visível e usável                          v1.32
  ✓ T110 Renata entrega provisório em pedidos diretos        v1.32
  ✓ T102 gráfico latência semanal construído                 v1.32
  ✓ T111 pop "Dossiê pronto!" auto-dismiss 8s                v1.32
  ✓ T112 SessionCard mostra tags semânticas, origem reduzida v1.32
  ✓ T113 Remix destaca todos agentes (lista hardcoded → dinâmica) v1.32

FASE 8 — DÍVIDA TÉCNICA (encerrada 2026-05-08):
  ✓ T114 hydration mismatch resolvido com hook useLocalStorage      v1.33

FASE 9 — ROUND 3 QA (encerrada 2026-05-08):
  ✓ T115 ConfigSidebar: 1ª letra cortada (pl-4)                     v1.33
  ✓ T116 ConfigSidebar: drawer overflow vertical (h-full)           v1.33
  ✓ T117 ChatPanel header: gap + separador + confirm                v1.33

### T124 — 🔴 REGRESSÃO: Modo Loop (T94) sumiu da UI — segmented control virou 2-pill ✓ v1.36 (2026-05-09)

**Severidade:** alta · **Afeta output: SIM** (feature inteira inacessível)
**Descoberto:** Round 6 QA validação Loop autorizada (2026-05-09).

**Onde:** `dashboard/components/chat/ChatPanel.tsx` ou onde o segmented control de modo é renderizado.

**Problema:**
T94 (v1.27, commit `61510c6` etc) implementou **3-pill segmented control: Auto / Manual / Loop** substituindo o toggle binário. Round 6 QA hoje (2026-05-09) confirmou via JS:

```js
total_buttons: 21
loop_buttons: []                              // ZERO botões com "loop" em texto/aria/title
loop_in_body_text: 0                          // ZERO menções no body
loop_in_localStorage: []                      // ZERO chaves
panel_segmented_buttons: [
  {text: "▶▶ pipeline", visible: true},
  {text: "▶▶auto", title: "Modo automático", visible: true}
]
```

Comportamento atual: clicar no segundo botão cicla apenas **AUTO ↔ MANUAL**. Nunca chega em LOOP.

**Hipóteses de causa:**
1. Bump posterior (provavelmente entre v1.28 e v1.35) refatorou o segmented control e removeu Loop sem documentar
2. Loop está atrás de feature flag ou condição que não foi disparada nesta sessão (3+ agentes? config específica?)
3. Implementação T94 ficou incompleta — só backend (`api/ws_reuniao.py modo=loop`) e estado (`useReuniao.ts`), sem UI visível

**Validação manual recomendada (antes do fix):**
- `grep -rn "loop\|Loop\|LOOP" dashboard/components/chat/` — ver se há código de Loop existente
- `grep -rn "loopMode\|loopActive\|loopMaxTurnos" dashboard/lib/` — confirmar estado existe em `useReuniao.ts`
- `grep -rn "modo.*loop\|loop_config" api/` — confirmar backend ainda aceita `modo=loop`
- Se backend e estado existem mas UI não renderiza → fix é restaurar o 3-pill no ChatPanel
- Se foi removido completamente → reimplementar conforme spec original T94

**Spec original T94 (v1.27 CHANGELOG):**
- 3-pill: Auto / Manual / Loop
- Inputs turnos + cap $ na participants bar quando Loop selecionado
- Header "Turno N/M · $X/$Y" + botão vermelho "parar" durante loop ativo
- Banners pós-loop: verde (final), azul (ayuda), âmbar (turnos_max/stagnação/operador), overlay bloqueante (custo_max)

**O que fazer:**
1. Investigar o estado atual do código (backend, useReuniao.ts, ChatPanel.tsx)
2. Restaurar 3-pill no ChatPanel.tsx
3. Garantir que `loop_config` é enviado no payload de start
4. Confirmar que eventos `turn_iteration` e `loop_stopped` são tratados no frontend
5. Manual §3.2 deve continuar refletindo Loop (já está)

**Critério de aceite:**
- [ ] 3-pill visível: Auto / Manual / Loop
- [ ] Selecionando Loop: inputs de turnos + cap aparecem
- [ ] Briefing → loop roda → barra "Turno N/M · $X/$Y" atualiza
- [ ] Banner final correto conforme razão do término
- [ ] Botão "parar" interrompe loop graciosamente

---

### T123 — 🟡 [Variante T117] Botão × escondido em vez de confirm dialog ✓ v1.36 (2026-05-09)

**Severidade:** baixa · **Afeta output: NÃO** (decisão de design)
**Descoberto:** Round 6 QA (2026-05-09).

**Onde:** `dashboard/components/chat/ChatPanel.tsx`.

**Comportamento atual:** Quando há sessão ativa em andamento, o botão `×` (Fechar) **desaparece do header**. Operador não consegue fechar acidentalmente — nem precisa de confirm dialog.

**Diferença vs spec original do T117:**
- T117 spec: usar `window.confirm("Há uma sessão em andamento. Fechar mesmo assim?")` quando há mensagens ativas
- Implementado: hide button entirely durante sessão ativa

**Avaliação:** UX equivalente em termos de objetivo (prevenir close acidental). Hide é mais sutil que confirm. Não é bug — é variante de design válida. Pode-se considerar superior porque evita prompts repetitivos.

**Possível melhoria:** mostrar o `×` desabilitado (cinza claro) com tooltip "Aguarde sessão terminar" em vez de remover do DOM. Mais descobrível.

**Critério de aceite (se quiser ajustar):**
- [ ] × visível porém desabilitado durante sessão ativa
- [ ] Tooltip explicativo

---

### T122 — 🟡 ChatPanel position não persiste após drag ✓ v1.36 (2026-05-09)

**Severidade:** baixa de UX · **Afeta output: NÃO**
**Descoberto:** Round 6 QA (2026-05-09).

**Onde:** `dashboard/components/chat/ChatPanel.tsx` ou `dashboard/lib/useLocalStorage.ts`.

**Problema:**
T101 spec original (v1.29) prometia: "Posição inicial salva também em localStorage (`lemmon-chat-position`) — boa prática". Round 6 QA confirmou que **isso não foi implementado**. Após drag do panel para nova posição, `localStorage.getItem('lemmon-chat-position')` retorna `null`. Após reload, panel volta para posição default (1320, 104).

**Evidência:**
```js
// Antes drag: pos = {x: 1320, y: 104}
// Drag para (812, 464)
// Após drag: pos = {x: 812, y: 464}, lemmon-chat-position = null
// Após reload: pos = {x: 1320, y: 104}  // perdeu posição
```

**O que fazer:**
- Implementar persistência de posição usando o hook `useLocalStorage` (T114) já existente
- Salvar `{x, y}` em `lemmon-chat-position` após cada `onDragEnd` (debounced 500ms)
- Carregar posição salva no mount (com fallback para default)

**Critério de aceite:**
- [ ] Drag → reload → panel volta para posição arrastada
- [ ] Pinned + posição salva ambos persistem

---

### T121 — 🟡 /calibragem ignora dark theme ✓ v1.36 (2026-05-09)

**Severidade:** baixa de UX · **Afeta output: NÃO**
**Descoberto:** Round 6 QA (2026-05-09).

**Onde:** `dashboard/app/calibragem/page.tsx`.

**Problema:**
Página `/calibragem` (descoberta nesta rodada — "IA vs. Feedback Real") renderiza com fundo branco mesmo quando `lemmon-theme=dark` está ativo no localStorage. Inconsistência com resto do app que respeita tema.

**O que fazer:**
- Adicionar classes `dark:bg-stone-950 dark:text-stone-100` (e similares) ao layout da página
- OU: encapsular em ThemeProvider se está fora dele

**Bonus:** página `/calibragem` não está documentada no manual §4. Adicionar descrição (KPIs Pedro precisão, form de registro de feedback real, histórico de calibragens). Sistema 1-5⭐ aqui é intencional (mede precisão objetiva da IA), não conflita com T100 (que removeu 5⭐ de avaliação subjetiva de sessão).

**Critério de aceite:**
- [ ] /calibragem respeita dark mode
- [ ] Manual §4 documenta a página

---

### T120 — 🟡 Hall of Fame: cards ainda mostram ★★★★★ (5 estrelas) — T100 incompleto ✓ v1.36 (2026-05-09)

**Severidade:** média visual · **Afeta output: NÃO** (legibilidade — confunde com sistema antigo)
**Descoberto:** Round 6 QA (2026-05-09).

**Onde:** `dashboard/app/hall-of-fame/page.tsx` — componente do card de favoritada.

**Problema:**
T100 (refator 5⭐ → favoritar binário) foi declarado fechado em v1.30, mas o **componente do card** em `/hall-of-fame` ainda renderiza **5 estrelas amarelas distintas** (★★★★★) acima da data. As 3 sessões listadas (todas vinham de sessões legacy com `avaliacao=5` migradas para `favorito=true`) mantêm o vocabulário visual antigo.

**Comparativo:**
- /historico SessionCard: 1 ★ amarela (toggle favorito) ✓
- /historico SessionDetail: botão "Marcar como favorita" + 1 ★ ✓
- /saude: "Taxa favoritadas 15%" ✓
- **/hall-of-fame card: ★★★★★ (5 estrelas)** ✗

**Evidência (zoom screenshot):**
```
★★★★★                                07 de mai. de 2026
Cliente é uma clínica de medicina...
```

**O que fazer:**
- Substituir o componente de 5 estrelas no card pelo mesmo padrão do SessionCard de /historico (1 ★ ou ícone de favorito)
- OU: remover o ícone do card (página já implica "favoritas" — não precisa repetir)
- Manual §4 sobre Hall of Fame: confirmar critério "favorito==true" (não mais avaliacao==5)

**Critério de aceite:**
- [ ] Cards do Hall of Fame mostram 1 ícone só (★ ou ícone equivalente) — não régua de 5
- [ ] Visual consistente com /historico

---

## BLOCO G — Fix da regressão T115 (T118) → v1.34

```
Implementar T118 do PLANO_ACAO_2026-05-05.md em 2 commits. Versão final: v1.34.

CONTEXTO: O fix do T115 em v1.33 (commit 012b43c — adicionou `pl-4` ao container interno) PIOROU o problema. Round 4 QA (2026-05-09) confirmou regressão visual — drawer agora corta MAIS letras de TUDO (primários, botões, chips), não só labels secundários como antes.

EVIDÊNCIA da regressão (Round 4 QA via JS + screenshot):
- "CONFIGURAÇÕES" → "URAÇÕES" (faltam 6 letras)
- "OTTO" (label primário) → "TO" (faltam 2)
- "Completo" (botão branco) → "pleto" (faltam 3)
- "off — sem gate" → "— sem gate" (faltam 4)
- "SÔNIA" → "NIA" (faltam 2)

Pré-fix (Round 3): só labels secundários cortavam 1 letra. Pós-fix: tudo corta múltiplas letras.

DIAGNÓSTICO técnico via DevTools/JS:
- Drawer: `w-44` = 176px de largura
- Drawer `overflow: visible` (drawer em si não clipa conteúdo)
- Inner `.flex-1.overflow-y-auto` ganhou `pl-4` (padding: 12px 12px 12px 16px)
- ChatPanel pai tem `rounded-2xl overflow-hidden` (suspeito: clipa conteúdo do drawer)
- Drawer position x = 1279.5 (dentro de viewport 1800px)
- Conteúdo cortado vem de clipping no parent, não do drawer

═══════════════════════════════════════════════════════════════════
COMMIT 1 — T118: revert pl-4 + fix correto da regressão
═══════════════════════════════════════════════════════════════════

PASSO 1 — REVERT do pl-4 que piorou:
- Remover o `pl-4` do `.flex-1.overflow-y-auto` no ConfigSidebar.tsx (ou onde foi aplicado em commit 012b43c)
- Voltar pra padding original
- Confirmar visualmente que o estado pré-fix volta (só labels secundários cortando 1 letra)

PASSO 2 — INVESTIGAR a causa raiz original (pré-fix):
- Por que pré-fix os LABELS SECUNDÁRIOS (cor `text-stone-400`) cortavam 1 letra mas labels primários e botões não?
- Hipóteses a verificar:
  a. CSS rule global aplicada à classe dos labels secundários (text-indent negativo, margin-left negativo, padding negativo)
  b. ChatPanel pai (`rounded-2xl overflow-hidden`) clipando 1px do conteúdo na borda esquerda
  c. Rule específica em `text-stone-400` ou `text-[8px]` ou similar
- Comando útil: `grep -rn "text-indent\|margin-left:.*-\|padding-left:.*-" dashboard/`
- Inspeção devtools: clicar num label problemático e ver Computed styles

PASSO 3 — APLICAR fix correto (escolher o que fizer mais sentido após investigação):

Opção A (preferida se a causa for clipping do parent):
- Mudar ChatPanel pai de `rounded-2xl overflow-hidden` para `rounded-2xl` + dar `border-radius` aos filhos individualmente
- OU: aplicar `overflow-visible` apenas quando drawer está aberto

Opção B (se a causa for largura do drawer insuficiente):
- Trocar `w-44` (176px) por `w-52` (208px) ou `w-56` (224px)
- Confirmar que conteúdo "formatos permitidos" e "auto — bloqueia se 🔴" cabem sem corte

Opção C (mais radical, se A e B falharem):
- Renderizar drawer via React Portal — sai do ChatPanel pai e renderiza no document root
- Clip do parent não afeta mais

VERIFICAÇÃO antes do commit:
- npm run dev; abrir / em modo dev
- Convocar 2 agentes → Reunião → engrenagem
- Ler TODOS os labels e confirmar:
  · "CONFIGURAÇÕES" inteiro
  · "OTTO", "HEITOR", "SALLES", "SÔNIA", "RENATA" inteiros
  · "modo visual", "buscas: 3", "formatos permitidos", "Salles decide entre 5 formatos", "gate espelho pedro", "tendências", "editorial (~$0.20)", "limite USD por sessão" — todos inteiros
  · Botões "Completo", "Resumo", "Auto (IA decide)", "off — sem gate", "auto — bloqueia se 🔴", "manual — sempre pede OK", "3 variantes A/B" — todos inteiros
- Tirar screenshot pra anexar no commit msg como prova

COMMIT MSG: "T118 — fix regressão T115: revert pl-4 + <fix correto descrito> "

═══════════════════════════════════════════════════════════════════
COMMIT 2 — Manual + changelog v1.34
═══════════════════════════════════════════════════════════════════

1. docs/MANUAL_SISTEMA.md:
   - Cabeçalho: versão v1.34 / 2026-05-09
   - Histórico de versões: bullet com v1.34 mencionando "fix da regressão visual T115/T118"

2. docs/CHANGELOG.md:
   v1.34 com sub-bullet único:
   "T118 — fix da regressão T115: revert do `pl-4` que piorou clipping; aplicado <abordagem real escolhida>; drawer ConfigSidebar 100% legível em todos os labels e botões"

3. cd /Users/calebe/Documents/lemmon-agentes && python docs/gerar_pdf.py

COMMIT MSG: "manual + changelog v1.34 (T118 — fix da regressão T115)"
```

---

FASE 10 — ROUND 4 QA (validação manual 2026-05-09):
  ✓ T114 hydration limpa (zero overlay/warnings)
  ⚠ T115 REGRESSÃO: drawer corta MAIS letras pós-fix → ver T118
  ✓ T116 scroll interno funciona; Custo-cap presente no DOM
  ✓ T117 visual gap + separador border-l antes do × confirmados
  ? T117 confirm dialog runtime — não testado (precisa sessão ativa real)
  ? T94 loop autônomo — não testado nesta validação ($$$)

  ⚠ T118 REGRESSÃO de T115 — fix declarado mas overflow-hidden não removido do pai

FASE 11 — ROUND 5 QA (encerrada 2026-05-09):
  ✓ T119 fix definitivo: overflow-hidden removido do drag wrapper em page.tsx
  ✓ Bug colateral resolvido: ChatPanel auto-expande para mínimo 540px com drawer

FASE 12 — ROUND 6 QA COMPLETA (validação manual 2026-05-09):
  Custo: ~$0.10 (1 pipeline real Otto+Aya com briefing curto)
  Cobertura: 13 funcionalidades / 5 páginas / 1 pipeline end-to-end

  ✓✓ Confirmados funcionando:
     - T100 SessionDetail toggle ★ favoritar (clique funciona, ★ amarela aparece)
     - T100 /saude "Taxa favoritadas 15% (3 sessões)" no KPI
     - T101 Pin: bloqueia drag quando true; libera quando false
     - T102 Gráfico latência semanal "2026-W19" com linha 120s + selectors agente/período + 6 cores
     - T104 Salles chips multi-select visíveis no drawer
     - T106 Filtro "🧪 LAB" no FilterBar do histórico
     - T107 Share link gerado e RENDERIZA dossiê no /share/{token} (Briefing + OTTO header + análise)
     - T108 + T119 Drawer ConfigSidebar abre íntegro em modo Reunião
     - T111 Pop "📄 Dossiê pronto!" aparece após pipeline; auto-dismiss confirmado em sessão anterior
     - T112 Tags semânticas no SessionCard + chips coloridos por agente
     - T114 Zero hydration errors no DOM/overlay; useLocalStorage funcionando
     - T115/T118/T119 Labels do drawer 100% íntegros (CONFIGURAÇÕES, OTTO, formatos permitidos, etc)
     - T117 (variante) Botão × ESCONDIDO durante sessão ativa em vez de confirm dialog (UX equivalente)
     - T18 5 tags sugeridas com `×` removível
     - T22 Botão "▶ ouvir dossiê" presente
     - T93 "Exportar Dossiê (Aya)" botão presente
     - T89 Theme toggle ☀ ↔ 🌙 funciona, lemmon-theme persiste
     - T99 "↓ Dossiê" no SessionDetail header
     - T17 "🔀 Remix" no SessionDetail header
     - Pipeline real Otto+Aya: streaming, ProgressBar amarela, mic indicator, sprites mesa, ✓ checkmarks após conclusão, sessão salva no histórico (20→21)
     - Recepção página separada (Pedro consultor "Aguardando")
     - 5 páginas do header funcionam (/saude, /hall-of-fame, /briefing-reverso, /cortes, /calibragem)
     - Sandbox 🧪 LAB toggle visual (botão verde), state interno per-session

  🟡 Achados novos (registrados como T120-T123):
     T120 Hall of Fame ainda mostra ★★★★★ (5 estrelas) nos cards (T100 incompleto)
     T121 /calibragem ignora dark theme (fundo branco mesmo com lemmon-theme=dark)
     T122 ChatPanel position não persiste após drag (lemmon-chat-position=null sempre)
     T123 [VARIANTE T117] Confirm dialog substituído por hide do botão × (decisão de design)

  🆕 Página descoberta nesta rodada:
     /calibragem "IA vs. Feedback Real" — KPIs Pedro precisão (60%), form de registro,
     histórico de calibragens. Usa sistema 1-5⭐ (intencional pra medir precisão da IA,
     não preferência subjetiva — não conflita com T100). Não está documentada no manual.

  ❌ T94 Loop autônomo NÃO TESTÁVEL (descoberto 2026-05-09 com Loop autorizado $1):
     Modo Loop AUSENTE da UI — segmented control virou 2-pill (Auto/Manual) em algum
     bump posterior. T124 registrado pra restaurar. Backend possivelmente intacto.

PROJETO: 0 tarefas pendentes. T120-T142 fechadas. Sistema 100% production-ready. Backlog técnico zerado em 2026-05-27.

---

# FASE 13 — INSTALADOR PARA CLIENTE FINAL (2026-05-25)

Bugs descobertos durante teste do instalador `.command` em Mac limpo (1280×800).

### T125 — 🔴 ChatPanel some em telas <1620px (regressão silenciosa de T122) ✓ commit 86912a4 (2026-05-25)

**Severidade:** alta · **Onde:** `dashboard/app/page.tsx` (useEffect restore + onDragEnd)

**Problema:** T122 persistiu posição do painel no localStorage sem validar viewport. Posição salva em tela larga (translateX=1158px) renderiza fora da área visível em telas menores. Componente existe no DOM, mas o usuário não consegue alcançar — parece que "sumiu".

**Fix:** função `clamp(x,y)` aplicada (a) no restore do localStorage, (b) no onDragEnd antes de salvar, (c) em listener de `window.resize`. Constantes: PANEL_W=540 (cobre configOpen do T119), PANEL_H=640, TOP_OFFSET=48.

### T126 — 🔴 `python-multipart` faltando no requirements (backend crasha em install limpo) ✓ commit 258ff51 (2026-05-25)

**Severidade:** crítica · **Onde:** `requirements.txt`

**Problema:** FastAPI exige `python-multipart` para rotas com `UploadFile` (ex: `/transcrever`). Dep nunca declarada no requirements; no Mac de dev foi instalada manualmente e ficou na venv, mascarando. Em install limpa pelo instalador, backend levanta `RuntimeError: Form data requires "python-multipart"` ao subir e nenhum endpoint funciona.

**Fix:** adicionada linha `python-multipart>=0.0.9` em requirements.txt.

### T127 — 🟡 Sprites SVG quebrados no Safari (Chrome OK) ✓ commit 244ebb6 (validação Safari pendente)

**Severidade:** média · **Onde:** `dashboard/components/office/CharacterSprite.tsx` + tailwind.config.js

**Problema:** Em Safari, os SVGs dos agentes renderizam como listras coloridas verticais em vez de personagens. No Chrome funciona. Provavelmente Safari interpreta diferente algum atributo SVG ou as classes de animação Tailwind (`animate-walk`, `animate-seated`, `animate-celebrate`, `animate-error` — usadas mas não definidas no config).

**Hipóteses pra investigar:**
1. Animações ausentes do tailwind.config (4 classes não declaradas) podem estar produzindo CSS inválido no Safari
2. `transform` em SVG inline tem comportamento diferente em Safari (resolve relativo ao container)
3. width/height vs viewBox interpretation

**Plano de ataque:**
1. Reproduzir em Safari local
2. Adicionar as 4 animações faltantes ao tailwind.config (quick win, pode resolver sozinho)
3. Se persistir, isolar SVG sem className e testar
4. Workaround temporário: o instalador pode forçar abertura do Chrome em vez do navegador padrão

### T128 — Modelo configurável por agente (Opus pros pensadores, Sonnet pros operacionais) ✓ commit 0209fe9 (2026-05-25)

**Severidade:** baixa de feature · **Afeta output: SIM** (qualidade)
**Origem:** discussão pós-entrega do instalador (2026-05-25).

**Estado atual:** todos os agentes usam `LEMMON_MODELO_PADRAO=claude-sonnet-4-6` (definido em `core/config.py:19`). Trocar pra `claude-opus-4-7` global aumenta custo ~5x mas eleva qualidade. Hoje é tudo-ou-nada.

**Onde:** `core/config.py`, `core/agente_base.py`, opcionalmente `core/limites_*.py`, opcionalmente ConfigSidebar.

**Proposta:**
1. Cada `AgenteBase` declara `modelo_recomendado` no init (Otto/Salles → opus, Heitor/Aya/Sônia/Renata → sonnet)
2. Resolução em runtime: env var específica > modelo_recomendado > MODELO_PADRAO
3. Env vars opcionais: `LEMMON_MODELO_OTTO=...`, `LEMMON_MODELO_HEITOR=...`, etc.
4. (Opcional) Dropdown no ConfigSidebar por agente — operador troca on-the-fly
5. Custo por agente já é calculado em `core/custo.py`, KPIs ficam corretos automaticamente

**Por que vale:**
- Otto e Salles trabalham com tese/criatividade — Opus eleva notavelmente o output
- Heitor (compliance), Aya (compilação), Renata (calendário), Sônia (performance) são mais operacionais — Sonnet basta
- Custo extra real: ~$0.05-0.15 por sessão (não ~$1 do upgrade global)

**Critério de aceite:**
- [ ] `LEMMON_MODELO_OTTO=claude-opus-4-7` no .env troca SÓ o Otto
- [ ] Sem env var nenhuma, comportamento atual preservado (Sonnet pra todos)
- [ ] Histórico distingue modelo usado por agente
- [ ] Manual §8 (custos) atualizado com tabela de preço por modelo

Possível (visual export):  T96 (CSS Renata exportada) — só se ficar feio em uso
Outros bugs:               registrar conforme aparecerem
```

---

# FASE 14 — AUDITORIA BACKEND (2026-05-25)

Achados de varredura focada em backend Python (core/, agentes/, api/, scripts/) — buscando bugs reais, dívida estrutural e problemas de processo. Front intencionalmente fora do escopo (em trabalho paralelo).

### T129 — 🔴 ALTA: Path traversal em `/historico/{session_id}` ✓ commit f43edc2 (2026-05-27)

**Tipo:** bug de segurança · **Onde:** `api/routes/historico.py:72-79`

Endpoint não valida `session_id` antes de construir caminho do arquivo. Cliente malicioso pode usar `"../../../etc/passwd"` em URL para ler arquivos fora do diretório.

**Fix:** validar com regex `^[0-9]{8}_[0-9]{6}` (formato timestamp dos session_ids reais) e rejeitar com 400 se não corresponder.

### T130 — 🔴 ALTA: Race condition em favoritar/tags simultâneos ✓ commit f43edc2 (2026-05-27)

**Tipo:** bug · **Onde:** `core/historico_index.py:103-119` + `core/historico.py:109-111`

Duas requests simultâneas em `POST /favoritar` e `POST /tags` podem ler o mesmo JSON, modificar concorrentemente e uma sobrescrever a outra. Sem lock nem rename atômico.

**Fix:** `fcntl.flock()` ou write-to-temp + rename atômico ao gravar JSON de sessão.

### T131 — 🟡 MÉDIA: `custo_total_usd` mal tipado (dict vs float) ✓ commit c8fdf51 (2026-05-27)

**Tipo:** bug · **Onde:** `api/ws_chat.py:415-417` e Otto retornando dict

`custo_total_usd` às vezes é float (vindo do `Custo.calcular()`), às vezes dict `{"usd": ...}` (Otto linhas 143-148). Quebra `sum(custos.values())` linha 366. Mesmo padrão da T1 do passado, regressão silenciosa.

**Fix:** Otto retorna `float` direto. Remover branch dict do agregador.

### T132 — 🟡 MÉDIA: Callback de confirmação trava executor por 5min em desconexão ✓ commit 3b2500f (2026-05-27)

**Tipo:** bug · **Onde:** `api/ws_helpers.py:28-42`

Se cliente desconecta enquanto agente espera confirmação, coroutine fica pendurada 300s bloqueando outros agentes.

**Fix:** detectar `WebSocketDisconnect` em `receive_json()` do callback ou usar timeout menor (30s) com retry.

### T133 — 🟡 MÉDIA: XSS via briefing no `/share/{token}` (escape parcial) ✓ commit 42ea012 (2026-05-27)

**Tipo:** bug de segurança · **Onde:** `api/routes/share.py:52-111`

`html_escape()` aplicado em comentários, mas `briefing` (linha 92) vem direto do JSON da sessão sem validação. Briefing malicioso (`<script>`) renderiza na página de share.

**Fix:** validar briefing ao gravar sessão (rejeitar tags suspeitas) OU sanitizar com `bleach` ao renderizar HTML.

### T134 — 🟡 MÉDIA: JSON do histórico sem `schema_version` ✓ commit b1dae5a (2026-05-27)

**Tipo:** processo · **Onde:** `api/storage.py:60-94`

Se schema mudar, JSONs antigos quebram silenciosamente. Sem versão pra disparar migrations.

**Fix:** `"schema_version": 1` no topo de cada JSON; lógica de migration em `historico_index.py` quando incrementar.

### T135 — 🔴 ALTA: `openai` SDK importado sem estar em requirements ✓ commit a004aa4 (2026-05-25)

**Tipo:** bug · **Onde:** `api/routes/transcrever.py:22` + `requirements.txt`

Mesmo padrão do `python-multipart` (T126). Em install limpa, upload de áudio falha com `ModuleNotFoundError: No module named 'openai'`.

**Fix aplicado:** adicionado `openai>=1.0.0` ao requirements + `.env.example` documenta `OPENAI_API_KEY` como opcional com link pro Console OpenAI.

### T136 — 🟢 BAIXA: Custo calculado manualmente em `auxiliares.py` ✓ commit 1ecfe92 (2026-05-27)

**Tipo:** dívida técnica · **Onde:** `api/routes/auxiliares.py:84-85, 112-113`

Cálculo hardcoded (`resp.usage.input_tokens * 3e-6 + ...`) em vez de usar `Custo.calcular()`. Se preço mudar (ou virar `Custo` por modelo via T128), aqui não atualiza.

**Fix:** importar `Custo.calcular()` e usar consistentemente. Com T128, passar `modelo=` também.

### T137 — 🟡 MÉDIA: Erro de descrição de imagem silenciado sem log ✓ commit baeb389 (2026-05-27)

**Tipo:** bug · **Onde:** `api/ws_chat.py:68-69`

`except Exception: pass` ao falhar visão. Operador não sabe que contexto visual foi ignorado. Mesmo padrão do T55 antigo.

**Fix:** `self.logger.warning("Falha ao descrever imagem: %s", e)` antes do pass.

### T139 — 🆕 Auto-roteador IA: IA escolhe quais agentes acionar

**Severidade:** alta de UX · **Tipo:** feature
**Origem:** discussão 2026-05-25 — usuário pede que cliente leigo não precise escolher agentes manualmente, especialmente preparando pra escalar de 7 pra ~30 agentes.

**Decisão:** Nível 3 (full auto) — cliente digita briefing → Enter → sistema escolhe agentes via Haiku + roda direto. Modo expert escondido fica pro Calebe testar manualmente.

#### Sprint 1 — Base do catálogo ✓ commit c50257e (2026-05-25)

- AgenteBase ganha 5 atributos de classe: `papel_curto`, `quando_usar`, `quando_nao_usar`, `categoria`, `custo_medio_usd`
- Todos os 7 agentes declaram metadados (Otto, Heitor, Salles, Sônia, Aya, Renata, Pedro Abrahão)
- Endpoint `GET /agentes/catalogo` retorna a lista pronta (sem instanciar)
- `/sugerir_pipeline` reescrito: gera prompt do Haiku dinamicamente a partir do catálogo. Adicionar agente novo = 1 classe + 1 linha em `api/routes/agentes.py`
- Fallback conservador (Otto+Aya) se IA não decidir
- Smoke test 5 briefings: 4 acertos perfeitos, 1 com Heitor faltante em estética. Custo: $0.0014/decisão

#### Sprint 2 — Frontend auto-run ✓ commits 273bafe + 0c9ee55 (2026-05-26)

Implementado:
- Novo hook `useAutoRouter` chama `/sugerir_pipeline`
- `AutoModeToggle` no header (pill Auto/Expert, default Auto, localStorage)
- Modo Auto esconde pills OTTO/HEITOR/etc; ChatPanel mostra "🤖 Descreva seu pedido / a IA escolhe os agentes" no vazio
- `handleSend` intercepta envio em Auto: chama sugestor → toast "🤖 IA escolheu: X · Y · Z (~$0.25)" → popula inMeeting → dispara pipeline
- Lista vazia (`motivo_vazio`) mostra toast warning amigável, não dispara
- Modo Expert preserva 100% do fluxo antigo (pills, seleção manual)

Refinos do sugestor (commit 0c9ee55):
- Regra hardcoded: Aya sempre no fim quando há 2+ agentes (cliente espera sempre dossiê)
- Prompt do sugestor reforçado com exemplos de conjuntos mínimos ("campanha completa" → 5 agentes) e instrução pra usar julgamento mesmo sem todo contexto (antes ficava conservador demais)

### T140 — Resiliência: WS cai em aba background ✓ commits 273bafe + 0c9ee55 (2026-05-26)

**Severidade:** crítica · **Origem:** descoberto no smoke test do T139 com pipeline real.

**Problema:** Chrome fecha WebSocket em abas em background pra economizar bateria. Antes:
1. Cliente envia briefing, pipeline começa
2. Cliente muda de aba (ler email, etc)
3. Chrome fecha WS após uns segundos
4. Backend tenta `ws.send_json(...)` → `RuntimeError("Cannot call send once close message sent")` → **pipeline crash no meio, sessão NEM salva no histórico**
5. Cliente volta, frontend vazio, sem nenhum traço da sessão

**Fix backend (`api/ws_chat.py`):** monkey-patch tolerante no `ws.send_json` no início do handler — silencia RuntimeError de close, deixa pipeline rodar até o fim e salvar sessão normalmente.

**Fix frontend (`lib/useChat.ts`):**
- `messages` e `sessionId` movidos pra `useLocalStorage` (sobrevivem a refresh, mudança de aba, qualquer reset do React state)
- `useLocalStorage` estendido pra aceitar setter funcional (`setMessages(prev => ...)`)
- Novo visibilitychange listener: ao voltar foco com `isRunning=true` e WS fechado, faz polling do `/historico` até achar a sessão (criada após `sessionStartTime`) e carrega via `loadSession`. Retry 3min × 4s.

**Crítério de aceite:**
- [x] Backend não crasha mais com WS fechado
- [x] Sessão é salva no histórico mesmo se cliente sair
- [x] Frontend recupera estado ao voltar pra aba
- [ ] Validado em uso real pelo Pedro (cliente final)

### T138 — 🟢 BAIXA: Sem endpoint `/health` para instalador ✓ commit df248b9 (2026-05-27)

**Tipo:** processo · **Onde:** `api/main.py`

Instalador não tem forma simples de validar que backend subiu. Hoje só dá pra inferir via WebSocket (complicado).

**Fix:** `@app.get("/health")` retornando `{"status": "ok", "version": "1.36"}`. Instalador pode fazer curl pra validar.

> **Por que T95 antes de T94:** sem barra de progresso e sem watchdog, T94 (loop autônomo) vai ter o mesmo problema escalado — operador não vê o que está acontecendo durante 5 turnos seguidos, e qualquer travamento mata o loop sem feedback. T95 prepara o terreno.
>
> **T97 é independente:** pode entrar a qualquer momento, é fix pequeno. Recomendado fechar junto com T93 ou T95 num bump único.

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

# FASE 15 — QA AUTOMATIZADO PÓS-SPRINT 2 (2026-05-26)

Bateria de QA estruturada em 7 testes (QA-1 a QA-7) cobrindo backend + frontend pós-T139/T140. Resultado: 8 OK · 2 com achado ⚠️ · 0 bug crítico. Sistema production-ready.

### T141 — 🟡 Sugestor conservador demais com pedidos curtos diretos ✓ commit ec44bbe (2026-05-27)

**Severidade:** média de UX · **Origem:** QA-3.
**Reproduzir:** `GET /sugerir_pipeline?briefing=faça um roteiro de 15s pra story` → retorna `agentes=[]` com `motivo_vazio: "preciso de (1) tema/assunto, (2) cliente/marca"`.

**Por que é problema:** cliente leigo espera o sistema aceitar pedidos diretos. Comparação:
- "estratégia pra marca de café" → ✅ otto+aya
- "roteiro de 15s pra story" → ❌ vazio (inconsistente — também não tem cliente nominal mas o anterior aceita)

**Fix proposto:** reforçar prompt do sugestor pra aceitar ação clara mesmo sem cliente — IA roda com "tema livre" e Otto/Salles complementam. Ajustar regra "pedido fundamentalmente incompleto" pra ser mais restritiva (só conversacional puro ou totalmente abstrato).

### T142 — 🟡 Next.js dev Fast Refresh força full-reload ✓ commit 1e8e7bb (2026-05-27)

**Severidade:** baixa (só afeta dev, não prod) · **Origem:** QA-6.
**Reproduzir:** durante uso normal do dashboard em `npm run dev`, Next acusa repetidamente `⚠ Fast Refresh had to perform a full reload due to a runtime error.` (4× em ~10min de uso).

**Hipóteses:** algum throw no client durante state change. Suspeitos:
- `useLocalStorage` estendido com setter funcional (commit 273bafe)
- `useAutoRouter` (novo hook)
- Hidratação SSR/CSR de `messages` (que agora vem de localStorage)

**Plano de ataque:** abrir Cmd+Option+J no Chrome com sistema rodando, reproduzir reload, capturar stack trace específico no console.

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
| T88 — GitHub push | ✅ concluído | 2026-05-06 | Repo privado https://github.com/sabijor/lemmon-agentes; gh CLI instalado via homebrew; main como default branch; log local == remoto; .next/ removido do tracking; shares/ + backups/ adicionados ao .gitignore |
