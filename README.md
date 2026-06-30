<div align="center">

<img src="https://img.shields.io/badge/Solana-Observability_Skill-14F195?style=for-the-badge&logo=solana&logoColor=black" alt="Solana Observability Skill"/>

**See everything. Know before your users do.**

*Infrastructure monitoring · Program metrics · Alerting pipelines · Distributed tracing · Security observability · Cost optimization · Synthetic monitoring*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker)](deploy/docker-compose.yml)
[![Grafana](https://img.shields.io/badge/Grafana-4_dashboards-F46800?style=flat-square&logo=grafana)](deploy/grafana/dashboards/)
[![Skills](https://img.shields.io/badge/Skill_files-13-14F195?style=flat-square)](skill/)
[![Agents](https://img.shields.io/badge/Agents-6-orange?style=flat-square)](agents/)
[![Runbooks](https://img.shields.io/badge/Runbooks-7-red?style=flat-square)](runbooks/)

</div>

---

## What This Skill Does

Turns a blind Solana protocol into a fully observable system in under 5 minutes. Ships with a complete Docker Compose stack — Prometheus, Grafana, Alertmanager, and a custom Solana exporter — that works out of the box with zero configuration.

| Layer | What you get |
|---|---|
| **Infrastructure** | Validator health, RPC latency (p50/p99), slot lag, crank uptime, multi-region failover |
| **Program metrics** | Instruction success rates, account state changes, CU consumption, fee trends |
| **Alerting** | 15 pre-built Solana alert rules → PagerDuty / Slack / Opsgenie in < 60s |
| **Distributed tracing** | OpenTelemetry + Jaeger/Tempo, correlation IDs across RPC → program → frontend |
| **Security observability** | Wallet drain early warning, MEV detection, unauthorized upgrade alerts |
| **Synthetic monitoring** | Canary transactions, SLA verification via scheduled on-chain probes |
| **Cost optimization** | CU reduction patterns, RPC credit analysis, Helius webhook cost modeling |

---

## 60-Second Deploy

```bash
# 1. Install the skill
bash <(curl -fsSL https://raw.githubusercontent.com/Stan-lee13/Solana-observabilty-skill/main/install.sh)

# 2. Spin up the full monitoring stack
cd .claude/skills/solana-observability-skill
cp deploy/.env.example deploy/.env   # fill in your HELIUS_API_KEY
docker compose -f deploy/docker-compose.yml up -d

# 3. Open dashboards
open http://localhost:3000   # Grafana — admin / solana-obs
```

**That's it. You now have:**
- Live Solana infrastructure dashboard
- 15 pre-wired alert rules
- Custom on-chain exporter scraping your program
- Alertmanager routing to your PagerDuty/Slack

---

## Pre-Built Stack (Zero Configuration)

```
deploy/
  docker-compose.yml          ← One command. Full stack.
  prometheus.yml              ← Scrapes Solana exporter + your app metrics
  alertmanager.yml            ← Routes to PagerDuty / Slack
  alerts.yml                  ← 15 battle-tested Solana alert rules
  .env.example                ← Copy → .env, add HELIUS_API_KEY
  solana-exporter/
    index.ts                  ← Custom Prometheus exporter (RPC + on-chain)
    test/exporter.test.ts     ← Unit tests — npx vitest run
    Dockerfile
  grafana/
    dashboards/
      solana-infrastructure.json      ← Import directly — zero setup
      solana-program-monitoring.json
      solana-security.json
      solana-ux-observability.json
    provisioning/             ← Auto-provisioned on first start
```

**The 15 pre-built alert rules cover:**

| Alert | Threshold | Severity |
|---|---|---|
| Transaction success rate | < 95% for 5 min | P1 |
| RPC p99 latency | > 2000ms sustained | P1 |
| Slot lag | > 100 slots behind cluster | P1 |
| Wallet drain pattern | > $500K unexpected outbound | P0 |
| Crank not firing | > 2 missed slots | P2 |
| Alert pipeline silent | > 10 min (self-monitoring) | P1 |
| Helius queue depth | > 1000 unprocessed | P2 |
| Container restart loop | > 3 restarts / 10 min | P2 |

---

## Skill Map (13 Files, Progressive Loading)

```
solana-observability-skill/
│
├── SKILL.md                          ← Routing table — start here
├── CLAUDE.md                         ← Behavior rules + stack defaults
│
├── skill/
│   ├── infrastructure-monitoring.md  ← Validators, RPCs, cranks, multi-region
│   ├── program-monitoring.md         ← Instruction metrics, account state, CU
│   ├── alerting.md                   ← PagerDuty/Opsgenie, routing, tiers
│   ├── dashboards.md                 ← Grafana panel design, importing exports
│   ├── logging-tracing.md            ← OpenTelemetry, Jaeger, structured logging
│   ├── application-observability.md  ← SDK instrumentation, frontend errors
│   ├── security-observability.md     ← Drain detection, MEV, upgrade anomalies  ★
│   ├── synthetic-monitoring.md       ← Canary txs, SLA probes, health checks
│   ├── cost-optimization.md          ← CU optimization, RPC credit reduction
│   ├── program-profiling.md          ← CU budget analysis, Mollusk profiling
│   ├── wallet-observability.md       ← Address monitoring, balance thresholds   ★
│   ├── resources.md                  ← Tool comparison, pricing, SDK matrix
│   └── SKILL.md                      ← Sub-skill routing table
│
├── agents/
│   ├── observability-architect.md    ← System design, SLO definition, stack choice
│   ├── monitoring-engineer.md        ← Alert rules, scrape config, dashboards
│   ├── sre-engineer.md               ← On-call runbooks, incident integration
│   ├── data-viz-engineer.md          ← Grafana panels, metric selection
│   ├── visualization-engineer.md     ← Deep chart engineering, accessibility
│   └── incident-commander.md         ← Cross-skill: feeds into IR skill
│
├── commands/
│   ├── health-check.md               ← /health-check: full stack health report
│   ├── monitor-deploy.md             ← /monitor-deploy: deploy monitoring stack
│   ├── alert-setup.md                ← /alert-setup: configure alerting pipeline
│   ├── dashboard.md                  ← /dashboard: generate custom Grafana panels
│   ├── trace.md                      ← /trace: distributed trace analysis
│   ├── cu-optimize.md                ← /cu-optimize: CU budget reduction
│   └── incident.md                   ← /incident: trigger IR skill handoff
│
├── runbooks/                         ← 7 operational playbooks
│   ├── rpc-degradation.md
│   ├── transaction-success-rate-low.md
│   ├── wallet-drain-detected.md      ← Cross-wires to incident-response-skill
│   ├── wallet-error-spike.md
│   ├── fee-payer-low.md
│   ├── indexer-lag.md
│   └── program-upgrade-detected.md
│
└── deploy/                           ← Full Docker stack — ships working
    ├── docker-compose.yml
    ├── prometheus.yml
    ├── alertmanager.yml
    ├── alerts.yml
    ├── .env.example
    ├── solana-exporter/              ← Custom TypeScript Prometheus exporter
    └── grafana/                      ← 4 dashboard exports + auto-provisioning

★ = not found in any other observability submission in this bounty
```

---

## Five Things No Other Observability Submission Has

**1. Custom Solana Prometheus exporter** (`deploy/solana-exporter/index.ts`)
A TypeScript exporter that scrapes RPC endpoints for slot lag, transaction confirmation rates, and account state changes — then exposes them as Prometheus metrics. Ships with a Dockerfile and full unit test suite (`npx vitest run`). Import → run → metrics in 60 seconds.

**2. Four Grafana dashboards pre-built and pre-wired** (`deploy/grafana/dashboards/`)
`solana-infrastructure.json`, `solana-program-monitoring.json`, `solana-security.json`, `solana-ux-observability.json` — all four import directly into any Grafana instance with zero panel configuration. The provisioning directory auto-loads them on first `docker compose up`.

**3. Security observability layer** (`skill/security-observability.md`)
Detects wallet drain patterns (unusual outbound volume), MEV extraction signatures, unauthorized program upgrade events, and oracle manipulation signals — before they show up in your Discord. Most skills treat observability as latency + uptime. This one treats it as defense.

**4. Wallet-specific observability** (`skill/wallet-observability.md`)
Address-level monitoring for fee payer wallets, treasury accounts, and high-value user wallets. Threshold alerts on balance changes. Transaction pattern analysis per address. Feeds directly into the Incident Response skill's `WALLET_DRAIN_DETECTED` signal.

**5. Cross-skill signal routing** (`ecosystem-signals.md`)
Eight canonical signals that route automatically into Incident Response (`WALLET_DRAIN_DETECTED` → P0 incident), Token Launch (`TGE_PRICE_SHOCK`), and DePIN (`DEPIN_NODE_LOSS`). Your monitoring infrastructure doesn't just alert you — it activates the right response skill automatically.

---

## SLO Reference

| Signal | Target | Window |
|---|---|---|
| Transaction success rate | ≥ 99.5% | 5-min rolling |
| RPC p50 latency | < 200 ms | 1-hour rolling |
| RPC p99 latency | < 1000 ms | 1-hour rolling |
| Alert delivery | < 60 s end-to-end | Per alert |
| Slot lag | < 50 slots | 1-min rolling |
| Dashboard load | < 3 s | Per page load |

---

## Cross-Skill Integration

```
solana-observability-skill  ←── YOU ARE HERE
        │
        ├──→  solana-incident-response-skill  (WALLET_DRAIN_DETECTED → P0)
        ├──→  solana-depin-builder-skill      (DEPIN_NODE_LOSS → operator alert)
        └──→  solana-token-launch-skill       (TGE_PRICE_SHOCK → post-launch monitoring)
```

---

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Stan-lee13/Solana-observabilty-skill/main/install.sh)
```

---

<div align="center">

MIT License · Built for the [Superteam Earn Solana AI Kit Bounty](https://earn.superteam.fun)

*68 files · 511KB · 13 skill docs · 6 agents · 7 commands · 7 runbooks · Full Docker stack*

</div>
