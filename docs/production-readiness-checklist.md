# Production Readiness Checklist — v2

> **How to use:** Work through each section before going live.
> Score each item: ✅ Done | ⚠ Partial | ❌ Missing
> Target: 100% ✅ before launch. Below 80%: delay launch.

---

## Section 1 — Deployment Stack (required for any production use)

### Docker Compose Hardening
- [ ] `.env` file created from `.env.example` — never committing secrets to git
- [ ] `GF_SECURITY_ADMIN_PASSWORD` set to a non-default strong password (not `solana-obs`)
- [ ] `HELIUS_RPC_URL` populated with a paid Helius key (not public endpoint)
- [ ] At least one backup RPC endpoint configured (`QUICKNODE_RPC_URL` or `TRITON_RPC_URL`)
- [ ] Docker containers running with `no-new-privileges: true` security option
- [ ] Prometheus retention configured for environment (`PROMETHEUS_RETENTION=30d` minimum)
- [ ] All services have `healthcheck` defined with `start_period` set

### Network & Exposure
- [ ] Exporter port (3001) NOT exposed to public internet — internal network only
- [ ] Prometheus port (9090) NOT exposed to public internet OR protected by auth proxy
- [ ] Grafana port (3000) behind TLS termination (reverse proxy: nginx, Caddy, or Cloudflare)
- [ ] Grafana `GF_AUTH_ANONYMOUS_ENABLED=false`
- [ ] Grafana `GF_SECURITY_COOKIE_SECURE=true` (requires HTTPS)
- [ ] `GF_ANALYTICS_REPORTING_ENABLED=false` (no usage data to Grafana Inc.)

**Copy-pasteable nginx reverse proxy for Grafana:**
```nginx
server {
    listen 443 ssl;
    server_name grafana.yourprotocol.io;
    ssl_certificate     /etc/letsencrypt/live/grafana.yourprotocol.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grafana.yourprotocol.io/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}
```

---

## Section 2 — Exporter Validation

### Build & Tests
- [ ] `npm run build` succeeds in `deploy/solana-exporter/` with zero TypeScript errors
- [ ] `npm test` passes (test/exporter.test.ts): all 30+ assertions green
- [ ] `scripts/e2e-validate.sh` runs to completion with zero failures
- [ ] `/live` endpoint returns `ok` within 5s of container start
- [ ] `/health` endpoint returns JSON with `status`, `cluster`, `timestamp` fields
- [ ] `/metrics` endpoint returns Prometheus text format (`text/plain`)
- [ ] Default metrics (`nodejs_*`) appear in `/metrics` output

### Exporter Configuration
- [ ] At least one valid `PROGRAM_IDS` address configured (not empty)
- [ ] `FEE_PAYER_ADDRESSES` populated — fee payer balance is the most common silent failure
- [ ] `VAULT_ADDRESSES` populated for any protocol treasury accounts
- [ ] `SCRAPE_INTERVAL_SECONDS` set to ≥5 (0 or <5 = undefined behavior / resource exhaustion)
- [ ] `SOLANA_CLUSTER` matches actual network (mainnet-beta for production)

### Metric Presence Verification
Run these PromQL queries in Prometheus after first scrape (30-60s after startup):
```promql
# All required metrics must return data:
solana_rpc_healthy
solana_slot_lag_slots
solana_fee_payer_balance_sol
solana_transaction_total
solana_rpc_request_duration_seconds_count
```
- [ ] All five queries above return at least one time series
- [ ] `solana_rpc_healthy{endpoint="helius-primary"} == 1` (primary RPC healthy)
- [ ] `solana_fee_payer_balance_sol` matches expected value (cross-check via explorer)

---

## Section 3 — Alert Rules

### Rule Syntax
- [ ] `promtool check rules deploy/alerts.yml` passes with zero errors
- [ ] All alerts have `severity` label (`p0`, `p1`, `p2`)
- [ ] All alerts have `owner` label (team name or PagerDuty service)
- [ ] All alerts have `runbook_url` annotation pointing to valid file
- [ ] All alerts have `summary` and `description` annotations
- [ ] P0 alerts fire within ≤2 minutes (`for: 2m` or shorter)
- [ ] P1 alerts fire within ≤5 minutes

### Alert Coverage Gaps (verify at least one alert exists for each):
- [ ] RPC endpoint down (`solana_rpc_healthy == 0`)
- [ ] Slot lag high (`solana_slot_lag_slots > 50`)
- [ ] Transaction success rate low (`rate(solana_transaction_total{status="failed"})`)
- [ ] Fee payer balance low (`solana_fee_payer_balance_sol < 0.5`)
- [ ] Vault drain detected (`solana_vault_drain_rate_lamports_per_sec`)
- [ ] Program upgrade (`solana_program_upgrade_detected_total`)
- [ ] Synthetic probe failure (`solana_synthetic_rpc_probe_success == 0`)

### Alert Testing
- [ ] Test each P0 alert manually by temporarily lowering the threshold
- [ ] Confirm alert routes to correct channel (Discord/PagerDuty/Slack) end-to-end
- [ ] Resolve test alert and confirm notification of resolution
- [ ] Maintenance window suppression mechanism configured and tested

---

## Section 4 — Grafana Dashboards

### Provisioning
- [ ] All dashboard JSON files parse without error (`python3 -c "import json; json.load(open('file.json'))"`)
- [ ] `deploy/grafana/provisioning/datasources/prometheus.yml` has correct Prometheus URL
- [ ] `deploy/grafana/provisioning/dashboards/dashboards.yml` has correct path
- [ ] All dashboards auto-load on Grafana startup (no manual import required)
- [ ] `grafana/api/search?type=dash-db` returns at least 4 dashboards

### Dashboard Quality
- [ ] Each dashboard has a declared audience (exec / ops / on-call / public)
- [ ] SLO thresholds visible as reference lines on key metric panels
- [ ] Runbook links present as text panel or annotation on each dashboard
- [ ] No wallet addresses or API keys visible in dashboard queries or annotations
- [ ] Dashboards version-controlled — source of truth is this repo, not Grafana UI

---

## Section 5 — Runbooks

### Completeness (one runbook per alert type):
- [ ] `rpc-degradation.md` — verified first-5-minute steps are copy-pasteable PromQL
- [ ] `transaction-success-rate-low.md` — includes error classification decision tree
- [ ] `fee-payer-low.md` — includes refill procedure and suspicious-outflow escalation path
- [ ] `indexer-lag.md` — includes stale-data UI mitigation step
- [ ] `wallet-drain-detected.md` — includes full containment and user recovery steps
- [ ] `wallet-error-spike.md` — complete

### Runbook Hardening (apply to each runbook):
- [ ] Severity classification is explicit (P0/P1/P2)
- [ ] First-5-minute actions are numbered and specific (not "investigate")
- [ ] PromQL queries are copy-pasteable and tested against live data
- [ ] Escalation path is explicit: who to call, what tool to use
- [ ] Resolution criteria are measurable (e.g., "metric < threshold for 15 minutes")
- [ ] On-call contacts and escalation path updated in `docs/observability-governance.md`

---

## Section 6 — Synthetic Monitoring

- [ ] At least one synthetic probe configured (`solana_synthetic_rpc_probe_success`)
- [ ] Probe runs every ≤60 seconds (not just on scrape)
- [ ] Canary wallet is documented — balance tracked, not used for anything else
- [ ] Blinks action probe configured if protocol uses Solana Actions
- [ ] Fee payer balance probe matches actual fee payer address
- [ ] Probe failure alert fires within 2 minutes of failure

---

## Section 7 — SLOs and Error Budgets

- [ ] Primary SLO defined: e.g., "Transaction success rate ≥ 99.5% over 28 days"
- [ ] SLI expression written in PromQL (numerator / denominator)
- [ ] Error budget calculated: (1 - SLO) × window = allowable downtime
- [ ] Burn rate alert configured (2x burn rate → P1 alert, 14x burn rate → P0 alert)
- [ ] SLO target visible on ops dashboard as reference line

```promql
# Example SLI expression (transaction success rate):
sum(rate(solana_transaction_total{status="success"}[28d]))
/ clamp_min(sum(rate(solana_transaction_total[28d])), 1)

# Example burn rate (fast-burn: 14x over 1h indicates budget exhaustion in <2h):
(
  sum(rate(solana_transaction_total{status="failed"}[1h]))
  / clamp_min(sum(rate(solana_transaction_total[1h])), 1)
) / (1 - 0.995) > 14
```

---

## Section 8 — Security Observability

- [ ] `solana_program_upgrade_detected_total` alert active with expected=false label
- [ ] `solana_authority_change_total` monitored for unexpected changes
- [ ] `solana_vault_drain_rate_lamports_per_sec` alert fires within 1 minute
- [ ] `solana_set_authority_instruction_total` monitored for spike detection
- [ ] Watchlist maintained for known MEV bots and exploit addresses
- [ ] Post-launch: monitor `solana_flash_loan_cooccurrence_total` for 48h

---

## Section 9 — Operational Readiness

### On-Call Setup
- [ ] On-call rotation defined and documented in `docs/observability-governance.md`
- [ ] Primary and secondary on-call contacts know how to acknowledge alerts
- [ ] PagerDuty/Discord/Slack alert routing tested end-to-end (not just configured)
- [ ] Runbook URL links work from within alert notification

### Launch Day Checklist (T-24h)
- [ ] Run `scripts/e2e-validate.sh` — all checks pass
- [ ] Confirm all 4 Grafana dashboards load without errors
- [ ] Confirm Prometheus has >1 hour of pre-launch baseline data
- [ ] Confirm at least one synthetic probe is green
- [ ] Confirm on-call team is aware of launch time and has runbooks bookmarked

### Post-Launch (first 72h)
- [ ] Monitor transaction success rate continuously for first 4 hours
- [ ] Set tighter alert thresholds for first 72h (e.g., slot lag > 20 instead of > 50)
- [ ] Daily review of fee payer balance runway
- [ ] Review alert fatigue — disable or raise threshold for any alert that fired >5 times without action

---

## Scoring

Count your ✅ items and divide by total:

| Score | Status |
|-------|--------|
| 90–100% | ✅ Production ready |
| 80–89%  | ⚠ Near-ready — resolve ❌ items in critical sections |
| 70–79%  | ⚠ Launch with caution — significant gaps |
| <70%    | ❌ Not production ready — delay until resolved |
