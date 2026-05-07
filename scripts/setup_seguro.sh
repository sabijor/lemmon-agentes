#!/usr/bin/env bash
# Garante permissões corretas em arquivos sensíveis.
# Executar uma vez após clonar o repositório ou após qualquer reset de permissões.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# .env — apenas o dono pode ler/escrever
if [ -f "$ROOT/.env" ]; then
    chmod 600 "$ROOT/.env"
    echo "✓ .env → 600"
else
    echo "⚠  .env não encontrado em $ROOT — crie o arquivo antes de continuar"
fi

# backups/ — apenas o dono (criado pelo backup_historico.py)
if [ -d "$ROOT/backups" ]; then
    chmod 700 "$ROOT/backups"
    echo "✓ backups/ → 700"
fi

echo "Setup de segurança concluído."
