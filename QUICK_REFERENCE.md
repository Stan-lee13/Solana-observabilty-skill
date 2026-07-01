# Quick Reference — Solana Observability Skill

Copy-paste snippets for the most common observability tasks.

---

## RPC Health Exporter (Node.js)

```typescript
import { Connection } from '@solana/web3.js';
import { Gauge, Registry } from 'prom-client';

const register = new Registry();
const slotLag = new Gauge({ name: 'solana_rpc_slot_lag', help: 'RPC slot lag vs reference', registers: [register] });
const rpcHealthy = new Gauge({ name: 'solana_rpc_healthy', help: '1 if healthy, 0 if not', registers: [register] });

async function collectRpcMetrics(connection: Connection) {
  try {
    const slot = await connection.getSlot();
    const refSlot = await new Connection('https://api.mainnet-beta.solana.com').getSlot();
    slotLag.set(refSlot - slot);
    rpcHealthy.set(Math.abs(refSlot - slot) < 50 ? 1 : 0);
  } catch { rpcHealthy.set(0); }
}
```

---

## Fee Payer Balance Metric

```typescript
const feePayerBalance = new Gauge({
  name: 'solana_fee_payer_balance_sol',
  help: 'Fee payer SOL balance',
  labelNames: ['address'],
  registers: [register],
});

async function collectFeePayerMetrics(connection: Connection, feePayer: string) {
  const lamports = await connection.getBalance(new PublicKey(feePayer));
  feePayerBalance.labels(feePayer.slice(0, 8)).set(lamports / 1e9);
}
```

---

## Transaction Success Rate Alert (Prometheus)

```yaml
- alert: TxSuccessRateLow
  expr: |
    sum(rate(solana_transaction_total{status="success"}[5m])) /
    sum(rate(solana_transaction_total[5m])) < 0.90
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Tx success rate {{ $value | humanizePercentage }}"
    runbook: "runbooks/transaction-success-rate-low.md"
```

---

## Grafana Dashboard JSON Snippet (fee payer panel)

```json
{
  "title": "Fee Payer Balance",
  "type": "stat",
  "targets": [{
    "expr": "solana_fee_payer_balance_sol",
    "legendFormat": "{{address}}"
  }],
  "thresholds": {
    "steps": [
      { "color": "red",    "value": 0 },
      { "color": "yellow", "value": 0.5 },
      { "color": "green",  "value": 2 }
    ]
  },
  "unit": "short",
  "reducers": ["lastNotNull"]
}
```

---

## Structured Log Format (Pino)

```typescript
import pino from 'pino';
const log = pino({ level: 'info' });

// Correct: structured log with indexable fields
log.info({ tx_sig: sig, program: 'my_program', cu_used: 45000, status: 'success' }, 'Transaction landed');

// Wrong: unstructured log (breaks log aggregation)
console.log(`Transaction ${sig} landed using ${cuUsed} CUs`);
```

---

## Alertmanager Route Config (minimal)

```yaml
route:
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: default
  routes:
    - matchers: [severity="critical"]
      receiver: pagerduty-p0
      continue: false
    - matchers: [severity="warning"]
      receiver: discord-alerts

receivers:
  - name: pagerduty-p0
    pagerduty_configs:
      - routing_key: <PAGERDUTY_INTEGRATION_KEY>
  - name: discord-alerts
    discord_configs:
      - webhook_url: <DISCORD_WEBHOOK_URL>
```

---

## SLO Error Budget Calculation

```typescript
// Monthly error budget for 99.9% SLO
const MONTHLY_MINUTES = 30 * 24 * 60;   // 43,200 minutes
const SLO_TARGET = 0.999;
const ERROR_BUDGET_MINUTES = MONTHLY_MINUTES * (1 - SLO_TARGET);  // 43.2 minutes
const BURNED_MINUTES = downtime_minutes;  // From incident log
const REMAINING_PCT = ((ERROR_BUDGET_MINUTES - BURNED_MINUTES) / ERROR_BUDGET_MINUTES) * 100;
console.log(`Error budget remaining: ${REMAINING_PCT.toFixed(1)}%`);
```

---

## Quick runbook lookup

| Alert | Runbook |
|---|---|
| FeePayerBalanceLow | `runbooks/fee-payer-low.md` |
| IndexerLagHigh | `runbooks/indexer-lag.md` |
| RPCDegraded | `runbooks/rpc-degradation.md` |
| TxSuccessRateLow | `runbooks/transaction-success-rate-low.md` |
| ProgramUpgradeDetected | `runbooks/program-upgrade-detected.md` |
| WalletErrorSpike | `runbooks/wallet-error-spike.md` |
| WalletDrainDetected | `runbooks/wallet-drain-detected.md` |
