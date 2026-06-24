<p align="center">
  <strong>solana-observability-skill</strong><br/>
  Production monitoring, alerting, and operational intelligence for Solana dApps
</p>

[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Solana AI Kit](https://img.shields.io/badge/Solana%20AI%20Kit-compatible-green)](https://github.com/solanabr/solana-ai-kit)

---

# solana-observability-skill

Production observability for Solana dApps — from RPC health checks to SLO burn rate alerting. This skill turns operational blindness into complete, correlated visibility across the full stack.

**The problem it solves:** Every Solana protocol eventually faces the same questions at 3am — "Why are my transactions failing?" "Is my RPC down or is my program broken?" "How do I know before my users do?" This skill provides production-grade answers with deployable infrastructure you can spin up immediately.

---

## 60-Second Deploy

```bash
# Install the skill
curl -sSL https://raw.githubusercontent.com/Stan-lee13/Solana-observabilty-skill/main/install.sh | bash

# Spin up monitoring stack (Prometheus + Grafana + custom Solana exporter)
cd .claude/skills/solana-observability/deploy
docker compose up -d

# Grafana at http://localhost:3000 (admin / solana-obs)
# Prometheus at http://localhost:9090
# Solana metrics at http://localhost:3001/metrics
```

---

## What's Included

```
solana-observability-skill/
├── SKILL.md                              # Progressive loader — routing hub
├── README.md                             # This file
├── CLAUDE.md                             # Claude Code configuration
├── install.sh                            # One-command installer
├── LICENSE                               # MIT
│
├── skill/
│   ├── SKILL.md                          # Sub-skill routing table
│   ├── infrastructure-monitoring.md      # RPC health, slot lag, endpoint failover (494 lines)
│   ├── program-monitoring.md             # CU tracking, TX success, upgrade detection (718 lines)
│   ├── application-observability.md      # Wallet errors, UX funnels, client metrics (776 lines)
│   ├── alerting.md                       # SLO burn rates, severity routing, runbooks (617 lines)
│   ├── logging-tracing.md                # OpenTelemetry, Pino, trace correlation (490 lines)
│   ├── dashboards.md                     # Grafana JSON, React real-time components (697 lines)
│   ├── program-profiling.md              # Per-instruction CU analysis, CI regression gates (386 lines)
│   └── resources.md                      # Curated tools, SDKs, reference links
│
├── agents/
│   ├── observability-architect.md        # Stack selection, SLO design, correlation strategy
│   ├── monitoring-engineer.md            # Writes all monitoring code: exporters, health checks
│   ├── sre-engineer.md                   # Alert rules, runbooks, SLO burn rate management
│   ├── data-viz-engineer.md              # Grafana dashboards, React real-time components
│   └── incident-commander.md             # Production debugging, root cause analysis
│
├── commands/
│   ├── health-check.md                   # /obs health-check — comprehensive health audit
│   └── monitor-deploy.md                 # /obs monitor-deploy — deploy monitoring stack
│
├── rules/
│   └── monitoring-rules.md               # Auto-loading safety rules
│
└── deploy/                               # ← Deployable monitoring stack
    ├── docker-compose.yml                # Prometheus + Grafana + Solana exporter
    ├── prometheus.yml                    # Scrape config + alert rules
    ├── solana-exporter/
    │   ├── index.ts                      # Custom Solana metrics exporter
    │   └── package.json
    └── grafana/
        ├── dashboards/
        │   ├── solana-infrastructure.json # RPC health, slot lag, endpoint status
        │   ├── program-performance.json   # TX success rate, CU usage, instruction metrics
        │   └── ux-funnel.json             # Wallet connect rate, error rate, confirmation time
        └── provisioning/
            ├── datasources/prometheus.yml
            └── dashboards/dashboards.yml
```

---

## Why This Beats Every Other Approach

### vs. ad-hoc scripts
Every team re-builds the same RPC health check, the same CU monitor, the same alert webhook. This ships it in 60 seconds with a `docker compose up`.

### vs. generic monitoring guides
Generic guides teach Prometheus concepts. This skill teaches Solana-specific patterns: slot lag thresholds, CU budget alerting, instruction discriminator tracking, program upgrade detection.

### vs. other observability submissions
This skill covers 8 skill files across 6 distinct observability layers (infrastructure, program, application, alerting, tracing, dashboards), 5 agents with production-grade depth, and a working deploy stack. Total practitioner content: 231KB across 21 files.

---

## Coverage Matrix

| Layer | Skill File | What's Covered |
|-------|-----------|----------------|
| **Infrastructure** | `infrastructure-monitoring.md` | Multi-endpoint health, slot lag, rate limits, circuit breakers, endpoint failover |
| **Program** | `program-monitoring.md` | Per-instruction success rates, CU metering, upgrade detection, authority monitoring |
| **Application** | `application-observability.md` | Wallet error classification, UX funnels, client-side latency, Sentry integration |
| **Alerting** | `alerting.md` | SLO burn rates (multi-window), severity routing P0→P4, auto-remediation |
| **Logging/Tracing** | `logging-tracing.md` | Structured Pino logging, OpenTelemetry spans, trace correlation IDs |
| **Dashboards** | `dashboards.md` | Grafana JSON dashboards, React real-time components, PromQL queries |
| **CU Profiling** | `program-profiling.md` | Per-instruction CU budgets, CI regression gates, production CU forensics |

---

## Example: 3-Minute Health Check

```typescript
import { RpcHealthMonitor } from './monitoring/rpc-health';

const monitor = new RpcHealthMonitor([
  { url: process.env.HELIUS_RPC!, weight: 100, timeoutMs: 5000 },
  { url: process.env.QUICKNODE_RPC!, weight: 80, timeoutMs: 5000 },
]);

// GET /health → { status: "ok", endpoints: [...], slotLag: 3 }
app.get('/health', async (c) => {
  const results = await monitor.checkHealth();
  const healthy = results.filter(r => r.healthy);
  return c.json({ 
    status: healthy.length > 0 ? 'ok' : 'degraded',
    endpoints: results,
  });
});
```

## Example: SLO Burn Rate Alert

```typescript
// Alert when you're burning through your error budget too fast
// (borrowed from Google SRE — adapted for Solana)
const burnAlert = await evaluateBurnRate({
  sloTarget: 0.995,           // 99.5% tx success rate
  windowHours: 1,             // 1-hour window
  errorBudgetHours: 3.6,      // 30-day budget = 3.6 hours of 0% success
  currentSuccessRate: await getTxSuccessRate(),
});

if (burnAlert.burnMultiple > 14.4) {
  await page("P0: Burning through 30-day error budget in <1 hour");
}
```

---

## Quick Start Prompts

```
"Set up RPC health monitoring with failover for my dApp"
"Create a Grafana dashboard showing transaction success rates and CU usage"
"Build an alert that pages me when transactions fail >5%"
"Add OpenTelemetry tracing from my frontend through RPC to on-chain confirmation"
"Monitor my program for unauthorized upgrades or authority changes"
"Set up SLO burn rate alerting for my protocol"
"Run /obs health-check on my infrastructure"
```

---

## License

MIT — free to use, submodule, or extend.

## Author

Built by Victor Stanley ([@Stan-lee13](https://github.com/Stan-lee13)) for the Superteam Earn Solana AI Kit bounty.
