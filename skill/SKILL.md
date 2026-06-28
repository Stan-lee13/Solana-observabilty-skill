name: solana-observability
description: Production observability, monitoring, and health intelligence for Solana dApps.
Covers RPC health checks, on-chain metrics collection, transaction success-rate
monitoring, program upgrade tracking, structured logging, distributed tracing,
alerting, and Grafana dashboards. Cross-domain skill spanning DevOps, data
engineering, and Solana operations.
user-invocable: true

# Solana Observability Skill

Production observability, monitoring, and operational intelligence for Solana dApps. This skill turns operational blindness into complete visibility across the full stack — from RPC endpoint to on-chain program to user frontend.

## Extends

- [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill) — Core Solana development (programs, frontend, testing, security)
- [cloudflare-skills](https://github.com/cloudflare/skills) — Infrastructure (Workers, Agents SDK, edge observability)

## What This Skill Is For

Use this skill when the user asks for:

### Health Checks & Uptime Monitoring

- RPC endpoint health monitoring and failover
- Program account state validation
- Frontend dApp health checks
- On-chain service liveness probes
- Circuit breaker patterns for Solana connections

### Metrics Collection

- Transaction success rate and latency tracking
- Compute unit (CU) usage monitoring and optimization
- Account data size growth tracking
- PDA derivation and rent-exemption monitoring
- Fee market analysis and priority fee trends
- Token balance and TVL movement tracking

### Alerting & Incident Response

- On-call alerting for failed transactions or program errors
- Anomaly detection for unusual on-chain activity
- Program upgrade notifications and security alerts
- RPC degradation and rate-limit warnings
- Runbook-driven incident response for Solana ops

### Structured Logging & Tracing

- Correlating off-chain actions with on-chain transactions (signature tracing)
- Structured logging for Solana program instructions
- Distributed tracing across RPC → Program → Indexer → Frontend
- Error classification and retry tracking

### Dashboards & Visualization

- Grafana dashboards for Solana dApp metrics
- Real-time on-chain data visualization
- CU optimization heatmaps
- Wallet and program analytics panels
- Custom metric exporters and Prometheus integration

### Program Upgrade & Security Monitoring

- Monitoring program deployments and upgrades
- Detecting unauthorized authority changes
- Instruction discriminator drift detection
- IDL versioning and compatibility tracking
- Security event monitoring and forensics

## Default Stack Decisions (Opinionated)

1. **Metrics Collection**: Prometheus + OpenTelemetry
   - `@opentelemetry/api` + `@opentelemetry/sdk-node`
   - Custom Solana metrics exporters
   - Prometheus scrape endpoints

2. **Health Checks**: Custom probes + Helius status API
   - HTTP health check endpoints (Hono/Express)
   - On-chain account state validators
   - RPC latency and slot lag monitoring

3. **Alerting**: PagerDuty / Discord / Slack webhooks
   - Severity-based routing (P0/P1/P2)
   - Escalation policies for on-call
   - Runbook-linked alerts

4. **Dashboards**: Grafana + custom React components
   - Prometheus Grafana dashboards (JSON)
   - Real-time WebSocket-driven React widgets
   - `@solana/kit` for live on-chain data

5. **Logging**: structured-json → Loki / Datadog / Cloudflare Workers
   - Pino for Node.js (structured, fast)
   - Correlation IDs across request → transaction signature
   - Automatic Solana context enrichment

6. **Tracing**: OpenTelemetry + Jaeger / Tempo
   - Span propagation: HTTP request → RPC call → Transaction confirmation
   - Custom Solana semantic conventions

## Operating Procedure

### 1. Classify the Observability Layer

| Layer | Examples | Skill File(s) |
|---|---|---|
| RPC / Infrastructure | Endpoint health, slot lag, rate limits | [infrastructure-monitoring.md](infrastructure-monitoring.md) |
| On-Chain / Program | Transaction success, CU usage, account state | [program-monitoring.md](program-monitoring.md) |
| Application / Frontend | User actions, wallet errors, UX metrics | [application-observability.md](application-observability.md) |
| Alerting / Response | Alert rules, runbooks, incident mgmt | [alerting.md](alerting.md) |
| Logging / Tracing | Structured logs, trace correlation | [logging-tracing.md](logging-tracing.md) |
| Dashboards / Viz | Grafana, React components, metrics | [dashboards.md](dashboards.md) |
| CU Profiling / CI | Per-instruction CU budgets, regression gates | [program-profiling.md](program-profiling.md) |
| Security / Threat | Authority changes, probe patterns, drain detection | [security-observability.md](security-observability.md) |
| Synthetic / Canary | Probe transactions, health canaries, end-to-end | [synthetic-monitoring.md](synthetic-monitoring.md) |
| Cost Optimization | RPC credits, CU budgets, Helius billing | [cost-optimization.md](cost-optimization.md) |

### 2. Pick the Right Agent

| Task Type | Agent | Model |
|---|---|---|
| Architecture design | observability-architect | opus |
| Monitoring code | monitoring-engineer | sonnet |
| Alert configuration | sre-engineer | sonnet |
| Dashboard architecture and visualization review | visualization-engineer | sonnet |
| Grafana JSON, PromQL panel queries, React visualization artifacts | data-viz-engineer | sonnet |
| Incident response | incident-commander | opus |

### 3. Apply Layer-Specific Patterns

**RPC / Infrastructure:**

- Multi-endpoint health checks with weighted failover
- Slot lag and block time monitoring
- Request/response latency histograms
- Rate limit and quota tracking per endpoint

**On-Chain / Program:**

- Instruction-level CU metering and per-instruction success rates
- Account data change tracking (pre/post state diff)
- PDA space utilization alerts (approaching rent-exemption limits)
- Transaction signature confirmation time distributions

**Application / Frontend:**

- Wallet adapter error classification and rates
- Transaction signing to confirmation latency
- User journey funnel: connect → sign → confirm → notify
- Client-side retry and timeout pattern effectiveness

### 4. Correlate Across Layers

Always connect signals across layers:

- Frontend error spike → RPC degradation? → Slot lag increase? → Network issue?
- Transaction failure increase → Program upgrade? → IDL change? → Breaking change?
- CU usage spike → New instruction pattern? → Account bloat? → Cost increase?

Use correlation IDs:

```
Request ID (frontend) → RPC Call ID → Transaction Signature → Confirmed Block → Indexer Event
```

## Reference Index

### Infrastructure Monitoring

- [infrastructure-monitoring.md](infrastructure-monitoring.md) — RPC health, slot tracking,
  rate limits, endpoint failover

### Program Monitoring

- [program-monitoring.md](program-monitoring.md) — CU metering, account state tracking,
  instruction success rates, program upgrade detection

### Application Observability

- [application-observability.md](application-observability.md) — Frontend error tracking,
  wallet UX metrics, user journey funnels, client-side monitoring

### Alerting & Incident Response

- [alerting.md](alerting.md) — Alert rules, severity routing, runbooks,
  PagerDuty/Discord/Slack integration, escalation policies

### Logging & Tracing

- [logging-tracing.md](logging-tracing.md) — Structured logging, trace correlation,
  OpenTelemetry setup, Solana semantic conventions

### Dashboards & Visualization

- [dashboards.md](dashboards.md) — Grafana JSON dashboards, React real-time components, Prometheus queries, CU optimization heatmaps

### Program CU Profiling

- [program-profiling.md](program-profiling.md) — Per-instruction CU budgets, regression gates, production CU forensics

### Security Observability

- [security-observability.md](security-observability.md) — Security-specific metrics (authority changes, probe patterns, vault drain rate, oracle deviation, watchlist hits). Feeds to `solana-incident-response-skill` via `ecosystem-signals.md`.

### Synthetic Monitoring

- [synthetic-monitoring.md](synthetic-monitoring.md) — Canary transactions, continuous health probes (RPC, instruction, fee payer, indexer, Blinks), Cloudflare Worker scheduler, synthetic Prometheus metrics.

### Cost Optimization

- [cost-optimization.md](cost-optimization.md) — RPC credit reduction (webhooks vs polling), response payload optimization, CU budget strategies, Helius credit monitoring, cost regression tests.

### Resources

- [resources.md](resources.md) — Curated tools, libraries, services, and reference links for Solana observability

## Anti-Patterns (What NOT To Do)

- **Don't poll RPC in tight loops** — Use webhooks, gRPC streams, or websockets. Respect rate limits.
- **Don't log private keys or signatures unsafely** — Signatures are public but treat them as PII-equivalent in logs. Never log keypairs.
- **Don't alert on every RPC error** — Use percentage-based thresholds and windowed calculations. Solana has transient errors.
- **Don't monitor from a single RPC** — Always use multiple endpoints for health checks to avoid false positives.
- **Don't forget client-side observability** — Server-side metrics miss half the story. Track wallet connection and signing UX.
- **Don't use unstructured `console.log` in Node.js services** — Use structured logging with correlation IDs. Workers may emit structured JSON to console because Logpush captures it.
- **Don't ignore CU limits** — Monitor CU usage trends. Programs that grow in complexity silently hit limits.

## Quick Start

### 1-Minute Setup

```bash
# Install the skill
npx skills add https://github.com/Stan-lee13/Solana-observabilty-skill

# Or manual install
git clone https://github.com/Stan-lee13/Solana-observabilty-skill.git
./install.sh
```

### Ask Claude

```
"Set up health checks for my Solana dApp's RPC endpoints"
"Create a Grafana dashboard showing transaction success rates and CU usage"
"Build an alerting system that notifies me when my program's transactions fail > 5%"
"Add structured logging with transaction signature correlation to my backend"
"Monitor my program for unauthorized upgrades or authority changes"
"Create a runbook for when my dApp's transactions start failing"
"Set up distributed tracing from my frontend through RPC to on-chain confirmation"
```

## Ecosystem Integration Points

| Service | Integration | Skill Reference |
|---|---|---|
| Helius | Webhooks, enhanced RPC, status API | [infrastructure-monitoring.md](infrastructure-monitoring.md) |
| Jupiter | Swap success rate monitoring, price impact tracking | [program-monitoring.md](program-monitoring.md) |
| QuickNode | Yellowstone gRPC, usage metrics, alerts | [infrastructure-monitoring.md](infrastructure-monitoring.md) |
| Alchemy | Supernode metrics, webhook delivery tracking | [infrastructure-monitoring.md](infrastructure-monitoring.md) |
| PagerDuty | On-call alerting, incident management | [alerting.md](alerting.md) |
| Grafana Cloud | Hosted dashboards, alert evaluation | [dashboards.md](dashboards.md) |
| Datadog | APM, infrastructure monitoring, log management | [logging-tracing.md](logging-tracing.md) |
| Sentry | Error tracking, performance monitoring | [application-observability.md](application-observability.md) |
| Discord/Slack | Alert notifications, bot commands | [alerting.md](alerting.md) |
| Cloudflare Workers | Edge observability, log aggregation | [logging-tracing.md](logging-tracing.md) |

## Progressive Loading Notes

This skill uses progressive disclosure:

- **SKILL.md** (this file) — Overview, routing table, stack decisions
- **Layer files** — Loaded only when relevant layer is discussed
- **Resource file** — Loaded only when external tools/services are referenced

Agents reference these files rather than duplicating content. Cross-layer correlation guidance stays in this hub file.

