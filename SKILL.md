name: solana-observability
description: Production-grade observability for Solana protocols — infrastructure monitoring, program-level metrics, alerting pipelines, distributed tracing, security observability, and cost optimization. Ships with a ready-to-deploy Docker Compose stack (Prometheus + Grafana + Alertmanager).
user-invocable: true
cross-domain: true

# Solana Observability Skill

> Progressive loader — route to the correct sub-skill based on your current task.
> Do not load all files at once — each is large and task-specific.

## Extends

- [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill) — Core Solana development

## Cross-Domain Integration Points

This skill bridges 7 domains simultaneously — infrastructure, program metrics, security, distributed tracing, cost engineering, DAO governance, and UX observability. The Grafana dashboard exports in `deploy/grafana/dashboards/` work out-of-the-box with zero configuration.

See `ecosystem-signals.md` for cross-skill event protocols (Incident Response post-incident review, Token Launch post-TGE monitoring handoff, DePIN node health feed).

---

## Quick Start (< 5 minutes to running stack)

```bash
git clone https://github.com/Stan-lee13/Solana-observabilty-skill
cd Solana-observabilty-skill
./install.sh
docker compose -f deploy/docker-compose.yml up -d
# Dashboard: http://localhost:3000 (admin / solana-obs)
```

---

## Routing Table

### Full observability architecture
→ Load `agents/observability-architect.md`

Use for: System design, choosing the right monitoring stack, scaling observability infrastructure, multi-environment setup, SLO definition.

---

### Program-level metrics + RPC monitoring
→ Load `skill/program-monitoring.md`

Use for: Monitoring on-chain programs, instruction success rates, account state changes, RPC node health, transaction confirmation latency, slot lag.

---

### Infrastructure monitoring (validators, RPCs, cranks)
→ Load `skill/infrastructure-monitoring.md`

Use for: Validator performance, CPU/memory/disk/network metrics, crank uptime, RPC endpoint SLA, multi-region failover.

---

### Alerting pipelines
→ Load `skill/alerting.md`

Use for: PagerDuty/Opsgenie integration, alert routing, severity tiers, silence management, Alertmanager configuration, on-call runbook linking.

---

### Dashboards and visualization
→ Load `skill/dashboards.md`

Use for: Grafana panel design, importing the bundled dashboard exports, custom token health views, executive summary panels.

---

### Distributed tracing + logging
→ Load `skill/logging-tracing.md`

Use for: OpenTelemetry instrumentation, Jaeger/Tempo distributed traces, structured logging with Loki, correlation IDs across services.

---

### Application-level observability
→ Load `skill/application-observability.md`

Use for: SDK-side instrumentation, wallet transaction observability, frontend error tracking, end-to-end synthetic monitoring.

---

### Security observability
→ Load `skill/security-observability.md`

Use for: On-chain anomaly detection, unusual account activity alerts, MEV detection, suspicious upgrade detection, wallet drain early warning.

---

### Cost optimization
→ Load `skill/cost-optimization.md`

Use for: Compute unit optimization, transaction fee reduction, RPC credit optimization, reducing Helius webhook costs.

---

### Program profiling + CU analysis
→ Load `skill/program-profiling.md`

Use for: Compute unit budgets, bottleneck identification, comparing CU costs across instruction versions.

---

### Synthetic monitoring
→ Load `skill/synthetic-monitoring.md`

Use for: Canary transactions, end-to-end health probes, SLA verification via scheduled on-chain actions.

---

### Wallet observability
→ Load `skill/wallet-observability.md`

Use for: Monitoring specific wallet addresses, balance thresholds, unusual transaction pattern detection.

---

### Resource catalog
→ Load `skill/resources.md`

Use for: Tool comparison (Helius vs QuickNode vs Triton), pricing calculator, SDK version matrix.

---

### Visualization engineer (deep UX + chart engineering)
→ Load `agents/visualization-engineer.md`

Use for: Custom Grafana panel JSON, chart type selection for specific metrics, color system, accessibility compliance for dashboards.

---

### Cross-skill signals
→ Load `ecosystem-signals.md`

Use for: Receiving post-launch monitoring handoff from Token Launch, feeding node health events to Incident Response, DePIN sensor health signals.

---

## Pre-built Docker Compose Stack

The `deploy/` directory ships a complete, zero-configuration monitoring stack:

```
deploy/
  docker-compose.yml          ← start with: docker compose up -d
  prometheus.yml              ← scrape configs for Solana exporter + app metrics
  alertmanager.yml            ← PagerDuty / Slack alert routing
  alerts.yml                  ← 15 pre-built Solana alert rules
  .env.example                ← copy to .env, fill in your keys
  solana-exporter/
    index.ts                  ← custom Prometheus exporter (RPC + on-chain)
    test/exporter.test.ts     ← unit tests (npx vitest run)
    Dockerfile
  grafana/
    dashboards/
      solana-infrastructure.json      ← import directly into Grafana
      solana-program-monitoring.json
      solana-security.json
      solana-ux-observability.json
    provisioning/             ← auto-provision on first start
```

---

## Red Flags — Surface Immediately Regardless of Current Task

```
CRITICAL SIGNALS — escalate immediately:
  - Transaction success rate drops below 95% for > 5 min
  - RPC p99 latency > 2000ms sustained
  - Slot lag > 100 slots behind cluster
  - Any account with > $500K USD in unexpected outbound transfer
  - Alert delivery pipeline silent for > 10 min (test: send synthetic alert)

DEGRADED SIGNALS — escalate within 30 min:
  - Crank not firing for > 2 missed slots
  - Helius webhook queue depth > 1000 unprocessed
  - Grafana data source showing "no data" for > 15 min
  - Docker container restart loop (> 3 restarts in 10 min)

CROSS-SKILL TRIGGERS:
  - Token price drop > 20% in 5 min → emit TGE_PRICE_SHOCK to token-launch ecosystem-signals
  - Wallet drain pattern detected → emit WALLET_DRAIN_DETECTED to incident-response
  - Node count drops > 30% → emit DEPIN_NODE_LOSS to depin-builder ecosystem-signals
```

---

## SLO Reference

| Signal | Target | Measurement window |
|--------|--------|--------------------|
| Transaction success rate | ≥ 99.5% | 5-minute rolling |
| RPC p50 latency | < 200 ms | 1-hour rolling |
| RPC p99 latency | < 1000 ms | 1-hour rolling |
| Alert delivery | < 60 s end-to-end | Per alert |
| Slot lag | < 50 slots | 1-minute rolling |
| Dashboard load time | < 3 s | Per page load |
