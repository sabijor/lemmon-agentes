#!/bin/bash
# v1.46.2 A6a-002 — alinha entry point com Makefile/README (era 'api_server:app'
# que não existe; correto é 'api.main:app'). Sem isso, Pedro não subia backend.
# Para os dois servidores quando fechar o terminal (Ctrl+C)
trap 'kill 0' EXIT

echo "▶ Iniciando backend (agentes Lemmon)..."
source .venv/bin/activate
# v1.49 — exporta .env explicitamente. core/config.py chama load_dotenv() mas
# /health/full faz os.getenv("ANTHROPIC_API_KEY") direto no startup; sem o
# `set -a; source .env; set +a` o health probe reporta key ausente mesmo com
# .env válido. Esse padrão também serve pra rodar uvicorn fora do start.sh.
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
.venv/bin/uvicorn api.main:app --reload --port 8000 --log-level info &

# Espera backend ficar pronto antes de abrir browser
echo "▶ Aguardando backend..."
for i in {1..30}; do
  if curl -sS --max-time 1 http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "  ✓ backend pronto"
    break
  fi
  sleep 1
done

echo "▶ Iniciando dashboard..."
(sleep 4 && open http://localhost:4000) &
cd dashboard && npm run dev
