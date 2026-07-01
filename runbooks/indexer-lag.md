# Runbook: Indexer Lag

**Alert:** `IndexerLagHigh` | **Severity:** P1 (user-facing balances/claims stale)
**Target resolution:** < 45 minutes | **Owner:** On-call SRE + Indexer team

---

## When this fires
- `solana_indexer_lag_seconds > 300` sustained > 3 minutes
- User reports: balances stale, claims not appearing, NFTs missing
- Indexer's `last_indexed_slot` diverging from chain head by > 600 slots

---

## Immediate actions (do this first)

```bash
# Compare indexer slot to chain head
INDEXER_SLOT=$(curl -s <INDEXER_HEALTH_URL> \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['last_indexed_slot'])")
CHAIN_SLOT=$(curl -s -X POST <RPC_URL> -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
LAG=$((CHAIN_SLOT - INDEXER_SLOT))
echo "Lag: $LAG slots (~$((LAG / 2))s at 2 slots/sec)"
# > 300 slots = confirmed P1
```

---

## Diagnosis steps

```bash
# Check indexer process
systemctl status <INDEXER_SERVICE> || docker ps | grep indexer

# Tail logs for errors
journalctl -u <INDEXER_SERVICE> -n 100 --no-pager | grep -E "ERROR|panic|WARN"

# Check DB write bottleneck
psql <INDEXER_DB_URL> -c "
SELECT tablename, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 5;"
```

| Symptom | Root cause | Remediation |
|---|---|---|
| Process not running | Crash / OOM | Step A — restart |
| Process running, slot not advancing | RPC too slow / disconnected | Step B — switch RPC |
| DB queries slow, n_dead_tup high | Table bloat | Step C — vacuum |
| Geyser plugin reconnecting repeatedly | WS dropped | Step D — reconnect |
| All RPCs lagging equally | Chain congestion | Monitor only — self-resolves |

---

## Remediation

### Step A — Restart indexer
```bash
systemctl restart <INDEXER_SERVICE>
# Watch lag drop
watch -n 10 "echo Lag: \$(($(curl -s -X POST <RPC_URL> \
  -H 'Content-Type: application/json' \
  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSlot\"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"result\"])') \
  - $(curl -s <INDEXER_HEALTH_URL> | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"last_indexed_slot\"])'))) slots"
```

### Step B — Switch to backup RPC
```bash
# Edit <INDEXER_CONFIG_PATH>: rpc_url = "<BACKUP_RPC_URL>"
systemctl restart <INDEXER_SERVICE>
```

### Step C — Vacuum bloated tables
```bash
psql <INDEXER_DB_URL> -c "VACUUM ANALYZE transactions;"
psql <INDEXER_DB_URL> -c "VACUUM ANALYZE accounts;"
```

### Step D — Reconnect Geyser
```bash
# Restart Geyser plugin — config: <GEYSER_CONFIG_PATH>
pkill -f geyser && sleep 2
solana-validator --geyser-plugin-config <GEYSER_CONFIG_PATH> &
```

---

## Escalation
- Lag > 30 min → page indexer team lead
- DB corruption suspected → page DBA
- User funds impacted → `runbooks/wallet-drain-detected.md`

---

## Post-incident
- [ ] Duration and user impact documented
- [ ] Root cause fixed and regression test added
- [ ] Consider: read replica for failover during primary lag
- [ ] Lower alert threshold to 120s if 300s was reached
