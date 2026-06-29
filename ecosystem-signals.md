# Ecosystem Signals: Solana Observability Skill

This file defines how `Solana-observabilty-skill` collaborates with the other
four Solana engineering skills.

Observability owns production telemetry: metrics, dashboards, alerts, health
checks, traces, logs, SLO burn rates, and anomaly detection.

It detects production signals early and hands remediation to the right specialist.

---

## Skill Boundary

Use this skill when the question is:

- Are users successfully transacting?
- Is RPC healthy across clusters and endpoints?
- Is slot lag, indexer lag, or webhook lag increasing?
- Are program errors, CU usage, or confirmation latency changing?
- Are launch, DePIN, or UX systems observable?

Do not use this skill for exploit command, tokenomics, DePIN architecture, or UX
copy. Use it to detect and route signals.

---

## Handoff to `solana-incident-response-skill`

Hand off when an anomaly exceeds threshold and becomes P0/P1.

### P0 conditions

- User funds at risk or unexplained vault outflow.
- Transaction failure rate >10% for 5 minutes on a critical instruction.
- Upgrade, mint, freeze, or oracle authority changes unexpectedly.
- Oracle deviation >5% and the program consumes that price.
- DePIN proof verification accepts impossible geography or duplicated hardware.
- Frontend telemetry suggests wallet-drain injection.

### P1 conditions

- Transaction failure rate 2-10% for 10 minutes.
- RPC slot lag >50 slots and failover is not working.
- Indexer lag >5 minutes for user-facing balances or claims.
- Priority fee p95 spikes while success rate drops below SLO.
- TGE claim success rate falls below 98% during launch.

### Signal

```text
signal: OBS_ANOMALY_ESCALATED
severity: P0 | P1
cluster: mainnet-beta | devnet
program_id: <program id>
first_seen_slot: <slot>
metric: <metric name>
observed: <value>
threshold: <threshold>
blast_radius: funds | users | rpc | indexer | frontend | depin_nodes
evidence: dashboard_url, panel_url, log_query, sample_signatures
requested_action: run incident-triage
```

Always include dashboard URL, UTC time range, top contributing instruction or
endpoint, recent deploy/TGE annotations, and whether users are impacted.

---

## Handoff to `solana-ux-skill`

Hand off when telemetry shows users need clearer state, safer signing, or a
public health surface.

### Conditions

- Building user-facing status page or health dashboard.
- Transaction failure spike needs better error states or retry copy.
- Confirmation latency p95 >30s and users abandon the flow.
- Wallet adapter errors spike for Phantom, Backpack, Solflare, or mobile.
- Claim, swap, stake, or node onboarding funnel drops at signing.
- Maintenance, congestion, or degraded RPC needs an in-product banner.

### Signal

```text
signal: OBS_UX_HEALTH_SIGNAL
symptom: transaction_failure_spike | slow_confirmation | wallet_error | degraded_status
affected_flow: claim | swap | stake | bridge | node_onboarding | dashboard
user_impact: low | medium | high
metric_window: 5m | 15m | 1h | 24h
recommended_ux: banner | retry_state | status_page | error_copy | fallback_rpc_notice
```

Key query: is retry safe, unsafe, or unknown?

---

## Signals Received from `solana-incident-response-skill`

### `INC_POST_INCIDENT_MONITORING`

Meaning: a post-mortem found a missed signal or new attack vector.

Actions:

- Add a metric, log query, or trace for the exact exploit path.
- Add P0/P1 alert rules with owner and runbook link.
- Add Grafana annotation for start, mitigation, and resolution.
- Add a recurrence-risk dashboard panel.
- Load `skill/alerting.md`, `skill/logging-tracing.md`, or `skill/dashboards.md`.

### `INC_MONITOR_EXPLOIT_RECURRENCE`

Actions:

- Enable temporary heightened alerting on affected programs and PDAs.
- Track suspicious instruction sequences without wallet labels.
- Expire temporary monitors only after incident commander approval.

---

## Signals Received from `solana-token-launch-skill`

### `TOKEN_TGE_DAY_HEIGHTENED_MONITORING`

Actions:

- Switch launch dashboards to 5s-15s refresh.
- Monitor mint, freeze, metadata, pool, and upgrade authorities.
- Add claim success, priority fee p95, Jito tips, liquidity, and webhook lag.
- Route P0/P1 alerts to incident response and launch operators.
- Keep public dashboards separate from internal authority dashboards.

### `TOKEN_POST_LAUNCH_BASELINE`

Actions:

- Convert temporary launch panels into 24h/7d/30d baselines.
- Reduce heightened sensitivity only after no active P0/P1 alerts.

---

## Signals Received from `solana-depin-builder-skill`

### `DEPIN_NODE_FLEET_DEPLOYED`

Actions:

- Add node uptime, heartbeat freshness, proof success, and reward dashboards.
- Add H3 coverage maps if location data is safe to visualize.
- Monitor oracle freshness and proof verification error rates.
- Alert on silent cohorts, duplicated proofs, and impossible travel.

### `DEPIN_COVERAGE_MODEL_CHANGED`

Actions:

- Update dashboard definitions and alert thresholds.
- Add deploy annotation for the scoring change.
- Re-baseline anomaly detection.

---

## Alert Routing Table

| Alert | Severity | Route To | Action |
|---|---:|---|---|
| Funds at risk or vault drain | P0 | incident-response | Run incident triage |
| Authority compromise | P0 | incident-response | Freeze, revoke, or rotate decision |
| TX failure >10% critical flow | P0 | incident-response + ux | Triage and warn users |
| TX failure 2-10% for 10m | P1 | incident-response | Classify and mitigate |
| RPC slot lag >50 slots | P1 | incident-response | Failover or escalate provider |
| Indexer lag >5m on balances | P1 | incident-response + ux | Incident plus stale-data UX |
| TGE claim success <98% | P1 | token-launch + incident-response | Launch war room |
| DePIN node cohort silent >1 epoch | P2 | depin-builder | Load coverage verification |
| Wallet adapter error spike | P2 | ux | Audit error-state UX |
| Dashboard missing SLO | P3 | observability | Add panel and alert |

---

## Cross-Skill Queries

```text
/query incident-response classify --program <PROGRAM_ID> --metric <METRIC> --severity <P0|P1>
/query ux design-error-state --flow <FLOW> --error-class <ERROR> --retry-safe <yes|no|unknown>
/query token-launch launch-monitoring --mint <MINT> --pool <POOL> --phase <pre-tge|tge|post-tge>
/query depin node-anomaly --cohort <COHORT> --proof-type <PROOF> --epoch <EPOCH>
```

---

## Shared Vocabulary

- **Epoch**: Solana epoch or protocol reward/accounting period.
- **Proof**: Cryptographic or telemetry evidence submitted by a DePIN node.
- **Stake**: Locked economic weight for rewards, security, or governance.
- **Oracle**: External feed such as Pyth, Switchboard, or custom DePIN oracle.
- **Node**: Physical DePIN node, RPC endpoint, validator, or indexer worker.
- **Commitment**: Solana finality level: `processed`, `confirmed`, `finalized`.
- **Slot lag**: Difference between observed slot and trusted network tip.
- **Indexer lag**: Delay from finalized chain state to queryable app state.
- **TGE**: Token generation event: mint, claim, listing, and liquidity setup.
- **Error budget**: Allowed failure budget for an SLO window.

---

## Wallet-Specific Signals (Added v2 — Wallet Engineering Framework)

These signals extend the base ecosystem signals for the full wallet development lifecycle.
All five skills must handle these signals. See `wallet-framework.md` for complete routing.

### WALLET_KEY_COMPROMISED (P0 — Highest Priority)

```typescript
// Fire: Incident Response skill (when key compromise confirmed or suspected)
// Receive: ALL skills
export interface WalletKeyCompromisedSignal {
  signal: "WALLET_KEY_COMPROMISED";
  severity: "P0";
  key_type: "user_wallet" | "fee_payer" | "upgrade_authority" | "mint_authority" | "treasury";
  compromised_address: string;
  confirmed: boolean;
  detected_at_utc: string;
}
// → Load: skill/active-exploit-response.md immediately
// → Load: skill/wallet-security.md → Emergency Key Rotation Checklist
// → Notify all team members within 2 minutes
```

### WALLET_DRAINER_ACTIVE (P1)

```typescript
// Fire: UX skill (intent analyzer blocked a drainer transaction)
// Receive: Incident Response, Observability
export interface WalletDrainerActiveSignal {
  signal: "WALLET_DRAINER_ACTIVE";
  severity: "P1";
  drainer_pattern: "set_authority" | "delegate_approve" | "versioned_alt" | "unknown";
  blocks_in_window: number;
  window_minutes: number;
}
// → Load: skill/wallet-security.md → Drainer Contract Deep Analysis
// → Consider frontend takedown if blocks_in_window > 50
```

### WALLET_FEE_PAYER_CRITICAL (P1)

```typescript
// Fire: Observability skill
// Receive: UX skill (degrade gasless), DePIN (pause proof submission)
export interface WalletFeePayerCriticalSignal {
  signal: "WALLET_FEE_PAYER_CRITICAL";
  severity: "P1";
  alias: string;
  current_balance_sol: number;
  runway_hours: number;
}
// → Load: runbooks/fee-payer-low.md
// → UX: activate graceful degradation (disable gasless, show "pay own gas" flow)
```

### WALLET_ADDRESS_POISONING_DETECTED (P2)

```typescript
// Fire: UX skill
// Receive: Incident Response (comms), Observability (tracking)
export interface WalletAddressPoisoningSignal {
  signal: "WALLET_ADDRESS_POISONING_DETECTED";
  severity: "P2";
  similar_to_address: string;  // The legitimate address being mimicked
  attack_count: number;        // Number of poisoning txs seen
}
// → Load: skill/wallet-security.md → Address Poisoning Response Protocol
// → Post user warning on all official channels
```

### WALLET_SIGNING_LATENCY_HIGH (P2)

```typescript
// Fire: Observability skill
// Receive: UX skill, Performance optimization
export interface WalletSigningLatencySignal {
  signal: "WALLET_SIGNING_LATENCY_HIGH";
  severity: "P2";
  p95_latency_ms: number;
  slo_target_ms: number;
}
// → Load: skill/performance-optimization.md → RPC endpoint failover
// → Check: is latency from RPC or from wallet popup rendering?
```
