# Sistema Multi-Agente Lemmon

Sistema de agentes de IA para pré-produção audiovisual da Lemmon Produções.

## Agentes (v1.46.2 — 13 agentes)

| # | Agente | Função |
|---|--------|--------|
| 1 | **Concierge** | Orquestrador conversacional (escolhe equipe + ferramentas) |
| 2 | **Otto** | Estrategista — decodifica briefing em tese criativa |
| 3 | **Heitor** | Compliance Meta/CFM — verifica riscos antes do roteiro |
| 4 | **Salles** | Roteirista documental (entrevistas, captação) |
| 5 | **Carlos** | Roteirista publicitário (ad pago, hooks) |
| 6 | **Sônia** | Performance — cortes pra redes sociais |
| 7 | **Pedro Abrahão** | Espelho médico (Hator Clinic — saúde feminina) |
| 8 | **Aya** | Compiladora — dossiê final em PDF |
| 9 | **Renata** | Calendário editorial + distribuição |
| 10-13 | **Ana Maria, Prichina, Caíto, Kelly** | Admin Hator (CFO, RH, COO, Tributário) |

## Setup inicial (macOS)

```bash
# 1. Cria ambiente virtual
python3 -m venv .venv
source .venv/bin/activate

# 2. Instala dependências Python
pip install -r requirements.txt

# 3. Instala deps frontend (Next.js)
cd dashboard && npm install && cd ..

# 4. Configura .env
cp .env.example .env
# Edite .env: cole ANTHROPIC_API_KEY. Opcional: LEMMON_ENCRYPT_KEY (Fernet)
# e LEMMON_TENANT_ID (default "default", use "hator" pra Hator Clinic)
```

## Subir o sistema (recomendado — dashboard web)

```bash
# Opção 1 — script único (sobe backend + frontend + abre browser):
./start.sh

# Opção 2 — manualmente em 2 terminais
# Terminal 1 (backend FastAPI + WebSocket):
.venv/bin/uvicorn api.main:app --reload --port 8000

# Terminal 2 (dashboard React/Next):
cd dashboard && npm run dev

# Acesso:
# - Dashboard:        http://localhost:4000
# - Welcome Hator:    http://localhost:4000/?cliente=hator
# - Health-check:     http://localhost:8000/health
# - Health Anthropic: http://localhost:8000/health/anthropic
```

> ⚠️ **Nota v1.46.2 (A6a-002):** versões anteriores apontavam pra `api_server:app`
> em `start.sh` — esse módulo NÃO existe. O entry point correto é `api.main:app`
> (FastAPI). Já corrigido; sempre use `./start.sh` ou `make dev` em vez de
> rodar `uvicorn` manualmente sem o módulo certo.

## Uso via CLI (legado — não-dashboard)

### Pipeline completo (recomendado)

```bash
# Fluxo completo: Otto → Heitor → Salles → Sônia
python pipeline_completo.py inputs/meu_briefing.txt

# Sem compliance (mais rápido e barato)
python pipeline_completo.py inputs/meu_briefing.txt --sem-heitor --sem-sonia

# Com formato específico
python pipeline_completo.py inputs/meu_briefing.txt --formato reels_vertical

# Heitor em modo profundo (mais buscas web)
python pipeline_completo.py inputs/meu_briefing.txt --profundo

# Sônia com busca de tendências
python pipeline_completo.py inputs/meu_briefing.txt --busca-sonia

# Pula confirmações interativas
python pipeline_completo.py inputs/meu_briefing.txt --no-confirm
```

Os outputs ficam em `outputs/pipeline/YYYYMMDD_HHMMSS_<nome>_*`.

### Agentes isolados

```bash
# Otto
python otto_cli.py inputs/briefing.txt
python otto_cli.py inputs/briefing.txt --modo completo --contexto "cliente premium"

# Heitor
python heitor_cli.py inputs/copy.txt
python heitor_cli.py inputs/copy.txt --profundo --nicho emagrecimento
python heitor_cli.py inputs/copy.txt --modo solo --saida analise

# Salles
python salles_cli.py inputs/briefing.txt --formato documental_institucional
python salles_cli.py inputs/briefing.txt --formato auto --tags "marca,arquitetura"
python salles_cli.py inputs/briefing.txt --isolado --formato reels_vertical

# Sônia
python sonia_cli.py inputs/roteiro.txt
python sonia_cli.py inputs/roteiro.txt --modo cortes_apenas
python sonia_cli.py inputs/roteiro.txt --com-busca --profundo
```

### Avaliação

```bash
python avaliar.py   # avalia execuções pendentes de todos os agentes
```

## Formato do briefing

O briefing pode ser escrito em linguagem natural, sem estrutura rígida. Veja o exemplo em `inputs/briefing_salles_exemplo.txt`.

## Custos

Modelo padrão: Claude Sonnet 4.6 ($3 in / $15 out por 1M tokens).

| Etapa | Custo estimado |
|-------|---------------|
| Otto | ~$0.05 por execução |
| Heitor | ~$0.20–$0.40 (padrão) / ~$0.40–$0.70 (profundo) |
| Salles | ~$0.10–$0.20 |
| Sônia | ~$0.15–$0.25 (sem busca) / ~$0.30–$0.50 (com busca) |
| **Pipeline completo** | **~$0.50–$1.40** |

O sistema avisa automaticamente quando o custo total do pipeline ultrapassa $1.00.

## Roadmap de memória

- [x] **Camada 2 — Histórico bruto**: cada execução salva em `historico/{agente}/`
- [ ] **Camada 3 — RAG consultivo**: ativar quando houver 15+ projetos rodados
- [ ] **Camada 4 — Aprendizado**: avaliar após Camada 3 maduro

## Versionamento de prompts

Ver `prompts/README.md`.
