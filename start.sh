#!/bin/bash
# Para os dois servidores quando fechar o terminal (Ctrl+C)
trap 'kill 0' EXIT

echo "▶ Iniciando backend (agentes)..."
source .venv/bin/activate
uvicorn api_server:app --port 8000 &

echo "▶ Iniciando dashboard..."
(sleep 4 && open http://localhost:4000) &
cd dashboard && npm run dev
