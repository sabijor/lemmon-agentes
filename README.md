# Sistema Multi-Agente Lemmon

Sistema de agentes de IA para pré-produção audiovisual da Lemmon Produções.

## Agentes

| # | Agente | Função |
|---|--------|--------|
| 1 | **Otto** | Estrategista — decodifica o briefing e gera análise + tese criativa |
| 2 | **Heitor** | Compliance Meta — verifica riscos e restrições antes do roteiro |
| 3 | **Salles** | Roteirista — transforma a tese em roteiro filmável |
| 4 | **Sônia** | Performance — analisa o roteiro e sugere cortes para redes sociais |

Pipeline padrão: **Otto → Heitor → Salles → Sônia**

## Setup inicial (macOS)

```bash
# 1. Cria ambiente virtual
python3 -m venv .venv
source .venv/bin/activate

# 2. Instala dependências
pip install -r requirements.txt

# 3. Configura API key
cp .env.example .env
# Edite .env e cole sua chave da Anthropic
```

## Uso

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
