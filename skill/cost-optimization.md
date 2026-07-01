# Cost Optimization — RPC Costs, CU Budgeting & Helius Credit Management

> Load this skill when you want to reduce your Solana infrastructure bill without
> sacrificing reliability. The three biggest cost levers: RPC credits, Compute Unit
> waste, and indexer query patterns.

---

## The Cost Stack

```
MONTHLY SOLANA INFRASTRUCTURE COST BREAKDOWN (typical $10K–$100K protocol)

1. RPC API Credits (Helius / QuickNode / Triton)     40-60% of cost
   ├── Excessive polling (tight loops instead of webhooks)
   ├── Large response payloads (getAccountInfo on large accounts)
   └── Redundant calls (same data fetched by multiple services)

2. Transaction Fees (priority fees)                  20-35% of cost
   ├── Priority fee miscalibration (paying too much during low congestion)
   └── Failed transactions (fees burned with no result)

3. Compute Units (program efficiency)                5-15% of cost
   ├── Unbounded loops and large account deserializations
   └── Unnecessary CPI calls

4. Indexer / Storage                                  5-15% of cost
   ├── Storing raw transaction data instead of enriched events
   └── Full-history queries instead of windowed queries
```

---

## RPC Cost Reduction

### 1. Replace Polling with Webhooks

The single highest-impact optimization. Each Helius webhook replaces thousands of polling calls.

```typescript
// BEFORE — polling (expensive, ~1 credit per call, 1 call/second = 2.6M credits/month)
setInterval(async () => {
  const balance = await connection.getBalance(vaultPubkey);
  if (balance < threshold) notifyTeam();
}, 1000); // every second

// AFTER — webhook (1 credit per event, fires only when needed)
// Register once via Helius API
async function registerVaultWebhook(
  vaultAddress: string,
  webhookUrl: string,
  heliusApiKey: string
): Promise<string> {
  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${heliusApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ["ANY"],
        accountAddresses: [vaultAddress],
        webhookType: "enhanced", // enriched data, no follow-up RPC calls needed
      }),
    }
  );
  const { webhookID } = await response.json();
  return webhookID;
}
```

**Credit savings table:**

| Pattern | Old (credits/month) | New (credits/month) | Savings |
|---|---|---|---|
| Poll vault balance every 1s | 2,592,000 | ~1,000 (events only) | 99.9% |
| Poll program txs every 5s | 518,400 | ~10,000 (events only) | 98% |
| getAccountInfo on every request | 100,000+ | Cached response (TTL 30s) | 90%+ |

---

### 2. Response Payload Optimization

```typescript
// BEFORE — fetching full account data when you only need balance
const accountInfo = await connection.getAccountInfo(pubkey); // full data
const balance = accountInfo?.lamports ?? 0;

// AFTER — use getBalance (smaller payload, fewer credits)
const balance = await connection.getBalance(pubkey, "confirmed");

// BEFORE — getMultipleAccounts fetching all fields
const accounts = await connection.getMultipleAccountsInfo(pubkeys);

// AFTER — use dataSlice to fetch only needed bytes
const accounts = await connection.getMultipleAccountsInfo(pubkeys, {
  dataSlice: { offset: 0, length: 32 }, // only first 32 bytes (owner pubkey)
  commitment: "confirmed",
});

// BEFORE — getParsedAccountInfo (expensive parsing)
const parsed = await connection.getParsedAccountInfo(tokenAccount);

// AFTER — getAccountInfo with manual deserialization (cheaper)
const raw = await connection.getAccountInfo(tokenAccount);
// Deserialize manually from raw.data Buffer using @solana/spl-token layouts
```

---

### 3. Request Batching & Caching

```typescript
// src/cost/rpc-optimizer.ts
import NodeCache from "node-cache";
import { Connection, PublicKey } from "@solana/web3.js";

class OptimizedRpcClient {
  private connection: Connection;
  private cache: NodeCache;
  private pendingRequests: Map<string, Promise<unknown>> = new Map();

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    // Cache account data for 30 seconds (safe for most monitoring use cases)
    this.cache = new NodeCache({ stdTTL: 30, checkperiod: 10 });
  }

  // Request deduplication: concurrent requests for the same key share one RPC call
  async getBalance(address: string): Promise<number> {
    const cacheKey = `balance:${address}`;
    const cached = this.cache.get<number>(cacheKey);
    if (cached !== undefined) return cached;

    // Deduplicate in-flight requests
    const existing = this.pendingRequests.get(cacheKey);
    if (existing) return existing as Promise<number>;

    const request = this.connection
      .getBalance(new PublicKey(address), "confirmed")
      .then((balance) => {
        this.cache.set(cacheKey, balance);
        this.pendingRequests.delete(cacheKey);
        return balance;
      })
      .catch((err) => {
        this.pendingRequests.delete(cacheKey);
        throw err;
      });

    this.pendingRequests.set(cacheKey, request);
    return request;
  }

  // Batch multiple account fetches into one RPC call
  async getMultipleBalances(addresses: string[]): Promise<Record<string, number>> {
    const uncached: string[] = [];
    const results: Record<string, number> = {};

    for (const addr of addresses) {
      const cached = this.cache.get<number>(`balance:${addr}`);
      if (cached !== undefined) {
        results[addr] = cached;
      } else {
        uncached.push(addr);
      }
    }

    if (uncached.length > 0) {
      // One RPC call for all uncached addresses
      const pubkeys = uncached.map((a) => new PublicKey(a));
      const accounts = await this.connection.getMultipleAccountsInfo(pubkeys, {
        dataSlice: { offset: 0, length: 0 }, // no data, just lamports
        commitment: "confirmed",
      });

      for (let i = 0; i < uncached.length; i++) {
        const balance = accounts[i]?.lamports ?? 0;
        results[uncached[i]] = balance;
        this.cache.set(`balance:${uncached[i]}`, balance);
      }
    }

    return results;
  }
}
```

---

## Compute Unit Optimization

### CU Budget Strategy Per Transaction Type

```typescript
// src/cost/cu-budget.ts
import {
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";

// Conservative CU budgets by instruction complexity
// Measure with: /obs cu-optimize or solana logs during testing
const CU_BUDGETS: Record<string, number> = {
  // Simple state reads / updates
  simple_update: 20_000,
  token_transfer: 25_000,

  // Medium complexity
  stake_deposit: 80_000,
  swap_simple: 100_000,
  mint_nft: 150_000,

  // High complexity
  swap_with_route: 300_000,
  batch_claim: 400_000,
  governance_vote: 200_000,

  // Maximum — use only when needed
  complex_cpi_chain: 800_000,

  // Always leave headroom: set budget to 110% of measured peak
};

export function buildCuOptimizedTransaction(
  instructions: TransactionInstruction[],
  instructionType: keyof typeof CU_BUDGETS,
  priorityFeeMicroLamports: number
): TransactionInstruction[] {
  const cuLimit = CU_BUDGETS[instructionType] ?? 200_000;

  return [
    // Set CU limit (only pay for what you use)
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    // Set priority fee (dynamic based on network congestion)
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }),
    ...instructions,
  ];
}

// Dynamic priority fee fetching (avoid overpaying)
export async function getOptimalPriorityFee(
  rpcUrl: string,
  percentile: 50 | 75 | 95 = 75
): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getRecentPrioritizationFees",
      params: [],
    }),
  });

  const { result } = await response.json();
  const fees: number[] = result
    .map((r: { prioritizationFee: number }) => r.prioritizationFee)
    .sort((a: number, b: number) => a - b);

  if (fees.length === 0) return 1000; // fallback: 1000 micro-lamports

  const idx = Math.floor((fees.length - 1) * (percentile / 100));
  return fees[idx];
}
```

---

### CU Regression Testing in CI

Catch CU regressions before they hit mainnet:

```typescript
// tests/cu-regression.test.ts
import { describe, it, expect } from "vitest";
import {
  Connection,
  Transaction,
  ComputeBudgetProgram,
  Keypair,
} from "@solana/web3.js";

const CU_REGRESSION_THRESHOLDS: Record<string, number> = {
  initialize: 50_000,
  deposit: 80_000,
  withdraw: 80_000,
  claim_reward: 120_000,
};

describe("CU regression tests", () => {
  const connection = new Connection("http://localhost:8899", "confirmed"); // local validator

  for (const [instruction, maxCu] of Object.entries(CU_REGRESSION_THRESHOLDS)) {
    it(`${instruction} uses fewer than ${maxCu} CU`, async () => {
      // Build and simulate the instruction
      const simulation = await connection.simulateTransaction(
        buildTestTransaction(instruction),
        { sigVerify: false }
      );

      const unitsConsumed = simulation.value.unitsConsumed ?? 0;
      expect(unitsConsumed).toBeLessThan(maxCu);
    });
  }
});
```

---

## Helius Credit Monitoring

Track your Helius credit consumption before it surprises you:

```typescript
// src/cost/helius-credit-monitor.ts
import { Gauge, Counter, Registry } from "prom-client";

export function createHellusCreditMonitor(registry: Registry) {
  const creditsUsed = new Gauge({
    name: "helius_credits_used_total",
    help: "Total Helius API credits consumed this billing cycle",
    registers: [registry],
  });

  const creditsRemaining = new Gauge({
    name: "helius_credits_remaining",
    help: "Helius API credits remaining this billing cycle",
    registers: [registry],
  });

  const creditBurnRate = new Gauge({
    name: "helius_credits_burn_rate_per_hour",
    help: "Current Helius credit burn rate per hour",
    registers: [registry],
  });

  return async function checkHeliusCredits(apiKey: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/usage?api-key=${apiKey}`
      );
      const usage = await response.json();

      if (usage.currentUsage !== undefined) {
        creditsUsed.set(usage.currentUsage);
      }
      if (usage.limit !== undefined && usage.currentUsage !== undefined) {
        creditsRemaining.set(usage.limit - usage.currentUsage);

        // Estimate burn rate from usage vs days into billing cycle
        const now = new Date();
        const daysIntoMonth = now.getDate();
        const hoursIntoMonth = daysIntoMonth * 24 + now.getHours();
        const burnRatePerHour = usage.currentUsage / Math.max(hoursIntoMonth, 1);
        creditBurnRate.set(burnRatePerHour);

        // Project end-of-month usage
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const projectedTotal = burnRatePerHour * daysInMonth * 24;
        if (projectedTotal > usage.limit * 0.9) {
          console.warn(
            `[helius] Projected monthly usage: ${Math.round(projectedTotal)} / ${usage.limit} (${Math.round(projectedTotal / usage.limit * 100)}%)`
          );
        }
      }
    } catch (err) {
      console.error("[helius] Failed to fetch credit usage:", err);
    }
  };
}
```

---

## Cost Prometheus Alert Rules

```yaml
# Add to deploy/alerts.yml
- name: solana-cost-optimization
  interval: 300s  # Check every 5 minutes
  rules:
    - alert: HellusCreditsBurnRateHigh
      expr: helius_credits_burn_rate_per_hour * 24 * 30 > helius_credits_remaining * 0.8
      for: 15m
      labels:
        severity: p2
        service: solana-cost
        owner: protocol-ops
      annotations:
        summary: "Helius credits on track to exceed plan limit this month"
        description: "Burn rate: {{ $value }}/hr. Remaining: {{ $labels.helius_credits_remaining }}."

    - alert: SolanaCUUsageHigh
      expr: |
        histogram_quantile(0.95,
          sum(rate(solana_instruction_compute_units_bucket[1h])) by (le, instruction)
        ) > 900000
      for: 30m
      labels:
        severity: p2
        service: solana-cost
        owner: engineering
      annotations:
        summary: "Instruction {{ $labels.instruction }} p95 CU at {{ $value }} (approaching 1.2M limit)"

    - alert: SolanaFailedTxCostHigh
      expr: |
        sum(rate(solana_transaction_total{status="failed"}[1h]))
        / clamp_min(sum(rate(solana_transaction_total[1h])), 1) > 0.05
      for: 30m
      labels:
        severity: p2
        service: solana-cost
      annotations:
        summary: "5%+ of transactions failing — wasted priority fee spend"
```

---

## Quick Win Checklist

```text
RPC COST WINS (implement in priority order):
[ ] Replace polling loops with Helius webhooks → 90%+ credit reduction
[ ] Enable getAccountInfo caching (30s TTL) → 80% reduction on hot accounts
[ ] Use dataSlice when you only need partial account data
[ ] Batch getMultipleAccountsInfo instead of sequential getAccountInfo calls
[ ] Monitor credit burn rate — catch runaway services before end of month

CU COST WINS:
[ ] Set explicit ComputeBudgetProgram.setComputeUnitLimit (stop overpaying default 200K)
[ ] Run CU regression tests in CI — catch regressions before mainnet
[ ] Use dynamic priority fees (getRecentPrioritizationFees) instead of hardcoded
[ ] Profile heavy instructions with /obs cu-optimize

TRANSACTION FEE WINS:
[ ] Retry failed transactions with exponential backoff (avoid duplicate pays)
[ ] Simulate before send — catch failures before spending fees
[ ] Use versioned transactions + ALTs for batch operations (fewer accounts = lower fees)
```

---

## Prometheus Cardinality Management

Cardinality is the #1 hidden cost driver in Prometheus. Each unique combination of label values = one time series. 1 metric with 1000 label values = 1000 series. At 10M series, Prometheus OOMs.

```typescript
// BAD — causes cardinality explosion
// Never label with unbounded values
metrics.counter('solana_tx_processed', {
  signature: txSignature,    // ❌ unique per tx — explodes to millions
  wallet: userWallet,        // ❌ unique per user — explodes
  timestamp: Date.now(),     // ❌ unique per second
});

// GOOD — bounded label cardinality
metrics.counter('solana_tx_processed', {
  program_id: programId.toBase58().slice(0, 8),  // ✅ bounded (your programs only)
  instruction: 'stake',                            // ✅ bounded (enum of instructions)
  status: 'success',                               // ✅ bounded (success/failed)
  cluster: 'mainnet-beta',                         // ✅ bounded (mainnet/devnet)
});
```

**Cardinality audit query:**
```promql
# Find your top 20 highest-cardinality metrics
topk(20, count by (__name__)({__name__=~".+"}))

# Find metrics with label explosion risk (> 1000 unique values per label)
count by (__name__, label_name) (
  {__name__=~"solana.*"}
) > 1000
```

**Cardinality budget rules:**
- Total active series < 500K for a single Prometheus instance
- No single label should exceed 100 unique values
- Drop high-cardinality labels via `metric_relabel_configs` before they hit storage

```yaml
# deploy/prometheus.yml — drop high-cardinality labels at scrape time
- job_name: "solana-exporter"
  metric_relabel_configs:
    # Drop per-transaction signature labels entirely
    - source_labels: [tx_signature]
      regex: ".+"
      action: labeldrop
    # Drop raw wallet addresses — use truncated alias instead
    - source_labels: [wallet_address]
      regex: ".+"
      action: labeldrop
    # Drop any metric with > 10K series (safety circuit breaker)
    - source_labels: [__name__]
      regex: "solana_tx_signature.*|solana_user_wallet.*"
      action: drop
```

---

## Prometheus Retention Policy

Retention is the second biggest cost driver. Default is 15 days — most teams need 30-90 days for SLO reviews.

```yaml
# deploy/docker-compose.yml — Prometheus retention config
services:
  prometheus:
    image: prom/prometheus:latest
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=30d"     # Keep 30 days of data
      - "--storage.tsdb.retention.size=20GB"    # Hard cap — never exceed disk
      - "--storage.tsdb.wal-compression"        # Compress WAL (~50% savings)
      - "--web.enable-lifecycle"                # Allow hot-reload via API
```

**Retention tier strategy:**

| Tier | Retention | Tool | Cost | Use for |
|---|---|---|---|---|
| Hot | 15 days | Local Prometheus | Low | Active alerting, current dashboards |
| Warm | 90 days | Thanos / Cortex | Medium | SLO reviews, incident analysis |
| Cold | 1 year+ | Grafana Cloud / S3 | Low | Compliance, annual trends |

```bash
# Estimate storage needed for your retention policy
# Formula: series_count × bytes_per_sample × samples_per_second × retention_seconds
python3 -c "
series = 50_000           # Your active series count
bytes_per_sample = 1.5    # Prometheus average
samples_per_sec = series / 15  # Default 15s scrape interval
retention_days = 30
total_gb = (series * bytes_per_sample * samples_per_sec * retention_days * 86400) / 1e9
print(f'Estimated storage: {total_gb:.1f} GB for {retention_days}d at {series:,} series')
"
```
