# Versionamento de prompts

Todo prompt de sistema é versionado. Quando ajustar, NÃO sobrescreva — crie nova versão.

Convenção: `{nome_agente}_system_v{N}.md`

Quando criar v2 do Otto, atualize `Otto.versao_prompt = "v2"` em `agentes/otto.py`.

O histórico de cada execução registra qual versão de prompt foi usada — assim você consegue auditar regressões.
