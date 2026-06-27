# Solana Observability Resources

Production resource management, tool selection, dependency guidance, scaling
patterns, and operational references for Solana observability systems.

Load this file when choosing providers, sizing infrastructure, managing costs,
selecting dependencies, or reviewing external observability services.

## Resource Management Philosophy

Observability resources are production dependencies. Treat RPC providers,
Prometheus retention, Grafana dashboards, webhook receivers, trace stores, and
log pipelines as part of the protocol control plane.

Principles:

1. **Reliability before cost cutting** — never remove a safety signal to save spend.
2. **Bounded cardinality first** — optimize labels before scaling hardware.
3. **Managed when small, self-hosted when justified** — avoid operating complexity
   until traffic, compliance, or cost requires it.
4. **Provider diversity** — a single RPC provider is a single point of blindness.
5. **Versioned resources** — dashboards, alerts, runbooks, and deploy manifests
   live in source control.
6. **No secret-bearing resources in clients** — never expose paid RPC URLs in
   `NEXT_PUBLIC_*`, public dashboards, or browser WebSocket examples.

## Production Tool Selection Matrix

| Use case | Default | OSS option | Managed option | Override when | Caveats |
|---|---|---|---|---|---|
| Metrics | Prometheus | Prometheus | Grafana Cloud, Datadog | compliance or scale requires SaaS | watch cardinality |
| Dashboards | Grafana | Grafana OSS | Grafana Cloud, Datadog | team already standardized | version dashboard JSON |
| Logs | Pino + Loki | Loki + Promtail/Alloy | Datadog, Axiom, Cloudflare Logpush | high-volume edge logging | redact before ship |
| Traces | OpenTelemetry + Tempo | Tempo, Jaeger | Honeycomb, Datadog, New Relic | high-cardinality analysis | sample carefully |
| Alerts | Alertmanager + PagerDuty | Alertmanager | PagerDuty, Opsgenie | managed on-call needed | test routing |
| Error tracking | Sentry | GlitchTip | Sentry | frontend-heavy apps | avoid PII |
| RPC monitoring | Custom exporter | self-hosted exporter | Helius, QuickNode dashboards | provider has strong SLA | use two providers |
| Warehousing | Postgres/ClickHouse | ClickHouse | BigQuery, Snowflake | long-term analytics | not for paging |
| Public analytics | Grafana public/Dune | Superset | Dune, Flipside | community dashboards | aggregate sensitive data |

## Solana RPC Provider Capability Matrix

| Provider | Enhanced RPC | Webhooks | gRPC/Streams | Status Page | Best Fit | Production Caveats |
|---|---|---|---|---|---|---|
| Helius | Yes | Strong | Limited/partner | https://status.helius.xyz/ | webhooks, enhanced tx data | protect API keys |
| QuickNode | Yes | Streams | Stream Connect | https://status.quicknode.com/ | multi-chain ops, gRPC | quota and add-on costs |
| Triton | Specialist | Limited | Yellowstone | https://status.triton.one/ | low-latency Solana infra | usually advanced teams |
| Syndica | Yes | Bespoke | Available | https://status.syndica.io/ | Solana-native indexing | verify product fit |
| Alchemy | Yes | Notify | Limited | https://status.alchemy.com/ | broad SaaS reliability | feature parity varies |
| Public RPC | No | No | No | Solana status | fallback/canary only | rate limits, no SLA |

Provider selection checklist:

- [ ] At least two independent RPC providers for production monitoring.
- [ ] Endpoint labels are aliases, not raw URLs.
- [ ] Provider status pages are linked in runbooks.
- [ ] Rate-limit headers or quota dashboards are monitored.
- [ ] Webhook signatures/shared secrets are validated.
- [ ] Failover behavior is tested during maintenance windows.

## Recommended Dependency Baseline

Use current stable major versions compatible with the target codebase.

| Area | Package / Tool | Use |
|---|---|---|
| Solana client | `@solana/kit` or `@solana/web3.js` | RPC, accounts, signatures |
| Metrics | `prom-client` | Node.js Prometheus exporter |
| HTTP | `hono`, `@hono/node-server` | lightweight health and metrics endpoints |
| Logging | `pino`, `pino-http` | structured Node logs |
| Tracing | `@opentelemetry/api`, `@opentelemetry/sdk-node` | trace instrumentation |
| OTLP | `@opentelemetry/exporter-trace-otlp-http` | trace export |
| Metrics SDK | `@opentelemetry/sdk-metrics` | OTel metrics pipeline |
| Errors | `@sentry/browser`, `@sentry/node` | frontend/backend error tracking |
| Dashboards | Grafana JSON, Grafonnet, Terraform provider | dashboard-as-code |
| Validation | `promtool`, `jq`, `yamllint`, `markdownlint` | CI checks |

Version policy:

- Pin major versions in examples.
- Avoid deprecated packages in new snippets.
- Test deployable examples before release.
- Document breaking changes when metric names, labels, or alert thresholds change.

## Capacity Planning

### Prometheus

Plan for:

- scrape interval: 15s for infra, 30s-60s for non-critical app metrics
- retention: 15d local, 30d default, longer in remote storage
- series budget: start <100k active series for small protocols
- disk: estimate with actual series count before increasing retention

Prometheus capacity warning signs:

- high memory from unbounded labels
- slow dashboard queries
- rule evaluation misses
- WAL disk growth
- cardinality spikes after adding wallet/signature labels

### Grafana

Plan folders by audience:

- Executive
- Operations
- Technical
- On-call
- Public

Use library panels for shared health rows. Keep dashboard JSON in source control.
Never edit production dashboards without backporting changes to the repository.

### Logs

Default retention:

- P0/P1 incident logs: 30-90d depending on compliance
- normal debug logs: 3-7d
- structured application logs: 14-30d
- public edge logs: based on privacy policy

Reduce log cost by sampling debug logs, lowering retention, and dropping noisy
fields. Do not drop security, authority-change, or funds-flow logs.

### Traces

Recommended strategy:

- sample normal traces at 1-10%
- keep 100% of error traces
- keep 100% of P0/P1 incident windows
- tail-sample high-latency confirmation traces

## Cost Optimization

Cost levers, in preferred order:

1. Remove unsafe/unbounded labels.
2. Reduce dashboard query fanout.
3. Lower debug log retention.
4. Sample traces while preserving errors.
5. Use remote write or object storage for long-term metrics.
6. Consolidate duplicate provider dashboards.
7. Negotiate RPC provider tier based on measured traffic.

Do not optimize by removing transaction success, authority monitoring, slot lag,
indexer freshness, fee payer balance, or P0/P1 alerting.

## Resource Allocation Strategies

| Protocol Stage | Recommended Stack | Notes |
|---|---|---|
| Devnet prototype | local Prometheus/Grafana, public RPC canary | no paging |
| Private beta | one paid RPC + public fallback, Sentry, basic alerts | start SLO history |
| Mainnet launch | two RPC providers, PagerDuty, Grafana, Loki, Tempo | launch war room |
| High TVL | provider SLAs, remote storage, incident automation | security monitoring |
| Enterprise/compliance | managed APM, long retention, access controls | audit evidence |

## Cloud Resource Best Practices

- Run exporters close to backend services, not only from laptops.
- Use network policies or private subnets for Prometheus and Grafana where possible.
- Put public status dashboards behind read-only sharing.
- Rotate service account tokens and Grafana API keys.
- Store secrets in cloud secret managers, not `.env` committed files.
- Use resource limits for exporters to prevent runaway collectors.
- Add liveness/readiness probes to every long-running service.

## Compute Optimization

Exporter collectors must:

- run on intervals, not tight loops
- use timeouts for every RPC call
- bound concurrency across endpoints and programs
- cache static metadata such as IDL and program names
- degrade gracefully when one provider fails
- avoid expensive `getProgramAccounts` scans in hot loops

For high-volume program monitoring, use webhooks, gRPC streams, or an indexer
rather than repeated full account scans.

## Storage Optimization

Store different data in the right system:

- Prometheus: numeric time-series metrics
- Loki: structured logs and error details
- Tempo/Jaeger: traces
- Postgres/ClickHouse/BigQuery: analytics, unique users, TVL snapshots
- Object storage: long-term trace/log archives and dashboard exports

Do not store wallet-level analytics in Prometheus labels. Use a warehouse with
privacy controls when unique signer analysis is required.

## Network Optimization

- Prefer provider-local regions for latency-sensitive exporters.
- Monitor DNS, TLS, and HTTP failure classes separately.
- Use WebSocket/gRPC streams for high-frequency on-chain events.
- Backpressure webhook receivers before dropping events.
- Expose internal metrics over private networks when possible.
- Rate-limit public health and status endpoints.

## Security and Privacy Checklist

- [ ] RPC URLs in logs and labels are aliases only.
- [ ] API keys are stored in secret managers or local `.env`, never committed.
- [ ] Webhooks authenticate with shared secret, signature, or provider mechanism.
- [ ] Wallet addresses and signatures are hashed/truncated in logs by default.
- [ ] Public dashboards aggregate sensitive balances and delay risky views.
- [ ] Grafana anonymous access is disabled unless explicitly public-safe.
- [ ] Alert metadata is sanitized before PagerDuty, Slack, or Discord delivery.
- [ ] Runbooks do not reveal private infrastructure details publicly.

## Governance

Resource changes require review when they affect:

- alert thresholds or routing
- metric names or labels
- dashboard folder permissions
- retention policies
- public dashboard exposure
- RPC provider selection
- webhook authentication
- authority or funds monitoring

Maintain owners for:

- metrics schema
- dashboards
- alerts
- runbooks
- deploy stack
- provider accounts

## Failure Scenarios and Recovery

### RPC provider outage

- Confirm with `solana_rpc_healthy` and provider status page.
- Compare against secondary provider and public RPC canary.
- Fail over traffic only after verifying slot lag and latency.
- Keep incident annotation in Grafana.

### Prometheus unavailable

- Grafana dashboards lose data; alerts may stop firing.
- Use provider dashboards and logs as fallback.
- Restore Prometheus from config and persistent volume.
- Validate `promtool check config` before restart.

### Grafana unavailable

- Alerts can still fire if Prometheus/Alertmanager are healthy.
- Use Prometheus expression browser for critical queries.
- Restore dashboards from version-controlled JSON.

### Webhook receiver backlog

- Check receiver health, queue depth, and provider delivery status.
- Increase workers or slow downstream writes.
- Mark dashboards as stale if lag exceeds threshold.

### Cardinality explosion

- Identify top labels with Prometheus cardinality tools.
- Drop unbounded labels at scrape/relabel boundary.
- Roll back metric release if necessary.
- Add a postmortem action to monitoring rules.

## Resource Anti-Patterns

- One RPC provider for production and monitoring
- Raw RPC URL as a label
- Wallet address or tx signature in Prometheus
- Public Grafana with internal endpoint names
- Infinite log retention by default
- Dashboard JSON only edited through UI
- Alert rules without runbooks
- Webhooks with no authentication
- Full `getProgramAccounts` scans every few seconds
- Client-side paid RPC keys in `NEXT_PUBLIC_*`

## Reference Links

| Resource | URL | Use |
|---|---|---|
| Solana Status | https://status.solana.com/ | official network state |
| Solana Downtime | https://downtime.solana.com/ | historical incidents |
| Solana RPC Docs | https://solana.com/docs/rpc | RPC method reference |
| Solana Programs Docs | https://solana.com/docs/programs | program model |
| SIMD proposals | https://github.com/solana-foundation/solana-improvement-documents | protocol changes |
| Helius Status | https://status.helius.xyz/ | provider status |
| QuickNode Status | https://status.quicknode.com/ | provider status |
| Triton Status | https://status.triton.one/ | provider status |
| Syndica Status | https://status.syndica.io/ | provider status |
| Alchemy Status | https://status.alchemy.com/ | provider status |
| Solscan | https://solscan.io/ | transaction/program explorer |
| SolanaFM | https://solana.fm/ | advanced explorer |
| LiteSVM | https://github.com/LiteSVM/litesvm | fast local testing |
| Mollusk | https://github.com/buffalojoec/mollusk | CU profiling tests |
| Trident | https://github.com/Ackee-Blockchain/trident | fuzz testing |
| Prometheus Docs | https://prometheus.io/docs/introduction/overview/ | metrics and alerts |
| Grafana Docs | https://grafana.com/docs/grafana/latest/ | dashboards and alerting |
| OpenTelemetry JS | https://opentelemetry.io/docs/languages/js/ | tracing and metrics |

## Quick Reference: Metric Types

| Type | Use | Solana Example |
|---|---|---|
| Counter | monotonically increasing events | `solana_transaction_total` |
| Gauge | current value | `solana_slot_lag_slots` |
| Histogram | distributions and percentiles | `solana_rpc_request_duration_seconds` |
| Summary | rarely, client-side quantiles | avoid for Prometheus aggregation |

## Quick Reference: Response SLA

| Severity | Response | Resolution Target |
|---|---|---|
| P0 | immediate | 1 hour or active mitigation |
| P1 | 15 minutes | 4 hours |
| P2 | 2 hours | 24 hours |
| P3 | next business day | best effort |

## Production Resource Review Checklist

- [ ] Provider choice has a fallback.
- [ ] Cost impact is documented.
- [ ] Cardinality impact is bounded.
- [ ] Data retention is explicit.
- [ ] Public/private visibility is classified.
- [ ] Secrets and endpoint URLs are protected.
- [ ] Dashboards and alerts are versioned.
- [ ] Runbooks reference provider status pages.
- [ ] Scaling path is known before launch.

## Resource Lifecycle Management

1. **Plan** — document owners, capacity targets, cost estimates, and compliance needs.
2. **Provision** — use IaC (Terraform/CloudFormation) with small blast radius defaults.
3. **Operate** — monitoring, runbooks, and scheduled reviews; add owner to on-call rotation.
4. **Optimize** — quarterly cost and cardinality reviews; rightsizing and sampling changes.
5. **Decommission** — revoke keys, archive data to object storage, and remove from dashboards.

Include a lifecycle header in resource-related PRs describing impact and rollback path.

## CI / Validation Patterns

- `promtool check rules` for all Prometheus rules in CI.
- Validate Grafana JSON using a JSON schema or a lightweight node script that ensures required metadata fields (`owner`, `audience`, `slo_links`).
- Lint Terraform and run `terraform plan -out=plan` in PR builds for infra changes.
- Run `yamllint` and `markdownlint` on runbooks and docs.
- Validate runbook front-matter (title, owner, severity, runbook_url) via unit tests.

## IaC Example: Grafana Folder Provisioning (Terraform snippet)

```hcl
resource "grafana_folder" "ops" {
   title = "Operations"
   uid   = "ops"
}

resource "grafana_dashboard" "tx_success" {
   config_json = file("dashboards/tx-success.json")
   folder_uid  = grafana_folder.ops.uid
}
```

## Capacity Planning Formula Examples

- Prometheus disk estimate: `bytes_per_sample * samples_per_series * series * retention_seconds`.
- Approx bytes per sample: 16-40 bytes depending on label sizes and TSDB overhead.
- Example: 100k series * 3600 samples/day * 15 days * 30 bytes ≈ 162 GB.

## Templates and Checklists

Add these templates to PR descriptions when touching observability resources:

- **Observability PR Template**
   - Owner:
   - Affected dashboards/alerts:
   - SLO impact: yes/no (describe)
   - Cardinality delta estimate:
   - CI checks added:
   - Rollback plan:

- **Cost Review Checklist**
   - Expected monthly cost delta:
   - Retention changes and rationale:
   - Cardinality mitigation:
   - Negotiation tasks for providers:

## Failure Recovery Playbooks

Keep concise playbooks for:
- RPC provider failover
- Fee payer exhaustion
- Indexer lag > threshold
- Prometheus WAL corruption

Each playbook must include `detection -> containment -> mitigation -> recovery -> postmortem` steps and be referenced from related alerts.

## Governance: Ownership & Change Control

- All metric name changes require a deprecation cycle: rename -> adapter -> migrate -> remove.
- Dashboards and alert changes must include `owner` and `reviewers` labels in PRs.
- Critical alert changes require at least two reviewers: `sre-engineer` and `monitoring-engineer`.

## Examples & Recipes

- How to add a new SLI: create Prometheus rule for numerator/denominator, create Grafana panel with SLO metadata, add alert with `runbook_url`.
- How to onboard a new RPC provider: add to exporter config, add endpoint alias, run synthetic checks, validate against secondary provider.

