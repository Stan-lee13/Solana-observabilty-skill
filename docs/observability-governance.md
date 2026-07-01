# Observability Governance

Framework for owning, reviewing, and evolving the Solana observability stack across teams.

---

## Ownership Model

| Layer | Owner | Reviewers | Cadence |
|---|---|---|---|
| Alert rules (alerts.yml) | SRE Lead | Protocol Lead | Monthly |
| Dashboard panels | Data Viz Engineer | Product + Ops | Quarterly |
| Runbooks | On-call rotation | Incident Commander | After every P0/P1 |
| SLO targets | Protocol Lead | Engineering Lead | Quarterly |
| Cost budget (RPC, storage) | SRE Lead | Finance | Monthly |

---

## SLO Review Process

Run this script monthly to compare actual vs target:

```bash
#!/bin/bash
# scripts/slo-review.sh — monthly SLO compliance report

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
REPORT_DATE=$(date +%Y-%m)

echo "=== SLO COMPLIANCE REPORT — $REPORT_DATE ==="
echo ""

# Tx success rate — target 99.9%
ACTUAL_SUCCESS=$(curl -s "$PROMETHEUS_URL/api/v1/query" \
  --data-urlencode 'query=avg_over_time(
    (sum(rate(solana_transaction_total{status="success"}[5m])) /
     sum(rate(solana_transaction_total[5m])))[30d:5m])' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['data']['result']; print(f'{float(r[0][\"value\"][1])*100:.3f}%' if r else 'NO DATA')")
echo "Tx Success Rate (30d avg): $ACTUAL_SUCCESS  [target: 99.9%]"

# RPC health — target 99.5% healthy
ACTUAL_RPC=$(curl -s "$PROMETHEUS_URL/api/v1/query" \
  --data-urlencode 'query=avg_over_time(solana_rpc_healthy[30d])' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['data']['result']; print(f'{float(r[0][\"value\"][1])*100:.2f}%' if r else 'NO DATA')")
echo "RPC Healthy (30d avg):     $ACTUAL_RPC  [target: 99.5%]"

# Error budget remaining
echo ""
echo "--- Error Budget Status ---"
curl -s "$PROMETHEUS_URL/api/v1/query" \
  --data-urlencode 'query=(1 - avg_over_time(
    (sum(rate(solana_transaction_total{status="success"}[5m])) /
     sum(rate(solana_transaction_total[5m])))[30d:5m])) / (1 - 0.999)' \
  | python3 -c "
import json,sys
r=json.load(sys.stdin)['data']['result']
if r:
    consumed=float(r[0]['value'][1])*100
    print(f'Budget consumed: {consumed:.1f}%  Remaining: {100-consumed:.1f}%')
    if consumed > 80: print('⚠ WARNING: >80% budget consumed — freeze non-essential changes')
    if consumed > 100: print('🚨 BREACH: SLO violated this month')
"
```

---

## Alert Rule Change Process

```bash
# Before merging any change to alerts.yml:
# 1. Validate syntax
promtool check rules deploy/alerts.yml

# 2. Test alert expression against real data
promtool query instant http://localhost:9090 \
  'sum(rate(solana_transaction_total{status="success"}[5m])) / sum(rate(solana_transaction_total[5m])) < 0.90'

# 3. Test alertmanager routing
amtool config routes test \
  --config.file=deploy/alertmanager.yml \
  alertname="TxSuccessRateLow" severity="critical"

# 4. Dry-run in staging for 24h before promoting to production
```

---

## On-Call Rotation Review Checklist

Run after every P0 or P1 incident:

- [ ] Runbook followed correctly — if not, update runbook
- [ ] Alert fired at the right time — if too late, tighten threshold
- [ ] Alert fired too early (false positive) — if so, extend `for:` duration
- [ ] Missing alert for this failure mode — add new rule
- [ ] Time-to-mitigate > target — identify the bottleneck step
- [ ] Post-mortem published within 72 hours
- [ ] Action items assigned with owners and due dates

---

## Dashboard Review Checklist (Quarterly)

```bash
# Find unused dashboard panels (no queries fired in 30 days)
curl -s "http://admin:$GRAFANA_PASSWORD@localhost:3000/api/dashboards/home" \
  | python3 -c "import json,sys; ds=json.load(sys.stdin); print(f'{len(ds)} dashboards')"

# Check for stale alert annotations (pointing to deleted runbooks)
grep -r 'runbook_url' deploy/alerts.yml | while read line; do
  url=$(echo $line | grep -oP 'https?://\S+')
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  [ "$status" != "200" ] && echo "⚠ Stale runbook link: $url (HTTP $status)"
done
```
