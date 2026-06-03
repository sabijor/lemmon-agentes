#!/bin/bash
# v1.48 A6a-003 — Backup automático das pastas sensíveis do Lemmon.
#
# Roda diariamente via cron. Cria snapshot tar.gz cifrado (se LEMMON_ENCRYPT_KEY)
# em ~/Documents/lemmon-backups/ com rotação:
#   - 7 últimos dias (daily)
#   - 4 últimas semanas (weekly)
#   - 3 últimos meses (monthly)
#
# Instala como cron (rodar manualmente uma vez):
#   crontab -l 2>/dev/null | { cat; echo "0 3 * * * /Users/calebe/Documents/lemmon-agentes/bin/backup.sh > /tmp/lemmon-backup.log 2>&1"; } | crontab -
#
# Pra restaurar:
#   bin/backup.sh restore 2026-06-15  (ou nome do arquivo específico)

set -euo pipefail

PROJETO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$HOME/Documents/lemmon-backups"
DATA=$(date +%Y-%m-%d)
HORA=$(date +%H%M%S)

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

# ─── Função: criar backup ───────────────────────────────────────────────────────

criar_backup() {
    local destino="$1"
    local nome="$2"

    echo "▶ Criando backup em $destino/$nome"

    # Tar das pastas sensíveis (histórico, inputs, prompts treinados, configs)
    local tmpfile
    tmpfile=$(mktemp)

    tar czf "$tmpfile" \
        -C "$PROJETO_DIR" \
        historico \
        prompts \
        inputs \
        .env \
        calibragem_pedro.json 2>/dev/null || true

    # Cifra se chave Fernet existe (proteção do backup em caso de roubo do HD)
    if [ -n "${LEMMON_ENCRYPT_KEY:-}" ]; then
        echo "  🔒 Cifrando backup com Fernet"
        "$PROJETO_DIR/.venv/bin/python" -c "
import sys, os
sys.path.insert(0, '$PROJETO_DIR')
from cryptography.fernet import Fernet
key = os.environ['LEMMON_ENCRYPT_KEY'].encode()
with open('$tmpfile', 'rb') as f:
    data = f.read()
encrypted = Fernet(key).encrypt(data)
with open('$destino/$nome.enc', 'wb') as f:
    f.write(encrypted)
"
        rm -f "$tmpfile"
        echo "  ✓ $destino/$nome.enc ($(du -h "$destino/$nome.enc" | cut -f1))"
    else
        mv "$tmpfile" "$destino/$nome"
        echo "  ⚠️  LEMMON_ENCRYPT_KEY ausente — backup em texto claro"
        echo "  ✓ $destino/$nome ($(du -h "$destino/$nome" | cut -f1))"
    fi
}

# ─── Função: rotação ──────────────────────────────────────────────────────────

rotacionar() {
    # Daily: mantém últimos 7
    local total_daily
    total_daily=$(find "$BACKUP_DIR/daily" -name "*.tar.gz*" | wc -l | tr -d ' ')
    if [ "$total_daily" -gt 7 ]; then
        echo "▶ Rotação daily: $total_daily arquivos → removendo mais antigos"
        find "$BACKUP_DIR/daily" -name "*.tar.gz*" | sort | head -n -7 | xargs rm -f
    fi

    # Weekly: roda no domingo (dia da semana 0)
    if [ "$(date +%u)" -eq 7 ]; then
        cp "$BACKUP_DIR/daily"/*.tar.gz* "$BACKUP_DIR/weekly/" 2>/dev/null || true
        local total_weekly
        total_weekly=$(find "$BACKUP_DIR/weekly" -name "*.tar.gz*" | wc -l | tr -d ' ')
        if [ "$total_weekly" -gt 4 ]; then
            find "$BACKUP_DIR/weekly" -name "*.tar.gz*" | sort | head -n -4 | xargs rm -f
        fi
    fi

    # Monthly: roda no dia 1 do mês
    if [ "$(date +%d)" = "01" ]; then
        cp "$BACKUP_DIR/daily"/*.tar.gz* "$BACKUP_DIR/monthly/" 2>/dev/null || true
        local total_monthly
        total_monthly=$(find "$BACKUP_DIR/monthly" -name "*.tar.gz*" | wc -l | tr -d ' ')
        if [ "$total_monthly" -gt 3 ]; then
            find "$BACKUP_DIR/monthly" -name "*.tar.gz*" | sort | head -n -3 | xargs rm -f
        fi
    fi
}

# ─── Função: restore ──────────────────────────────────────────────────────────

restaurar() {
    local query="${1:-}"
    if [ -z "$query" ]; then
        echo "Uso: $0 restore <YYYY-MM-DD ou nome-do-arquivo>"
        echo
        echo "Backups disponíveis:"
        find "$BACKUP_DIR" -name "*.tar.gz*" | sort
        exit 1
    fi

    local arquivo
    arquivo=$(find "$BACKUP_DIR" -name "*${query}*" | head -1)
    if [ -z "$arquivo" ]; then
        echo "✗ Backup não encontrado para query: $query"
        exit 1
    fi

    echo "▶ Restaurando de $arquivo"
    echo "⚠️  ATENÇÃO: vai sobrescrever historico/ + prompts/ + .env atuais."
    read -p "Confirma? (sim/não): " confirma
    if [ "$confirma" != "sim" ]; then
        echo "Cancelado."
        exit 0
    fi

    local tmpfile
    tmpfile=$(mktemp)
    if [[ "$arquivo" == *.enc ]]; then
        if [ -z "${LEMMON_ENCRYPT_KEY:-}" ]; then
            echo "✗ Backup cifrado mas LEMMON_ENCRYPT_KEY não setada. Cancelando."
            exit 1
        fi
        echo "  🔓 Decifrando…"
        "$PROJETO_DIR/.venv/bin/python" -c "
import sys, os
from cryptography.fernet import Fernet
key = os.environ['LEMMON_ENCRYPT_KEY'].encode()
with open('$arquivo', 'rb') as f:
    data = f.read()
decrypted = Fernet(key).decrypt(data)
with open('$tmpfile', 'wb') as f:
    f.write(decrypted)
"
    else
        cp "$arquivo" "$tmpfile"
    fi

    tar xzf "$tmpfile" -C "$PROJETO_DIR"
    rm -f "$tmpfile"
    echo "✓ Restauração completa em $PROJETO_DIR"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

if [ "${1:-}" = "restore" ]; then
    restaurar "${2:-}"
    exit 0
fi

# Backup diário
NOME="lemmon-${DATA}-${HORA}.tar.gz"
criar_backup "$BACKUP_DIR/daily" "$NOME"
rotacionar

echo "✓ Backup completo. Total no histórico:"
echo "  Daily:   $(find "$BACKUP_DIR/daily" -name "*.tar.gz*" | wc -l | tr -d ' ') arquivos"
echo "  Weekly:  $(find "$BACKUP_DIR/weekly" -name "*.tar.gz*" | wc -l | tr -d ' ') arquivos"
echo "  Monthly: $(find "$BACKUP_DIR/monthly" -name "*.tar.gz*" | wc -l | tr -d ' ') arquivos"
