# Runbook: RPC Degradation

**Alert:** `RPCDegraded` | **Severity:** P1 → P0 if all RPCs fail
**Target resolution:** < 5 minutes via failover | **Owner:** On-call SRE

---

## When this fires
- `solana_rpc_healthy == 0` for primary RPC
- Slot lag on primary > 50 slots vs chain head
- Transaction landing rate drops > 40%

---

## Immediate actions (do this first)

```bash
# Test primary RPC health
curl -s -X POST <PRIMARY_RPC_URL> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('Health:', d.get('result',d.get('error')))"

# Compare slot vs reference
PRIMARY=$(curl -s -X POST <PRIMARY_RPC_URL> -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
REF=$(curl -s -X POST https://api.mainnet-beta.solana.com -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "Lag: $((REF - PRIMARY)) slots — $([ $((REF-PRIMARY)) -gt 50 ] && echo DEGRADED || echo OK)"
```

---

## Diagnosis steps

| Symptom | Root cause | Remediation |
|---|---|---|
| `getHealth` returns error | Provider outage | Step A — failover |
| Slot lag > 50 | Provider behind chain | Step A — failover |
| HTTP 429 response | Rate limited | Step B — upgrade plan |
| Slot fine but txs failing | Provider-specific tx issue | Step A — failover |
| ALL providers degraded | Chain congestion or DDoS | Step C — wait + notify |

---

## Remediation

### Step A — Failover to backup RPC
```bash
# Update env var in your deployment
export RPC_URL="<BACKUP_RPC_URL>"
# Or update nginx upstream:
# Swap primary for backup in /etc/nginx/conf.d/rpc-proxy.conf && nginx -s reload

# Verify failover worked
curl -s -X POST $RPC_URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | python3 -c \
  "import json,sys; print('Backup slot:', json.load(sys.stdin)['result'])"
```

### Step B — Rate limit mitigation
```typescript
// Add exponential backoff + request queuing
const queue = new PQueue({ concurrency: 5, intervalCap: 100, interval: 1000 });
const getSlot = () => queue.add(() => connection.getSlot());
```

### Step C — Multi-RPC pool (implement if single-provider outages recur)
```typescript
const ENDPOINTS = [
  { url: process.env.RPC_1!, healthy: true },
  { url: process.env.RPC_2!, healthy: true },
];
async function healthyRpc(): Promise<string> {
  for (const e of ENDPOINTS) {
    if (!e.healthy) continue;
    try { await new Connection(e.url).getSlot(); return e.url; }
    catch { e.healthy = false; }
  }
  throw new Error('All RPC endpoints unhealthy');
}
```

---

## Escalation
- All RPCs degraded simultaneously → P0 page all SREs
- Txs failing to land > 10 min → pause user-facing writes
- RPC returning wrong state → treat as potential attack

---

## Post-incident
- [ ] Provider SLA breach? → open support ticket + claim credits
- [ ] Recurrent? → evaluate switching primary provider
- [ ] All backup RPCs tested in staging?
