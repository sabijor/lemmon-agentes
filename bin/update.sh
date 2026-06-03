#!/bin/bash
# v1.48 A6a-007 — Update workflow seguro.
# Vê UPDATE.md pro detalhe completo.

set -euo pipefail

PROJETO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJETO_DIR"

echo "▶ Update do Lemmon Agentes — $(date)"
echo

# ─── 1. Backup pré-update ──────────────────────────────────────────────────────

if [ -f .env ]; then
    LEMMON_ENCRYPT_KEY="${LEMMON_ENCRYPT_KEY:-$(grep '^LEMMON_ENCRYPT_KEY=' .env 2>/dev/null | cut -d= -f2- || echo '')}"
    export LEMMON_ENCRYPT_KEY
fi

echo "▶ Criando backup pré-update…"
bin/backup.sh
echo

# ─── 2. Mostrar mudanças ───────────────────────────────────────────────────────

echo "▶ Verificando mudanças remotas…"
git fetch origin

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMITS_BEHIND=$(git rev-list --count HEAD..origin/"$CURRENT_BRANCH" 2>/dev/null || echo "0")

if [ "$COMMITS_BEHIND" -eq 0 ]; then
    echo "✓ Já está na última versão. Nada a atualizar."
    exit 0
fi

echo
echo "Mudanças pendentes ($COMMITS_BEHIND commits):"
echo "─────────────────────────────────────────────"
git log --oneline HEAD..origin/"$CURRENT_BRANCH" | head -20
echo

# Avisos especiais
if git log HEAD..origin/"$CURRENT_BRANCH" --oneline | grep -iE "breaking|migration|migrate" > /dev/null; then
    echo "⚠️  ATENÇÃO: alguns commits mencionam BREAKING/MIGRATION."
    echo "   Leia UPDATE.md antes de continuar."
    echo
fi

read -p "Aplicar atualização? (sim/não): " confirma
if [ "$confirma" != "sim" ]; then
    echo "Cancelado."
    exit 0
fi

# ─── 3. Parar serviços ─────────────────────────────────────────────────────────

echo
echo "▶ Parando backend + frontend (se rodando)…"
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
sleep 1

# ─── 4. Pull + deps ────────────────────────────────────────────────────────────

echo "▶ git pull…"
git pull origin "$CURRENT_BRANCH"

# Deps Python (só se mudaram)
if ! git diff HEAD@{1} HEAD --quiet -- requirements.txt 2>/dev/null; then
    echo "▶ requirements.txt mudou — atualizando deps Python…"
    .venv/bin/pip install -r requirements.txt
fi

# Deps frontend (só se mudaram)
if ! git diff HEAD@{1} HEAD --quiet -- dashboard/package.json 2>/dev/null; then
    echo "▶ dashboard/package.json mudou — atualizando deps frontend…"
    (cd dashboard && npm install)
fi

# ─── 5. Migrations ─────────────────────────────────────────────────────────────

# Procura scripts de migration novos
MIGRATIONS=$(find bin -name "migrate-*.py" -newer .git/HEAD 2>/dev/null || true)
if [ -n "$MIGRATIONS" ]; then
    echo
    echo "▶ Scripts de migration encontrados:"
    echo "$MIGRATIONS"
    for migr in $MIGRATIONS; do
        echo "  Rodando $migr…"
        .venv/bin/python "$migr"
    done
fi

# ─── 6. Smoke tests ────────────────────────────────────────────────────────────

echo
echo "▶ Smoke tests…"
if .venv/bin/python -m pytest tests/ --ignore=tests/test_agentes_smoke.py -q 2>&1 | tail -3; then
    echo "✓ Testes passaram"
else
    echo "✗ TESTES FALHARAM — NÃO REINICIAR SISTEMA"
    echo "   Investigue. Pra rollback, rode: bin/backup.sh restore <YYYY-MM-DD>"
    exit 1
fi

# ─── 7. Avisos finais ──────────────────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════════"
echo " ✓ Update concluído"
echo "═══════════════════════════════════════════════════════"
echo
echo "Próximos passos manuais:"
echo "  1. ./start.sh                        # sobe backend + frontend"
echo "  2. abra http://localhost:4000"
echo "  3. testa 1 briefing simples"
echo
echo "Se algo der errado:"
echo "  bin/backup.sh restore $(date +%Y-%m-%d)  # volta backup de hoje"
echo
