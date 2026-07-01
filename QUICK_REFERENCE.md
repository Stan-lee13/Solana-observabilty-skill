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

---

## OpenTelemetry Trace Setup (Node.js)

```typescript
// tracing.ts — import BEFORE anything else
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'solana-protocol', 'solana.cluster': process.env.CLUSTER ?? 'mainnet-beta' }),
  traceExporter: new OTLPTraceExporter({ url: process.env.OTLP_ENDPOINT ?? 'http://tempo:4318/v1/traces' }),
});
sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

---

## node_exporter — Prometheus Scrape Config

```yaml
# Add to deploy/prometheus.yml
- job_name: "node-exporter"
  static_configs:
    - targets: ["node-exporter:9100"]
  relabel_configs:
    - source_labels: [__address__]
      target_label: instance
      regex: "([^:]+).*"
      replacement: "$1"
```

---

## Alertmanager Inhibition Rules (Alert Storm Prevention)

```yaml
# deploy/alertmanager.yml — inhibit_rules
inhibit_rules:
  - source_matchers: [alertname="SolanaRPCDown"]
    target_matchers: [severity=~"warning|info"]
    equal: [job]
  - source_matchers: [alertname="SolanaWalletDrainDetected"]
    target_matchers: [alertname=~"SolanaFeePayerLow|SolanaFeePayerRefillNeeded"]
  - source_matchers: [alertname="SolanaProgramPaused"]
    target_matchers: [alertname=~"SolanaTxSuccessRateLow|SolanaInstructionErrors"]
    equal: [program_id]
```

---

## Cardinality Audit (Prometheus)

```promql
# Find top 20 highest-cardinality metrics
topk(20, count by (__name__)({__name__=~".+"}))

# Drop high-cardinality labels at scrape time (prometheus.yml)
# metric_relabel_configs:
#   - source_labels: [tx_signature]
#     regex: ".+"
#     action: labeldrop
```

---

## Prometheus Retention Config

```yaml
# docker-compose.yml — prometheus command
command:
  - "--storage.tsdb.retention.time=30d"
  - "--storage.tsdb.retention.size=20GB"
  - "--storage.tsdb.wal-compression"
```

---

## Loki Log Query (LogQL)

```logql
# Recent errors from solana-exporter
{service="solana-exporter"} |= "ERROR" | json | line_format "{{.msg}}"

# Transaction failures in last 1h
{service="solana-protocol"} |= "failed" | json | status="failed"
  | rate[5m]
```

---

## Blackbox Exporter — HTTP Probe Config

```yaml
# deploy/blackbox.yml
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200]
      follow_redirects: true

# Prometheus scrape for blackbox probes (prometheus.yml)
- job_name: "blackbox-http"
  metrics_path: /probe
  params: { module: [http_2xx] }
  static_configs:
    - targets: ["${RPC_URL}/health", "${INDEXER_HEALTH_URL}"]
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - target_label: __address__
      replacement: "blackbox-exporter:9115"
```

---

## CU Profile + Benchmark Compare

```typescript
// Quick CU snapshot for a program
const sigs = await connection.getSignaturesForAddress(programId, { limit: 50 });
const cuValues = await Promise.all(sigs.map(async s => {
  const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  return tx?.meta?.computeUnitsConsumed ?? 0;
}));
const sorted = cuValues.filter(Boolean).sort((a,b)=>a-b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const recommended = Math.ceil(p95 * 1.2);  // 20% buffer
console.log(`p95=${p95} recommended_limit=${recommended}`);
```
