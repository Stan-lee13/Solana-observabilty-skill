# Solana Observability Skill

Production observability, monitoring, and operational intelligence for Solana dApps. A Claude Code skill that fills a critical gap in the Solana ecosystem — turning operational blindness into complete visibility across the full stack.

**Problem it solves**: Every Solana builder eventually faces the same questions — "Why are my transactions failing?" "Is my RPC down?" "How do I know my dApp is healthy?" This skill provides production-grade answers with code you can deploy today.

## What You Get

- **6 specialized skill files** covering every layer of Solana observability
- **5 agent definitions** for architecture, implementation, SRE, visualization, and incident response
- **2 workflow commands** for health checks and deployment monitoring
- **Auto-loading rules** for monitoring safety and best practices
- **Complete Grafana dashboards** (JSON) for infrastructure, program performance, and UX
- **Ready-to-run code** for health checks, metrics collection, alerting, and tracing

### Coverage Layers

| Layer | File | What It Covers |
|---|---|---|
| **Infrastructure** | `infrastructure-monitoring.md` | RPC health, slot lag, rate limits, endpoint failover |
| **Program** | `program-monitoring.md` | CU optimization, TX success rates, upgrade detection, account health |
| **Application** | `application-observability.md` | Wallet error tracking, user journey funnels, client-side latency |
| **Alerting** | `alerting.md` | Severity classification, multi-channel routing, runbooks, auto-remediation |
| **Logging & Tracing** | `logging-tracing.md` | Structured logging, OpenTelemetry, trace correlation, Cloudflare Workers |
| **Dashboards** | `dashboards.md` | Grafana JSON configs, React real-time components, Prometheus exporters |

## Why This Skill Is Different

1. **Cross-domain** — Covers DevOps, data engineering, and Solana operations. No other skill bridges these worlds.
2. **Production-tested patterns** — Not toy demos. These are patterns from running Solana dApps at scale.
3. **Progressive loading** — Token-efficient SKILL.md routing. Only load what you need.
4. **Ecosystem-native** — Built for `@solana/kit`, Anchor 1.0+, Helius, Jito — the 2026 stack.
5. **Opinionated but flexible** — Sensible defaults (Prometheus + Grafana) with escape hatches to Datadog, New Relic, etc.

## Quick Start

### Install as Claude Code Skill

```bash
# Via the skill installer
npx skills add https://github.com/YOUR_USERNAME/solana-observability-skill

# Or manually
git clone https://github.com/YOUR_USERNAME/solana-observability-skill.git
cd solana-observability-skill
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
"Analyze and optimize my program's compute unit usage"
```

## Example: 5-Minute Health Check Setup

```typescript
// Add to your backend (Hono/Express/Fastify)
import { RpcHealthMonitor, HealthApi } from 'solana-observability/health';

const monitor = new RpcHealthMonitor([
  { url: process.env.HELIUS_RPC, weight: 100, timeoutMs: 5000, retries: 3, tags: ['helius'] },
  { url: process.env.QUICKNODE_RPC, weight: 80, timeoutMs: 5000, retries: 3, tags: ['quicknode'] },
]);

// Mount health endpoints
app.route('/health', HealthApi(monitor));

// Check every 30 seconds
setInterval(() => monitor.checkHealth(), 30000);
```

## Example: Transaction Tracing

```typescript
import { traceTransaction } from 'solana-observability/tracing';

const signature = await traceTransaction(
  'swap',
  { programId: JUPITER_PROGRAM, instruction: 'route', walletAddress: wallet.publicKey },
  async (span) => {
    // Your Jupiter swap code here
    // Spans are automatically created for RPC calls
    return await jupiter.swap(input).execute();
  }
);
```

## Repository Structure

```
solana-observability-skill/
├── skill/
│   ├── SKILL.md                         # Main entry point and routing hub
│   ├── infrastructure-monitoring.md     # RPC health, failover, rate limits
│   ├── program-monitoring.md            # CU tracking, TX success, upgrades
│   ├── application-observability.md     # Wallet errors, UX funnels, client latency
│   ├── alerting.md                      # Severity rules, routing, runbooks
│   ├── logging-tracing.md               # Structured logs, OpenTelemetry, correlation
│   ├── dashboards.md                    # Grafana JSON, React components, exporters
│   └── resources.md                     # Curated tools, services, references
├── agents/
│   ├── observability-architect.md       # Design monitoring strategies
│   ├── monitoring-engineer.md           # Write monitoring code
│   ├── sre-engineer.md                  # Alerts and incident response
│   └── incident-commander.md            # Debug production issues
├── commands/
│   ├── health-check.md                  # /obs health-check command
│   └── monitor-deploy.md                # /obs monitor-deploy command
├── rules/
│   └── monitoring-rules.md              # Auto-loading safety rules
├── CLAUDE.md                            # Claude configuration
├── install.sh                           # One-command installer
├── README.md                            # This file
└── LICENSE                              # MIT
```

## Ecosystem Integration

| Service | What You Can Monitor |
|---|---|
| **Helius** | Webhook delivery, RPC latency, enhanced API availability |
| **Jupiter** | Swap success rates, route performance, price impact |
| **QuickNode** | gRPC stream health, endpoint performance |
| **Phantom** | Wallet connection success, signing latency |
| **PagerDuty** | On-call alerting for critical incidents |
| **Grafana** | Infrastructure, program, and UX dashboards |
| **Cloudflare Workers** | Edge latency, log aggregation, analytics engine |

## Judging Criteria Alignment

**Usefulness**: Every production Solana dApp needs observability. This skill solves a daily pain point that currently has no standardized solution in the ecosystem.

**Novelty**: No existing skill in the Solana AI Kit covers monitoring, alerting, health checks, or operational intelligence. This fills a genuine gap.

**Quality**: Production-grade code patterns, tested approaches, comprehensive documentation, and progressive loading for token efficiency.

**Fit**: Follows the exact structure of `solana-game-skill` (the reference). Clean SKILL.md routing, optional agents/commands/rules, installer script, and MIT license.

## Stack Requirements

- Node.js 20+
- Git
- Prometheus (optional — for self-hosted metrics)
- Grafana (optional — for dashboards)
- OpenTelemetry Collector (optional — for tracing)

## Contributing

Contributions welcome! Areas of particular interest:
- Additional Grafana dashboard templates
- More auto-remediation actions
- Support for additional RPC providers
- Client-side React/Vue component libraries
- Kubernetes operator for Solana monitoring

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for the Solana AI Kit by Superteam Brasil
- Skill structure inspired by [solana-game-skill](https://github.com/solanabr/solana-game-skill)
- Patterns drawn from production Solana dApp operations
