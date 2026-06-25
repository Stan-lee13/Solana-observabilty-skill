# Ecosystem Signals — Solana Observability Skill

This file defines the cross-skill collaboration protocol for a 5-skill Solana engineering ecosystem.

This repo: Solana-observabilty-skill (production monitoring, alerting, dashboards, health intelligence).

Other ecosystem skills:
- solana-depin-builder-skill
- solana-incident-response-skill
- solana-token-launch-skill
- solana-ux-skill

The goal is simple: convert operational signals into the correct next action, in the correct repo, with the minimum time-to-decision.

## Scope Boundaries (Hard Rules)

This skill owns:
- Detection: metrics, dashboards, SLO burn, anomaly discovery
- Diagnosis assist: correlation across RPC → program → indexer → frontend
- Operational automation: health-check, monitor-deploy, dashboard packs

This skill does not own:
- Exploit containment, key rotations, multisig emergency ops (incident-response-skill owns)
- Token distribution/legal/social coordination (token-launch-skill owns)
- Hardware fleet building and oracle architecture (depin-builder-skill owns)
- Wallet UX, claim flows, drain-prevention UI (ux-skill owns)

## When to Hand Off (Outbound Signals)

### Hand Off to solana-incident-response-skill

Trigger handoff when an anomaly crosses from “operational bug” into “potential security incident” or “funds at risk.”

Handoff conditions (any is sufficient):
- Unauthorized authority indicators:
  - Program upgrade authority mismatch
  - Mint authority re-enabled after being revoked
  - Freeze authority unexpectedly present
  - Admin/config instruction executed from unknown signer set
- Funds-at-risk indicators:
  - TVL drops beyond defined guardrails (absolute and %)
  - Vault balance deltas inconsistent with known fee/withdraw patterns
  - Abnormal outflow to new addresses from protocol-owned accounts
- Exploit-shaped behavioral changes:
  - New custom program error codes spike immediately after a config change
  - Success rate collapses only for one instruction that moves funds
  - “Sandwichable” or MEV-sensitive routes show sudden loss events
- “Silent failure” indicators:
  - Users submit tx but confirmations stall (dropped tx / blockhash expiry) while RPC health is nominal
  - Indexer and webhook ingestion remain normal but state changes diverge from expected invariants

What this skill must provide in the handoff packet:
- Severity recommendation (P0/P1/P2)
- Exact time window, cluster, program_id list
- Primary dashboard + panel names and the metric queries backing them
- Baseline vs current values (not just “it spiked”)
- Most suspicious transaction signatures (limited set) and top error buckets
- Whether the symptom is isolated to:
  - one RPC endpoint
  - one instruction
  - one client version
  - one geographic region (if available)

Recommended immediate actions to include:
- Run /obs health-check with the impacted cluster/program/rpc list
- Lock the Grafana time range to the incident start and enable annotations

### Hand Off to solana-ux-skill

Trigger handoff when the “incident” is primarily a user-facing failure mode, confusion loop, or wallet interaction breakdown.

Handoff conditions:
- Wallet UX failure spikes:
  - signature rejection rate jumps (user rejects / wallet popup not shown)
  - wallet adapter errors spike by category (Phantom/Backpack/Solflare)
- Transaction lifecycle confusion:
  - tx lands on-chain but frontend reports failure
  - confirmation latency increases and users spam retries
  - blockhash expiry increases due to slow signing or long instruction bundles
- Status communication gaps:
  - users cannot tell whether system is degraded
  - support channels flood because there is no status page / incident banner

What this skill must provide in the handoff packet:
- “User journey breakdown” metrics: connect → sign → send → confirm → post-confirm UI update
- Error taxonomy (grouped) and the top 3 user-visible messages
- Recommended UX mitigation:
  - better pending-state handling
  - signature + explorer link surfaced immediately
  - retry strategy that does not amplify congestion
  - degraded-mode banner/status component

## Signals Received From Other Skills (Inbound Contracts)

Inbound signals are treated as structured requests. This skill responds by generating monitoring assets: metrics contracts, alerts, and dashboards.

### From solana-incident-response-skill → “Post-Incident Monitoring Hardening”

Signal intent:
- The incident responder identified a concrete attack vector or failure mode that must become a monitored invariant.

Expected payload fields:
- incident_id
- attack_vector (one line)
- affected_components (program_id, backend service, oracle feed, UI surface)
- exploited_assumption (what we believed was safe)
- required_guardrail (what must never happen again)

This skill’s required response:
- Add at least one of:
  - new detection metric
  - new alert rule with thresholds
  - new dashboard panel with drilldowns
- Add an “Incident Regression Dashboard Row”:
  - a single row on the On-Call dashboard that visualizes the exact failure mode
- Add an annotation practice:
  - encode “incident_id” and “mitigation deploy” as annotations so future anomalies align to fixes

Concrete examples of hardening actions:
- Detect “authority drift” after a compromise attempt
- Track “vault outflow rate” as a first-class metric
- Alert on “new error code appearance” for critical instructions

### From solana-token-launch-skill → “TGE / Launch Day Monitoring Mode”

Signal intent:
- The protocol is entering a launch window where normal thresholds are insufficient and the team must operate a war room.

Expected payload fields:
- launch_name
- launch_time_window (start/end)
- token_mint (if applicable)
- key instructions (claim, swap, add_liquidity, stake, redeem)
- expected traffic multiplier

This skill’s required response:
- Generate a “Launch War Room” dashboard pack:
  - real-time tx feed (aggregated), success rate 1m/5m, confirmation p95, slot lag max
  - priority fee + Jito tip percentiles (p50/p95/p99)
  - RPC error rates and rate-limit utilization
- Tighten alert windows (temporary):
  - shorter evaluation windows for P0/P1 signals
  - explicit “launch-mode” label so alerts can be routed differently
- Provide a single “Launch Readiness Checklist” panel row:
  - fee payer balance, endpoint health, indexer/webhook lag, circuit breaker status

### From solana-depin-builder-skill → “New Node Fleet / Coverage Expansion”

Signal intent:
- A new DePIN node fleet is deployed or expanded; monitoring must exist before incentives go live.

Expected payload fields:
- fleet_id
- regions / coverage map resolution
- node attestation method (oracle, signature, zk, hardware attestation)
- reward epoch schedule

This skill’s required response:
- Add node-fleet dashboards:
  - node up/down counts by region
  - coverage ratio by region (geo aggregation, not per-node series)
  - oracle/reporting lag distribution
  - reward claim success rate and failure buckets
- Add “reward safety” alerts:
  - reward distribution halted
  - oracle feed gap or signature verification failure spikes
  - abnormal claim concentration (potential sybil)

## Alert Routing Table (Observability → Response Skill)

This skill classifies alerts using the repo’s severity model in [skill/alerting.md](file:///workspace/skill/alerting.md) and routes by impact.

| Severity | Definition in this ecosystem | Primary owner | Required action |
|---|---|---|---|
| P0 | Funds at risk, security boundary crossed, full protocol outage | incident-response-skill | Declare incident, contain, rotate keys/pauses as needed |
| P1 | Major user impact, sustained tx failure, critical infra down | incident-response-skill (with observability support) | Triage + mitigation, war room dashboards, comms |
| P2 | Degraded performance, early warning, partial feature impact | observability-skill | Mitigate operationally; escalate to incident-response if worsening |
| P3 | Non-urgent anomalies, advisory, capacity trend | observability-skill | Create ticket, improve dashboards/alerts, schedule follow-up |
| P4 | Informational analytics, growth, optimization | token-launch-skill or depin/ux as relevant | Feed product/launch decisions, no paging |

Escalation rule:
- If a P2 alert repeats for >30 minutes, or correlates with TVL/authority signals, reclassify to P1 and hand off to incident-response-skill.

## Shared Vocabulary (Use These Terms Consistently)

These terms must be used the same way across all 5 skills to prevent miscommunication during incidents.

- cluster: mainnet-beta or devnet (never ambiguous)
- slot: Solana block height unit; used for on-chain timelines
- epoch: Solana epoch; used for staking/reward accounting and revenue reporting
- commitment: processed / confirmed / finalized (always specify)
- program_id: on-chain program identifier (base58)
- instruction: named action within a program (swap, deposit, claim, etc.)
- authority: signer or PDA with control over program/token configuration
- mint authority / freeze authority: SPL token control roles (must be explicitly tracked)
- priority fee: compute unit price / additional fee paid to land transactions
- Jito tip: MEV tip paid via Jito infrastructure; treated as its own market signal
- TVL: total value locked; must state whether it is “on-chain only” or “priced”
- error budget: allowed failure over a window (SLO-based), not “a lot of errors”
- anomaly: deviation from baseline requiring investigation, not necessarily an incident

## Cross-Skill Query Templates (What to Ask Other Skills)

Use these prompts when handing off, so the receiving skill has a crisp starting point.

To incident-response-skill:
- “Investigate potential exploit: success rate dropped for instruction X only, TVL delta Y, authority events observed at time T. Provide containment actions and forensic checklist.”

To token-launch-skill:
- “We are entering launch mode for token mint M at time T. Provide TGE safety checklist and the exact ‘do not proceed unless’ gates.”

To depin-builder-skill:
- “Fleet F is live in regions R. Provide oracle integrity assumptions and the minimal monitoring invariants required before rewards start.”

To ux-skill:
- “Tx failures are not purely on-chain; users are stuck in pending/retry loops. Provide UX changes to reduce retries and clarify confirmation states with explorer links and degraded-mode banners.”

## Handoff Packet Format (Use This Every Time)

When sending a signal to another skill, include a packet that is copy/pasteable into an issue, incident channel, or PR description.

```
Signal Packet:
- sender_skill: solana-observability-skill
- receiver_skill: [target]
- severity: [P0/P1/P2/P3]
- cluster: [mainnet-beta/devnet]
- time_window_utc: [from → to]
- program_ids: [list]
- dashboards:
  - [dashboard name] → [key panels]
- primary_symptom:
  - metric: [name]
  - baseline: [value + window]
  - current: [value + window]
- correlated_signals:
  - rpc: [slot lag, error rate]
  - fees: [priority fee p95, Jito tip p95]
  - tvl/accounts: [delta]
  - ux (if available): [connect/sign/confirm rates]
- next_action_recommended:
  - [run /obs health-check]
  - [declare incident / comms / rollout]
```

