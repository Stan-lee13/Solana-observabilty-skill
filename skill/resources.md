# Solana Observability Resources

Curated tools, libraries, services, and reference links for production observability on Solana.

## Official Resources

| Resource | URL | Purpose |
|---|---|---|
| Solana Network Status | https://status.solana.com/ | Official network health dashboard |
| Solana Downtime | https://downtime.solana.com/ | Historical downtime incidents |
| Solana Docs — RPC | https://solana.com/docs/rpc | Official RPC API reference |
| Solana Docs — Programs | https://solana.com/docs/programs | Program development guide |
| SIMD Proposals | https://github.com/solana-foundation/solana-improvement-documents | Protocol changes affecting ops |

## RPC Providers (with observability features)

| Provider | Status Page | Metrics/Logs | Notes |
|---|---|---|---|
| **Helius** | https://status.helius.xyz/ | Enhanced RPC, webhooks | Best webhook support for event monitoring |
| **QuickNode** | https://status.quicknode.com/ | Stream Connect (gRPC), metadata | Good for streaming metrics |
| **Alchemy** | https://status.alchemy.com/ | Supernode dashboard | Reliable, good rate limit headers |
| **Triton** | https://status.triton.one/ | Yellowstone gRPC | Low-latency streaming |
| **Syndica** | https://status.syndica.io/ | Logstore, bespoke APIs | Purpose-built for Solana |

## Monitoring & Observability Tools

### Metrics Collection

| Tool | Type | Best For | Integration |
|---|---|---|---|
| **Prometheus** | Time-series DB | On-prem metrics scraping | `@opentelemetry/exporter-prometheus` |
| **Grafana Cloud** | Hosted TSDB | Managed dashboards & alerts | OTLP endpoint |
| **Datadog** | SaaS APM | Full-stack APM + infra | `@opentelemetry/exporter-trace-otlp-http` |
| **New Relic** | SaaS APM | Distributed tracing | OTLP |
| **InfluxDB** | Time-series DB | Custom metrics pipelines | Line protocol |

### Logging

| Tool | Type | Best For | Integration |
|---|---|---|---|
| **Loki** | Log aggregation | Grafana-native log search | `@axonivy/log-producer` or HTTP API |
| **Datadog Logs** | SaaS logging | Correlated logs + traces | HTTP intake |
| **Cloudflare Logpush** | Edge logging | Workers log aggregation | Native binding |
| **Axiom** | Modern logging | Server-friendly pricing | HTTP API |
| **SigNoz** | Open-source APM | Self-hosted full observability | OTLP |

### Tracing

| Tool | Type | Best For | Integration |
|---|---|---|---|
| **Jaeger** | Distributed tracing | Self-hosted trace analysis | `@opentelemetry/exporter-trace-otlp-http` |
| **Tempo** | Distributed tracing | Grafana-native, object storage | OTLP |
| **Honeycomb** | Event-based observability | High-cardinality data | OTLP or Beeline |
| **SigNoz** | Open-source APM | Full observability stack | OTLP |

### Alerting & Incident Response

| Tool | Type | Best For | Integration |
|---|---|---|---|
| **PagerDuty** | On-call management | Enterprise incident response | Events API v2 |
| **Opsgenie** | On-call management | Atlassian ecosystem | Integration API |
| **Discord** | Chat alerts | Community/small team alerting | Webhooks |
| **Slack** | Chat alerts | Team collaboration | Incoming Webhooks |
| **Telegram** | Chat alerts | Mobile-friendly alerting | Bot API |

## OpenTelemetry Ecosystem

| Package | npm | Purpose |
|---|---|---|
| `@opentelemetry/api` | [npm](https://www.npmjs.com/package/@opentelemetry/api) | Core OTel API |
| `@opentelemetry/sdk-node` | [npm](https://www.npmjs.com/package/@opentelemetry/sdk-node) | Node.js SDK |
| `@opentelemetry/sdk-metrics` | [npm](https://www.npmjs.com/package/@opentelemetry/sdk-metrics) | Metrics collection |
| `@opentelemetry/exporter-prometheus` | [npm](https://www.npmjs.com/package/@opentelemetry/exporter-prometheus) | Prometheus metrics export |
| `@opentelemetry/exporter-trace-otlp-http` | [npm](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-http) | OTLP trace export |
| `@opentelemetry/semantic-conventions` | [npm](https://www.npmjs.com/package/@opentelemetry/semantic-conventions) | Standard attribute names |
| `@opentelemetry/resources` | [npm](https://www.npmjs.com/package/@opentelemetry/resources) | Resource attributes |

## Solana-Specific Monitoring Tools

| Tool | URL | Purpose |
|---|---|---|
| **Solana Beach** | https://solanabeach.io/ | Validator + network explorer |
| **Solscan** | https://solscan.io/ | Transaction/program explorer |
| **SolanaFM** | https://solana.fm/ | Advanced transaction tracing |
| **Trident (Fuzz)** | https://github.com/Ackee-Blockchain/trident | Program fuzz testing with metrics |
| **Mollusk** | https://github.com/buffalojoec/mollusk | Lightweight testing with CU profiling |
| **LiteSVM** | https://github.com/LiteSVM/litesvm | Fast testing with built-in logging |

## Grafana Dashboard Templates

| Dashboard | ID / Source | Metrics |
|---|---|---|
| **Solana Validator** | Grafana.com #XXXX | Validator node metrics |
| **Solana RPC Node** | Community | RPC health, throughput |
| **Custom dApp** | This skill | TX success, CU, UX, alerts |

## Books & References

| Title | Author | Topic |
|---|---|---|
| *Site Reliability Engineering* | Google | SRE practices applicable to Solana ops |
| *Distributed Systems Observability* | Cindy Sridharan | Modern observability patterns |
| *The Art of Monitoring* | James Turnbull | Monitoring fundamentals |

## Community

| Community | Link | Topic |
|---|---|---|
| Solana Tech Discord | https://discord.gg/solana | #dev-ops, #validator-support |
| Solana StackExchange | https://solana.stackexchange.com | Q&A for operational issues |
| Solana Stack Exchange — Operations | Tag: `operations` | Infrastructure questions |
| Superteam Brazil | https://discord.gg/superteambr | Regional builder community |

## Quick Reference: Metric Types for Solana

| Metric Type | Example | When to Use |
|---|---|---|
| **Counter** | `solana_tx_total` | Monotonically increasing values (tx count, errors) |
| **Gauge** | `solana_slot_lag`, `solana_cu_current` | Values that go up and down (lag, active connections) |
| **Histogram** | `solana_tx_duration_seconds` | Value distributions with buckets (latency, CU usage) |
| **Summary** | `solana_rpc_latency` | Pre-computed quantiles (P50, P95, P99) |

## Quick Reference: Log Levels

| Level | Use For | Example |
|---|---|---|
| `DEBUG` | Detailed tracing | RPC request/response bodies, account state dumps |
| `INFO` | Normal operations | Transaction lifecycle events, health check results |
| `WARN` | Anomalies | Elevated error rates, approaching thresholds |
| `ERROR` | Failures | Transaction failures, RPC timeouts, program errors |
| `FATAL` | Unrecoverable | Panics, data corruption, security breaches |

## Quick Reference: Alert Response SLA

| Severity | Response | Resolution Target |
|---|---|---|
| P0 | 5 min | 1 hour |
| P1 | 15 min | 4 hours |
| P2 | 1 hour | 24 hours |
| P3 | 4 hours | 72 hours |
| P4 | Next business day | Best effort |
