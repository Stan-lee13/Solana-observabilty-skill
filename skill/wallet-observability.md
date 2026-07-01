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

---

## Argon2id Keystore Monitoring

Operator wallets encrypted with password-derived keys must use Argon2id. Monitoring validates both the algorithm in use and whether derivation parameters meet minimum security thresholds.

```typescript
// scripts/validate-keystore-algo.ts
// Run as part of node onboarding verification or periodic audit
import * as fs from 'fs';

interface KeystoreHeader {
  kdf: string;
  kdfparams: {
    type?: string;        // For Argon2: should be "argon2id"
    memoryCost?: number;  // Must be >= 65536 (64MB)
    timeCost?: number;    // Must be >= 3
    parallelism?: number; // Must be >= 4
    n?: number;           // For scrypt (legacy) — flag for review
  };
}

function validateKeystoreAlgo(keystorePath: string): {
  valid: boolean; algorithm: string; warnings: string[];
} {
  const ks = JSON.parse(fs.readFileSync(keystorePath, 'utf-8')) as KeystoreHeader;
  const warnings: string[] = [];

  if (ks.kdf !== 'argon2') {
    warnings.push(`KDF is '${ks.kdf}' — must be 'argon2' (Argon2id)`);
  }
  if (ks.kdf === 'argon2' && ks.kdfparams.type !== 'argon2id') {
    warnings.push(`Argon2 type '${ks.kdfparams.type}' — must be 'argon2id' (not argon2i or argon2d)`);
  }
  if ((ks.kdfparams.memoryCost ?? 0) < 65536) {
    warnings.push(`memoryCost ${ks.kdfparams.memoryCost} < 65536 (64MB minimum) — GPU-attackable`);
  }
  if ((ks.kdfparams.timeCost ?? 0) < 3) {
    warnings.push(`timeCost ${ks.kdfparams.timeCost} < 3 — brute-force risk`);
  }

  return { valid: warnings.length === 0, algorithm: ks.kdf, warnings };
}

// Prometheus metric to expose
// solana_keystore_algo_valid{node_id="..."} 1|0
// Alert: solana_keystore_algo_valid == 0 → P1
```

**Prometheus alert rule:**
```yaml
- alert: KeystoreAlgorithmWeak
  expr: solana_keystore_algo_valid == 0
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: "Node keystore using weak KDF algorithm"
    description: "Node {{ $labels.node_id }} keystore is not using Argon2id with secure parameters. Rotate immediately."
```

---

## HD Gap Limit Monitoring

During wallet restoration from seed, standard BIP44 derivation stops scanning after 20 consecutive empty accounts (the gap limit). Without monitoring, operators can silently "lose" funded accounts created with non-sequential indices.

```typescript
// services/wallet-monitor/hd-gap-scanner.ts
import { Connection, Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';

const GAP_LIMIT = 20;  // BIP44 standard

interface ScanResult {
  totalScanned: number;
  fundedAccounts: Array<{ index: number; pubkey: string; balanceLamports: number }>;
  maxNonEmptyIndex: number;
  gapLimitSafe: boolean;  // true if no funded accounts near the gap limit
}

async function scanHDGapLimit(
  connection: Connection,
  mnemonic: string,
  scanDepth: number = 50,  // Scan beyond standard gap limit for safety
): Promise<ScanResult> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const funded: ScanResult['fundedAccounts'] = [];
  let emptyRun = 0;
  let i = 0;

  while (i < scanDepth) {
    const { key } = derivePath(`m/44'/501'/${i}'/0'`, seed.toString('hex'));
    const kp = Keypair.fromSeed(key);
    const balance = await connection.getBalance(kp.publicKey);

    if (balance > 0) {
      funded.push({ index: i, pubkey: kp.publicKey.toBase58(), balanceLamports: balance });
      emptyRun = 0;
    } else {
      emptyRun++;
      if (emptyRun >= GAP_LIMIT && i >= GAP_LIMIT) break;
    }
    i++;
  }

  const maxIdx = funded.length > 0 ? Math.max(...funded.map(f => f.index)) : -1;
  return {
    totalScanned: i,
    fundedAccounts: funded,
    maxNonEmptyIndex: maxIdx,
    gapLimitSafe: maxIdx < scanDepth - GAP_LIMIT - 5,  // Safe margin
  };
}

// Metric: solana_hd_gap_funded_accounts_total{operator="..."} N
// Alert: If funded accounts found at indices > 30 → operator may have missed accounts on restore
```

**Prometheus alert rule:**
```yaml
- alert: HDGapLimitRisk
  expr: solana_hd_gap_max_funded_index > 30
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: "HD wallet has funded accounts near gap limit"
    description: "Operator {{ $labels.operator }} has funded accounts at index {{ $value }}. Standard restore tools may miss these."
```

---

## Key Rotation Detection Alerts

Monitor for authority changes across all critical accounts. Planned rotations are expected — unplanned ones are P0 security events.

```typescript
// services/authority-monitor.ts
import { Connection, PublicKey } from '@solana/web3.js';

interface AuthoritySnapshot {
  account: string;
  authority: string | null;
  capturedSlot: number;
}

async function monitorAuthorityChanges(
  connection: Connection,
  watchList: Array<{ name: string; pubkey: PublicKey; expectedAuthority: string }>,
  onchange: (name: string, old: string, current: string) => void,
): Promise<void> {
  const cache = new Map<string, string | null>();

  setInterval(async () => {
    for (const { name, pubkey, expectedAuthority } of watchList) {
      const info = await connection.getAccountInfo(pubkey);
      if (!info) continue;

      // For mint accounts: authority is at offset 4 (32 bytes)
      const currentAuthority = info.data.slice(4, 36).toString('hex');
      const known = cache.get(name);

      if (known !== undefined && known !== currentAuthority) {
        onchange(name, known ?? 'null', currentAuthority);
        // Emit metric: solana_authority_change_total{account="...",expected="..."} += 1
      }
      cache.set(name, currentAuthority);

      if (currentAuthority !== Buffer.from(new PublicKey(expectedAuthority).toBytes()).toString('hex')) {
        // Alert: authority differs from expected
        // solana_authority_mismatch{account=name} = 1
      }
    }
  }, 30_000);  // Poll every 30 seconds
}
```

**Prometheus alert rules:**
```yaml
- alert: AuthorityChangedUnexpected
  expr: increase(solana_authority_change_total[5m]) > 0
  labels:
    severity: critical
  annotations:
    summary: "Account authority changed — verify this was planned"
    description: "Authority on {{ $labels.account }} changed. If unplanned: execute wallet-drain-detected runbook."

- alert: AuthorityMismatch
  expr: solana_authority_mismatch == 1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Account authority does not match expected value"
    description: "{{ $labels.account }} authority is not the expected Squads multisig. Immediate investigation required."
```
