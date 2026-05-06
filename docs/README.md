# /docs — Documentação viva do Lemmon Agentes

## O que está aqui

| Arquivo | Função |
|---------|--------|
| `MANUAL_SISTEMA.md` | Manual editável (fonte de verdade) — sempre editar aqui primeiro |
| `CHANGELOG.md` | Log cronológico de mudanças no manual |
| `gerar_pdf.py` | Script que lê o markdown e gera PDF estilizado em `releases/` |
| `releases/` | PDFs versionados (v1.0, v1.1, ...) — preserva histórico |

## Como atualizar

1. **Editar:** abrir `MANUAL_SISTEMA.md` e fazer as mudanças
2. **Versionar:** atualizar o cabeçalho `**Versão atual:** vX.Y` e adicionar uma nova seção no topo de `## Histórico de versões` listando o que mudou
3. **Registrar:** adicionar entrada equivalente em `CHANGELOG.md` (também no topo)
4. **Gerar PDF:**
   ```bash
   cd /Users/calebe/Documents/lemmon-agentes
   python docs/gerar_pdf.py
   ```
   Saída: `docs/releases/MANUAL_v<versao>_<YYYY-MM-DD>.pdf`

PDFs antigos **nunca** são apagados — cada um é um snapshot do estado do sistema naquela data.

## Filosofia

O manual cresce com o sistema. Cada épico fechado do `PLANO_ACAO_2026-05-05.md` deve atualizar este manual antes de virar PR mergeado. Sem isso, em 6 meses ninguém lembra como usar metade das funções.

## Dependências do script

```bash
pip install reportlab
```

Já vem na maioria dos `.venv` Python. Se não tiver, o script avisa.
