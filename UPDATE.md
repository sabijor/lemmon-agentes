# Atualizando o Lemmon Agentes

> v1.48 A6a-007 — workflow oficial pra subir nova versão SEM perder dados do cliente.

Esse documento existe pq antes não tinha: cada `git pull` era uma surpresa. Agora tem ordem.

## TL;DR — atualização rotineira (semanal)

```bash
cd ~/Documents/lemmon-agentes
bin/update.sh
```

O script vai:
1. Criar backup pré-update (Fernet cifrado se chave setada)
2. Mostrar diff de mudanças desde o último update
3. Pedir confirmação
4. `git pull` + `pip install -r requirements.txt` + `cd dashboard && npm install`
5. Rodar migrations se houver (`bin/migrate.sh` — auto-detect)
6. Rodar smoke tests sem chamar Anthropic
7. Avisar pra reiniciar backend/frontend

Se algo quebrar, restaurar é 1 comando:
```bash
bin/backup.sh restore <YYYY-MM-DD>
```

---

## Quando atualizar

| Frequência | Quando | Risco |
|---|---|---|
| **Semanal** | Sextas após teste do Pedro | Baixo — só fixes |
| **Quinzenal** | Após confirmar próxima sprint | Médio — features novas |
| **Imediato** | Patch de segurança (avisado por mim) | Alto se atrasar |

NUNCA atualize:
- No meio de sessão ativa do Pedro
- Sem `bin/backup.sh` rodado nos últimos 2 dias
- Sem ler o CHANGELOG (vai junto com cada release)

---

## Procedimento manual (se `bin/update.sh` falhar)

### 1. Backup pré-update

```bash
LEMMON_ENCRYPT_KEY="$(grep LEMMON_ENCRYPT_KEY .env | cut -d= -f2)" bin/backup.sh
```

Guarda em `~/Documents/lemmon-backups/daily/lemmon-YYYY-MM-DD-HHMMSS.tar.gz.enc`.

### 2. Verificar mudanças

```bash
git fetch origin
git log HEAD..origin/main --oneline  # ou qa/v1.46-hator-fixes
```

Lê os commits. Se aparecer "BREAKING" ou "migration:", LEIA O QUE DIZ antes de continuar.

### 3. Aplicar atualização

```bash
# Para backend + frontend antes
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null

# Atualiza código
git pull

# Deps Python (só se requirements.txt mudou)
git diff HEAD@{1} requirements.txt && \
    .venv/bin/pip install -r requirements.txt

# Deps frontend (só se package.json mudou)
git diff HEAD@{1} dashboard/package.json && \
    (cd dashboard && npm install)
```

### 4. Migrations (se houver)

Versão atual: **schema_version = 1** (em `api/storage.py:12`).

Se nova versão tiver `schema_version = 2`, vai existir `bin/migrate-v1-to-v2.py`:

```bash
# Dry-run primeiro pra ver o que mudaria
.venv/bin/python bin/migrate-v1-to-v2.py --dry-run

# Aplicar
.venv/bin/python bin/migrate-v1-to-v2.py
```

Se não houver script, schema não mudou.

### 5. Smoke tests

```bash
.venv/bin/python -m pytest tests/ --ignore=tests/test_agentes_smoke.py -q
```

Esperado: 59+ passando, 0 falhando. Se algum quebrar, NÃO suba o backend ainda.

### 6. Restart

```bash
./start.sh
# OU manualmente:
# .venv/bin/uvicorn api.main:app --reload --port 8000
# cd dashboard && npm run dev
```

Aguarda `curl localhost:8000/health` retornar 200. Depois abre dashboard.

### 7. Verificação visual

- [ ] Abre `localhost:4000/?cliente=hator`
- [ ] Vê welcome modal Hator OU tela limpa (se já onboardou)
- [ ] Histórico aparece em `/saude` (se tinha sessões)
- [ ] Brand kit aparece se gravado antes
- [ ] Manda 1 briefing simples pra ver se Concierge responde

Se algo estiver estranho visualmente, recarregue com `Cmd+Shift+R`. State legacy pode estar em localStorage.

---

## Rollback (se atualização quebrar)

```bash
# Lista backups
bin/backup.sh restore

# Restaura
bin/backup.sh restore 2026-06-15

# Volta código pra commit anterior
git log --oneline -10
git checkout <hash-antes-do-update>
```

Reinicia backend + frontend. Verifica se voltou ao normal.

Quando tudo OK, NÃO esqueça de avisar (calebe@lemmon.com.br) que rolou rollback,
pra ele entender o que quebrou.

---

## Mudanças quebradoras por release

### v1.46 → v1.46.1
- Sem breaking changes. `nome_projeto` ficou opcional no JSON da sessão (default null).

### v1.46.1 → v1.46.2
- Sem breaking changes. Auth fica opcional em dev (`LEMMON_AUTH_TOKEN` vazio).
- LGPD endpoints exigem auth EM PROD (não bloqueia dev).
- `tenant_id()` rejeita path traversal — tenant inválido vira `default`.

### v1.46.2 → v1.47
- **Nova feature:** `/financeiro/*` endpoints + `/financeiro` página.
- **Nova dependência:** `openpyxl>=3.1.0`. `pip install -r requirements.txt` é obrigatório.
- `historico/<tenant>/financeiro/` pasta nova (criada on-demand).

### v1.47 → v1.48
- **Audit log com hash chain.** Logs antigos continuam legíveis mas próximas
  linhas vão ter campo `prev` e `hash`. Pra validar integridade:
  ```bash
  .venv/bin/python -c "from core.audit import verificar_integridade; print(verificar_integridade())"
  ```
- **Cripto em brand_kit + usuarios.** Se você setar `LEMMON_ENCRYPT_KEY` agora,
  PRÓXIMA escrita vira cifrada. JSONs já no disco continuam plaintext até serem
  re-gravados. Pra migrar tudo:
  ```bash
  # GET (lê plain) + PUT (escreve cifrado) força re-gravação
  curl -X GET localhost:8000/brand-kit | curl -X PUT localhost:8000/brand-kit -d @-
  ```
- **`buscar_historico_similar` filtra por tenant.** Histórico de tenants
  diferentes NÃO mistura mais. Se você dependia desse vazamento (raro), o
  Concierge vai parar de injetar sessões alheias.

---

## Cron (backup automático diário)

Já configurado se você seguiu setup. Pra verificar:

```bash
crontab -l | grep backup
```

Esperado:
```
0 3 * * * /Users/calebe/Documents/lemmon-agentes/bin/backup.sh > /tmp/lemmon-backup.log 2>&1
```

Se não tiver, instalar:
```bash
crontab -l 2>/dev/null | { cat; echo "0 3 * * * /Users/calebe/Documents/lemmon-agentes/bin/backup.sh > /tmp/lemmon-backup.log 2>&1"; } | crontab -
```

Roda às 3h da manhã. Logs em `/tmp/lemmon-backup.log`.

Pra testar manualmente:
```bash
bin/backup.sh
ls -la ~/Documents/lemmon-backups/daily/
```
