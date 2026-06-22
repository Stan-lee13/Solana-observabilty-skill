# Solana Observability Skill — Claude Configuration

This is a Claude Code skill addon for production observability, monitoring, and operational intelligence of Solana dApps.

## Extends

- [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill) — Core Solana development
- [cloudflare-skills](https://github.com/cloudflare/skills) — Infrastructure and edge deployment

## Agents

Use these agents for observability tasks:

| Agent | Role | Model | Used For |
|---|---|---|---|
| `observability-architect` | Architecture design | opus | Monitoring system design, choosing tools, planning observability strategy |
| `monitoring-engineer` | Implementation | sonnet | Writing health checks, metrics collection code, Prometheus exporters |
| `sre-engineer` | Reliability | sonnet | Alert rules, runbooks, incident response automation |
| `data-viz-engineer` | Visualization | sonnet | Grafana dashboards, React real-time components, metric queries |
| `incident-commander` | Incident response | sonnet | Debugging production issues, root cause analysis, post-mortems |

## Commands

| Command | Description |
|---|---|
| `/obs health-check` | Run comprehensive health check on all endpoints |
| `/obs monitor-deploy` | Set up monitoring for a new deployment |
| `/obs alert-setup` | Configure alerting rules and notification channels |
| `/obs dashboard` | Create or update Grafana dashboards |
| `/obs incident` | Start incident response workflow |
| `/obs cu-optimize` | Analyze and optimize compute unit usage |
| `/obs trace` | Enable distributed tracing for a transaction flow |

## Key Principles

1. **Observe the full stack** — RPC → Program → Frontend. Don't monitor in silos.
2. **Correlate everything** — Use correlation IDs: HTTP request → RPC → TX signature → confirmation.
3. **Alert on symptoms, not causes** — High failure rate matters more than RPC latency spike.
4. **Progressive disclosure** — Start with basic health checks, add depth as needed.
5. **Test your alerts** — An untested alert is a false sense of security.

## Stack Decisions

| Layer | Default | When to Override |
|---|---|---|
| Metrics | Prometheus + OpenTelemetry | Use Datadog/New Relic for managed APM |
| Health Checks | Hono HTTP + on-chain validators | Use Kubernetes probes if in k8s |
| Alerting | PagerDuty + Discord | Use Slack/Teams based on team preference |
| Dashboards | Grafana + React components | Use Datadog dashboards if using their APM |
| Logging | Pino (Node) / structured (Workers) | Use existing logging stack if established |
| Tracing | OpenTelemetry + Jaeger/Tempo | Use Honeycomb for high-cardinality events |

## Progressive Loading

This skill uses progressive disclosure:
- `SKILL.md` — Overview, routing, stack decisions
- `skill/*.md` — Layer-specific deep dives
- `skill/resources.md` — External tools and references

Load the specific layer file when discussing that concern. Cross-layer correlation guidance stays in SKILL.md.

## Safety Rules

- Never log private keys, mnemonics, or seed phrases
- Redact authorization headers and API keys in logs
- Don't expose detailed error messages to clients in production
- Rate limit health check endpoints to prevent DoS
- Use read-only RPC calls for monitoring (no signing required)
