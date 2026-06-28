# Security Observability

> This skill is the bridge between Observability and Incident Response.
> It detects security-relevant on-chain signals and fires structured alerts
> that `solana-incident-response-skill` can act on immediately.

Normal observability monitors for health. Security observability monitors for threat.
The distinction is in what you're looking for and what happens when you find it.

---

## Security Signal Taxonomy

```
TIER 1 — IMMEDIATE P0 TRIGGER (fire to Incident Response instantly)
  ├── Program authority change (upgrade, mint, freeze) outside approved window
  ├── Vault balance dropping at >5x normal rate
  ├── Repeated probe pattern: many failures from unknown wallet → sudden success
  ├── Governance proposal execution outside scheduled window
  └── Bridge supply mismatch (wrapped supply ≠ locked collateral)

TIER 2 — P1 ALERT (investigate within 15 minutes)
  ├── Oracle price deviation >5% from CEX reference
  ├── Flash loan in same block as high-value protocol interaction
  ├── Known attacker wallet interacting with any program
  ├── Token mint outside expected emission schedule
  └── SetAuthority instruction in any program transaction

TIER 3 — P2 WATCH (investigate within 1 hour)
  ├── Fresh wallet (<24h old) with >1 SOL interacting with program
  ├── CU usage spike (>80% of limit) — possible DoS probe
  ├── IDL discriminator mismatch — possible version drift or attack
  └── Governance token accumulation >3% of supply in <48h
```

---

## Metric Extensions for Security

Add these to your `solana-exporter` alongside the standard health metrics:

```typescript
// deploy/solana-exporter/security-metrics.ts
import { Counter, Gauge, Histogram, Registry } from "prom-client";
import { Connection, PublicKey } from "@solana/web3.js";
import { Helius } from "helius-sdk";

export function registerSecurityMetrics(registry: Registry) {
  // Authority change events
  const authorityChanges = new Counter({
    name: "solana_authority_change_total",
    help: "Total authority changes detected (upgrade, mint, freeze, metadata)",
    labelNames: ["program_id", "authority_type", "expected"] as const,
    registers: [registry],
  });

  // Probe pattern score (failed txs followed by success from same wallet)
  const probeScore = new Gauge({
    name: "solana_probe_pattern_score",
    help: "Rolling probe pattern risk score per wallet (0-100)",
    labelNames: ["program_id", "wallet"] as const,
    registers: [registry],
  });

  // Vault balance drain rate
  const vaultDrainRate = new Gauge({
    name: "solana_vault_drain_rate_lamports_per_sec",
    help: "Rate of balance decrease for monitored vaults",
    labelNames: ["vault_alias", "vault_address"] as const,
    registers: [registry],
  });

  // Flash loan co-occurrence
  const flashLoanCoOccurrence = new Counter({
    name: "solana_flash_loan_cooccurrence_total",
    help: "Flash loan transactions in same block as protocol interaction",
    labelNames: ["program_id", "flash_loan_program"] as const,
    registers: [registry],
  });

  // Known attacker wallet hits
  const watchlistHits = new Counter({
    name: "solana_watchlist_wallet_hit_total",
    help: "Transactions from wallets on the security watchlist",
    labelNames: ["program_id", "wallet_label"] as const,
    registers: [registry],
  });

  // SetAuthority instruction occurrences
  const setAuthorityInstructions = new Counter({
    name: "solana_set_authority_instruction_total",
    help: "SetAuthority instructions observed across monitored programs",
    labelNames: ["program_id", "authority_type"] as const,
    registers: [registry],
  });

  // Oracle deviation gauge
  const oracleDeviation = new Gauge({
    name: "solana_oracle_price_deviation_pct",
    help: "Oracle price deviation from CEX reference in percent",
    labelNames: ["feed_address", "asset"] as const,
    registers: [registry],
  });

  // Governance token accumulation
  const govTokenAccumulation = new Gauge({
    name: "solana_governance_token_accumulation_pct",
    help: "Maximum governance token share accumulated by single wallet in 48h window",
    labelNames: ["governance_mint"] as const,
    registers: [registry],
  });

  return {
    authorityChanges,
    probeScore,
    vaultDrainRate,
    flashLoanCoOccurrence,
    watchlistHits,
    setAuthorityInstructions,
    oracleDeviation,
    govTokenAccumulation,
  };
}
```

---

## Security Collector — Real-Time Event Processing

```typescript
// deploy/solana-exporter/security-collector.ts
import { Helius, type EnhancedTransaction } from "helius-sdk";
import { Connection, PublicKey } from "@solana/web3.js";

// Known attacker wallets — update from incident post-mortems
const WATCHLIST: Record<string, string> = {
  "Hq5gCCHEKE3fCoxneMCFKjptMXxAo8rVfvFdZnTf7u6N": "Wormhole Exploiter 2022",
  "CQvKSNnYtPTZfQRQ5jkHMnAoWZaHXfRn3xoW48qEUGMK": "Mango Exploiter 2022",
};

// Flash loan programs on Solana
const FLASH_LOAN_PROGRAMS = new Set([
  "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo", // Solend
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",  // Marinade (flash)
  "JD3bq9hGdy38PuWQ4h2YJpELmHVGPPfFSuFkpzAd9zfu", // Kamino flash
]);

interface SecurityEvent {
  type:
    | "AUTHORITY_CHANGE"
    | "PROBE_PATTERN"
    | "VAULT_DRAIN"
    | "FLASH_LOAN_COOCCURRENCE"
    | "WATCHLIST_HIT"
    | "SET_AUTHORITY"
    | "ORACLE_DEVIATION"
    | "GOVERNANCE_ACCUMULATION";
  severity: "P0" | "P1" | "P2";
  programId: string;
  wallet?: string;
  signature: string;
  detail: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export class SecurityCollector {
  private helius: Helius;
  private connection: Connection;
  private programIds: string[];
  // Rolling window: wallet → {failures, successes, timestamps}
  private probeWindow: Map<string, {
    failures: number;
    successes: number;
    ts: number[];
  }> = new Map();

  constructor(heliusApiKey: string, rpcUrl: string, programIds: string[]) {
    this.helius = new Helius(heliusApiKey);
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programIds = programIds;
  }

  async processTransaction(
    tx: EnhancedTransaction,
    onSecurityEvent: (event: SecurityEvent) => void
  ): Promise<void> {
    const signature = tx.signature;
    const timestamp = tx.timestamp ?? Math.floor(Date.now() / 1000);
    const feePayer = tx.feePayer ?? "unknown";

    // 1. Watchlist check
    for (const [addr, label] of Object.entries(WATCHLIST)) {
      const participants = [
        feePayer,
        ...(tx.accountData?.map((a) => a.account) ?? []),
      ];
      if (participants.includes(addr)) {
        onSecurityEvent({
          type: "WATCHLIST_HIT",
          severity: "P1",
          programId: this.programIds[0],
          wallet: addr,
          signature,
          detail: `Known attacker wallet interacted with program: ${label}`,
          timestamp,
          metadata: { label, participants },
        });
      }
    }

    // 2. SetAuthority / authority change detection
    for (const ix of tx.instructions ?? []) {
      if (
        ix.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
        ix.data?.startsWith("6") // SetAuthority discriminator
      ) {
        onSecurityEvent({
          type: "SET_AUTHORITY",
          severity: "P0",
          programId: this.programIds[0],
          wallet: feePayer,
          signature,
          detail: "SetAuthority instruction detected — token ownership may be changing",
          timestamp,
          metadata: { instruction: ix },
        });
      }

      if (ix.programId === "BPFLoaderUpgradeab1e11111111111111111111111") {
        onSecurityEvent({
          type: "AUTHORITY_CHANGE",
          severity: "P0",
          programId: ix.accounts?.[0] ?? "unknown",
          wallet: feePayer,
          signature,
          detail: "Program upgrade detected via BPFLoader",
          timestamp,
          metadata: { ix },
        });
      }
    }

    // 3. Flash loan co-occurrence
    const programsInTx = new Set(
      (tx.instructions ?? []).map((ix) => ix.programId)
    );
    for (const flProgram of FLASH_LOAN_PROGRAMS) {
      if (
        programsInTx.has(flProgram) &&
        this.programIds.some((p) => programsInTx.has(p))
      ) {
        onSecurityEvent({
          type: "FLASH_LOAN_COOCCURRENCE",
          severity: "P1",
          programId: this.programIds.find((p) => programsInTx.has(p))!,
          wallet: feePayer,
          signature,
          detail: `Flash loan (${flProgram}) in same transaction as protocol`,
          timestamp,
          metadata: { flashLoanProgram: flProgram },
        });
      }
    }

    // 4. Probe pattern tracking
    const isFailure = tx.transactionError !== null;
    const existing = this.probeWindow.get(feePayer) ?? {
      failures: 0,
      successes: 0,
      ts: [],
    };
    if (isFailure) existing.failures++;
    else existing.successes++;
    existing.ts.push(timestamp);

    // Purge entries older than 1 hour
    const cutoff = timestamp - 3600;
    existing.ts = existing.ts.filter((t) => t > cutoff);
    this.probeWindow.set(feePayer, existing);

    // Probe detected: many failures → sudden success
    if (
      existing.failures >= 5 &&
      existing.successes >= 1 &&
      existing.failures / existing.successes >= 3
    ) {
      onSecurityEvent({
        type: "PROBE_PATTERN",
        severity: existing.failures >= 20 ? "P0" : "P1",
        programId: this.programIds[0],
        wallet: feePayer,
        signature,
        detail: `Probe pattern: ${existing.failures} failures → ${existing.successes} successes`,
        timestamp,
        metadata: { failures: existing.failures, successes: existing.successes },
      });
    }
  }

  // Start real-time monitoring via Helius webhook polling
  async startMonitoring(
    onSecurityEvent: (event: SecurityEvent) => void,
    intervalMs = 10_000
  ): Promise<void> {
    const poll = async () => {
      for (const programId of this.programIds) {
        try {
          const txs = await this.helius.rpc.getTransactionHistory({
            address: programId,
            options: { limit: 20 },
          });
          for (const tx of txs) {
            await this.processTransaction(tx as EnhancedTransaction, onSecurityEvent);
          }
        } catch (err) {
          console.error(`[security-collector] poll error for ${programId}:`, err);
        }
      }
    };
    setInterval(poll, intervalMs);
    await poll(); // initial run
  }
}
```

---

## Security Prometheus Alert Rules

Add to your `deploy/alerts.yml`:

```yaml
# Security alert group — routes to Incident Response skill
- name: solana-security-p0
  interval: 10s
  rules:
    - alert: SolanaAuthorityChangeDetected
      expr: increase(solana_authority_change_total[5m]) > 0
      for: 0m
      labels:
        severity: p0
        service: solana-security
        owner: security-team
        runbook_url: runbooks/unauthorized-upgrade.md
        route_to: incident-response-skill
      annotations:
        summary: "Program authority change detected on {{ $labels.program_id }}"
        description: "Authority type {{ $labels.authority_type }} changed. Expected: {{ $labels.expected }}."

    - alert: SolanaWatchlistWalletHit
      expr: increase(solana_watchlist_wallet_hit_total[5m]) > 0
      for: 0m
      labels:
        severity: p1
        service: solana-security
        owner: security-team
        runbook_url: runbooks/wallet-drainer.md
        route_to: incident-response-skill
      annotations:
        summary: "Known attacker wallet interaction on {{ $labels.program_id }}"
        description: "Wallet label: {{ $labels.wallet_label }}"

    - alert: SolanaProbePatternHigh
      expr: solana_probe_pattern_score > 60
      for: 2m
      labels:
        severity: p1
        service: solana-security
        owner: security-team
        runbook_url: runbooks/active-drain.md
        route_to: incident-response-skill
      annotations:
        summary: "Probe pattern detected on {{ $labels.program_id }}"
        description: "Wallet {{ $labels.wallet }} probe score: {{ $value }}/100"

    - alert: SolanaVaultDrainRateHigh
      expr: solana_vault_drain_rate_lamports_per_sec > 1000000000
      for: 1m
      labels:
        severity: p0
        service: solana-security
        owner: security-team
        runbook_url: runbooks/active-drain.md
        route_to: incident-response-skill
      annotations:
        summary: "Vault {{ $labels.vault_alias }} draining at {{ $value }} lamports/sec"
        description: "Possible active drain. Load active-exploit-response.md immediately."

    - alert: SolanaOracleDeviationCritical
      expr: abs(solana_oracle_price_deviation_pct) > 8
      for: 1m
      labels:
        severity: p0
        service: solana-security
        owner: security-team
        runbook_url: runbooks/oracle-manipulation.md
        route_to: incident-response-skill
      annotations:
        summary: "Oracle deviation {{ $value }}% on {{ $labels.asset }}"
        description: "Feed {{ $labels.feed_address }} deviating. Possible manipulation."

    - alert: SolanaGovernanceAccumulationAlert
      expr: solana_governance_token_accumulation_pct > 5
      for: 10m
      labels:
        severity: p1
        service: solana-security
        owner: security-team
        runbook_url: runbooks/governance-attack.md
        route_to: incident-response-skill
      annotations:
        summary: "Governance token accumulation {{ $value }}% on {{ $labels.governance_mint }}"
        description: "Single wallet acquiring significant governance power. Monitor for proposals."
```

---

## Ecosystem Signal — Firing to Incident Response

When a security event reaches P0/P1, emit a structured signal that Incident Response
consumes automatically. See `ecosystem-signals.md` for the full protocol.

```typescript
// src/security-bridge.ts
interface IncidentResponseSignal {
  signal: "OBS_ANOMALY_TO_INCIDENT";
  source_skill: "Solana-observabilty-skill";
  severity_hint: "critical" | "high" | "medium" | "low";
  program_id: string;
  wallet?: string;
  transaction_signature: string;
  alert_type: string;
  description: string;
  promql_query: string;
  dashboard_link: string;
  timestamp_utc: string;
}

export function buildIncidentSignal(
  event: SecurityEvent,
  dashboardBase: string
): IncidentResponseSignal {
  return {
    signal: "OBS_ANOMALY_TO_INCIDENT",
    source_skill: "Solana-observabilty-skill",
    severity_hint:
      event.severity === "P0" ? "critical" :
      event.severity === "P1" ? "high" : "medium",
    program_id: event.programId,
    wallet: event.wallet,
    transaction_signature: event.signature,
    alert_type: event.type,
    description: event.detail,
    promql_query: getPromQLForEvent(event.type),
    dashboard_link: `${dashboardBase}/d/solana-security`,
    timestamp_utc: new Date(event.timestamp * 1000).toISOString(),
  };
}

function getPromQLForEvent(type: SecurityEvent["type"]): string {
  const queries: Record<SecurityEvent["type"], string> = {
    AUTHORITY_CHANGE: 'increase(solana_authority_change_total[5m])',
    PROBE_PATTERN: 'solana_probe_pattern_score > 60',
    VAULT_DRAIN: 'solana_vault_drain_rate_lamports_per_sec',
    FLASH_LOAN_COOCCURRENCE: 'rate(solana_flash_loan_cooccurrence_total[5m])',
    WATCHLIST_HIT: 'increase(solana_watchlist_wallet_hit_total[5m])',
    SET_AUTHORITY: 'increase(solana_set_authority_instruction_total[5m])',
    ORACLE_DEVIATION: 'abs(solana_oracle_price_deviation_pct)',
    GOVERNANCE_ACCUMULATION: 'solana_governance_token_accumulation_pct',
  };
  return queries[type];
}
```

---

## Cross-Skill Boundary

| Direction | From | To | Trigger |
|---|---|---|---|
| Sends P0/P1 events | Observability | Incident Response | Any Tier 1 or Tier 2 signal |
| Receives monitoring rules | Incident Response | Observability | Post-incident hardening adds new detection |
| Feeds UX skill | Observability | UX | Wallet drain signals → safe-mode banner |
| Feeds Token Launch | Observability | Token Launch | Post-TGE supply anomaly detection |
