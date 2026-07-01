# /obs alert-setup

Configure production alerting rules, routing, and runbook links for a Solana protocol.

## Inputs Required
- Protocol name and owner
- Cluster: `mainnet-beta`, `devnet`, or both
- Program IDs and critical instructions
- RPC endpoint aliases, not raw URLs
- SLO targets or approval to use defaults
- Notification targets: PagerDuty key, Discord/Slack webhook

---

## What This Command Produces

Running `/obs alert-setup` generates three files ready for deployment:

1. `alerts.yml` — Prometheus alert rules scoped to your protocol
2. `alertmanager.yml` — routing config with inhibition rules
3. `runbook-index.md` — mapping of every alert to its runbook

---

## Generated Output — alerts.yml (example)

```yaml
groups:
  - name: solana_protocol_alerts
    rules:
      - alert: TxSuccessRateLow
        expr: |
          sum(rate(solana_transaction_total{status="success",program_id="<PROGRAM_ID>"}[5m])) /
          sum(rate(solana_transaction_total{program_id="<PROGRAM_ID>"}[5m])) < 0.90
        for: 5m
        labels:
          severity: critical
          team: protocol
          runbook: runbooks/transaction-success-rate-low.md
        annotations:
          summary: "{{ $labels.program_id | trunc 8 }} tx success rate {{ $value | humanizePercentage }}"
          runbook_url: "https://github.com/<ORG>/<REPO>/blob/main/runbooks/transaction-success-rate-low.md"

      - alert: FeePayerLow
        expr: solana_fee_payer_balance_sol{protocol="<PROTOCOL_NAME>"} < 0.5
        for: 5m
        labels:
          severity: warning
          runbook: runbooks/fee-payer-low.md
        annotations:
          summary: "Fee payer balance {{ $value }} SOL — runway < 24h"
```

---

## Generated Output — alertmanager.yml routing

```yaml
route:
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: default
  routes:
    - matchers: [severity="critical"]
      receiver: pagerduty-p0
      continue: true   # also notify discord
    - matchers: [severity="warning"]
      receiver: discord-warnings

inhibit_rules:
  - source_matchers: [alertname="SolanaRPCDown"]
    target_matchers: [severity=~"warning|info"]
    equal: [job]
  - source_matchers: [alertname="SolanaWalletDrainDetected"]
    target_matchers: [alertname=~"FeePayerLow|WalletErrorSpike"]

receivers:
  - name: pagerduty-p0
    pagerduty_configs:
      - routing_key: ${PAGERDUTY_KEY}
        description: '{{ template "pagerduty.default.description" . }}'
        severity: '{{ if eq .GroupLabels.severity "critical" }}critical{{ else }}warning{{ end }}'
  - name: discord-warnings
    discord_configs:
      - webhook_url: ${DISCORD_WEBHOOK_URL}
        title: '⚠️ {{ .GroupLabels.alertname }}'
        message: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## SLO Defaults (if not specified)

| Metric | Default SLO | Alert threshold |
|---|---|---|
| Tx success rate | 99.9% | < 99% for 5m |
| RPC slot lag | < 50 slots | > 50 slots for 3m |
| Indexer lag | < 5 minutes | > 300s for 3m |
| Fee payer runway | > 24 hours | Balance < 0.5 SOL |
| Program upgrade | Planned only | Any unplanned change |

---

## Deployment

```bash
# Validate generated rules
promtool check rules alerts.yml

# Apply to running Prometheus (hot-reload)
curl -X POST http://localhost:9090/-/reload

# Test alert routing
amtool alert add alertname="TestAlert" severity="warning" \
  --alertmanager.url=http://localhost:9093
```
