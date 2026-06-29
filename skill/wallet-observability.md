# Wallet Observability — SLOs, Privacy-Safe Analytics, and Health Dashboards

> Load this file alongside `skill/security-observability.md` when building
> observability for a wallet application specifically.
> Covers: wallet-specific SLOs, privacy-preserving analytics, fee payer runway,
> signing latency tracking, and the wallet operator health dashboard.

---

## Wallet-Specific SLO Definitions

Generic transaction SLOs are not sufficient for wallets. These are the SLOs
that wallet operators should define and measure.

```yaml
# wallet-slos.yml — add to your observability config

slos:
  # How often users can successfully connect their wallet to the dApp
  wallet_connection_success_rate:
    description: "% of wallet connect attempts that succeed"
    target: 98.5%
    window: 7d
    sli: |
      sum(rate(solana_wallet_connect_total{status="success"}[7d]))
      / clamp_min(sum(rate(solana_wallet_connect_total[7d])), 1)
    error_budget_policy: "P1 alert at 2x burn, P0 at 14x burn"

  # How quickly the wallet can request a signature (user experience)
  signing_request_p95_latency:
    description: "p95 time from 'Sign' button to wallet popup appearing"
    target: 500ms
    window: 24h
    sli: |
      histogram_quantile(0.95,
        rate(solana_wallet_signing_request_duration_ms_bucket[24h])
      )

  # How quickly transactions are confirmed after signing
  transaction_confirmation_p95:
    description: "p95 time from broadcast to confirmed"
    target: 15s
    window: 24h
    sli: |
      histogram_quantile(0.95,
        rate(solana_transaction_confirmation_seconds_bucket[24h])
      )

  # Fee payer runway — critical for gasless wallets
  fee_payer_runway_hours:
    description: "Hours of gasless transaction capacity remaining"
    target: 168h   # 7 days minimum
    window: 1h
    sli: |
      solana_fee_payer_balance_sol / solana_fee_payer_spend_rate_sol_per_hour
    alert_threshold: 48h   # Alert when < 2 days runway remains
```

---

## Wallet Metrics Extensions

Add these metrics to `deploy/solana-exporter/index.ts` for wallet-specific monitoring.

```typescript
// deploy/solana-exporter/wallet-metrics.ts
import { Counter, Gauge, Histogram, Registry } from "prom-client";

export function registerWalletMetrics(registry: Registry) {
  // ── Connection metrics ────────────────────────────────────────────────────
  const walletConnectTotal = new Counter({
    name: "solana_wallet_connect_total",
    help: "Total wallet connection attempts",
    labelNames: ["wallet_name", "status", "error_category"] as const,
    registers: [registry],
  });

  const walletConnectDuration = new Histogram({
    name: "solana_wallet_connect_duration_ms",
    help: "Wallet connection latency in milliseconds",
    labelNames: ["wallet_name"] as const,
    buckets: [50, 100, 250, 500, 1000, 2000, 5000],
    registers: [registry],
  });

  // ── Signing metrics ───────────────────────────────────────────────────────
  const signingRequestTotal = new Counter({
    name: "solana_wallet_signing_request_total",
    help: "Total signing requests sent to wallet",
    labelNames: ["wallet_name", "tx_type", "status"] as const,
    registers: [registry],
  });

  const signingRequestDuration = new Histogram({
    name: "solana_wallet_signing_request_duration_ms",
    help: "Time from signing request to user approval/rejection",
    labelNames: ["wallet_name", "tx_type"] as const,
    buckets: [200, 500, 1000, 2000, 5000, 10000, 30000],
    registers: [registry],
  });

  // ── Gasless / fee payer metrics ───────────────────────────────────────────
  const feePayerSpendRate = new Gauge({
    name: "solana_fee_payer_spend_rate_sol_per_hour",
    help: "Current fee payer spend rate (rolling 1h average)",
    labelNames: ["alias"] as const,
    registers: [registry],
  });

  const gaslessTxTotal = new Counter({
    name: "solana_gasless_tx_total",
    help: "Total gasless transactions sponsored",
    labelNames: ["action_type", "status"] as const,
    registers: [registry],
  });

  const gaslessRateLimitHits = new Counter({
    name: "solana_gasless_rate_limit_hits_total",
    help: "Times a user hit the gasless rate limit",
    labelNames: ["action_type"] as const,
    registers: [registry],
  });

  // ── Security events (privacy-safe — no wallet addresses as labels) ─────────
  const drainerBlockTotal = new Counter({
    name: "solana_wallet_drainer_blocked_total",
    help: "Drainer transactions blocked by intent analysis",
    labelNames: ["drainer_pattern"] as const,  // pattern type only, not address
    registers: [registry],
  });

  const addressPoisoningDetected = new Counter({
    name: "solana_address_poisoning_detected_total",
    help: "Address poisoning attempts detected in send flow",
    registers: [registry],
  });

  const autoLockTriggered = new Counter({
    name: "solana_wallet_auto_lock_total",
    help: "Auto-lock events triggered",
    labelNames: ["reason"] as const,  // "inactivity" | "suspicious_activity" | "manual"
    registers: [registry],
  });

  return {
    walletConnectTotal,
    walletConnectDuration,
    signingRequestTotal,
    signingRequestDuration,
    feePayerSpendRate,
    gaslessTxTotal,
    gaslessRateLimitHits,
    drainerBlockTotal,
    addressPoisoningDetected,
    autoLockTriggered,
  };
}
```

---

## Privacy-Safe Wallet Analytics

Wallets are special: users expect their financial activity to remain private.
These are the rules for collecting useful operational metrics without compromising user privacy.

```
WHAT IS SAFE TO COLLECT (aggregate, no identity):
  ✅ Total connection attempts (count, not by wallet)
  ✅ Wallet adapter name (Phantom, Backpack, etc.)
  ✅ Error categories (user_rejected, network_error, etc.)
  ✅ Transaction type (swap, transfer, stake) — not amounts
  ✅ p50/p95 confirmation times
  ✅ Drainer block count by pattern type (not by wallet)
  ✅ Fee payer balance and spend rate
  ✅ Browser/device type for UX debugging

WHAT MUST NEVER BE COLLECTED:
  ❌ Wallet addresses (even "anonymized" — they're public and traceable)
  ❌ Transaction signatures (links to on-chain activity)
  ❌ Token amounts or balances
  ❌ Browsing behavior linked to wallet identity
  ❌ IP addresses linked to wallet connections
  ❌ User session IDs that could correlate wallet address to IP

POSTURE:
  Collect for operational excellence. Never for user surveillance.
  If you need to debug a specific user's issue, use Helius with their explicit permission.
  Default data retention: 7 days for operational metrics, 90 days for aggregate trends.
```

---

## Wallet Fee Payer Runway Dashboard

A critical operational dashboard for any protocol offering gasless transactions.

```typescript
// Prometheus alert for fee payer runway
// Add to deploy/alerts.yml

groups:
  - name: wallet-fee-payer
    rules:
      - alert: FeePayerRunwayLow
        expr: |
          (solana_fee_payer_balance_sol / solana_fee_payer_spend_rate_sol_per_hour) < 48
        for: 5m
        labels:
          severity: p1
          service: wallet-gasless
          owner: protocol-ops
          runbook_url: runbooks/fee-payer-low.md
        annotations:
          summary: "Fee payer runway below 48 hours"
          description: "At current spend rate, fee payer {{ $labels.alias }} will be exhausted in {{ $value | humanizeDuration }}. Refill immediately."

      - alert: FeePayerRunwayCritical
        expr: |
          (solana_fee_payer_balance_sol / solana_fee_payer_spend_rate_sol_per_hour) < 4
        for: 1m
        labels:
          severity: p0
          service: wallet-gasless
        annotations:
          summary: "Fee payer < 4 hours runway — gasless transactions will fail"

      - alert: GaslessRateLimitSpike
        expr: increase(solana_gasless_rate_limit_hits_total[10m]) > 50
        for: 2m
        labels:
          severity: p2
        annotations:
          summary: "Unusual gasless rate limit hits — possible abuse"

      - alert: DrainerBlockedSpike
        expr: increase(solana_wallet_drainer_blocked_total[5m]) > 10
        for: 1m
        labels:
          severity: p1
        annotations:
          summary: "Drainer transactions being blocked — active attack in progress"
          description: "{{ $value }} drainer transactions blocked in 5 minutes. Investigate and consider frontend takedown."
```

---

## Cross-Skill Wallet Signals (Observability → All Skills)

```typescript
// New wallet-specific signals emitted by observability skill

export interface WalletHealthSignal {
  signal: "OBS_WALLET_HEALTH";
  timestamp_utc: string;
  metrics: {
    connection_success_rate_7d: number;      // 0-1
    signing_p95_latency_ms: number;
    fee_payer_runway_hours: number;
    drainer_blocks_last_hour: number;
    gasless_rate_limit_hits_last_hour: number;
  };
  action_required: boolean;
  recommended_action: string | null;
}

// Fire this to Incident Response when drainer blocks spike
export interface WalletDrainerSpikeSignal {
  signal: "OBS_WALLET_DRAINER_SPIKE";
  source_skill: "Solana-observabilty-skill";
  severity: "P1";
  drainer_pattern: string;
  blocks_in_window: number;
  window_minutes: number;
  // Load: solana-incident-response-skill/skill/wallet-security.md
  // → Drainer Contract Deep Analysis → Pattern Detection
}
```
