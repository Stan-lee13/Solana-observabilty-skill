# /obs dashboard

Build or review a Solana observability dashboard.

## Routing
Load `visualization-engineer` for architecture. Load `data-viz-engineer` for Grafana JSON and PromQL panels.

## Inputs Required
- Audience: executive, operational, technical, on-call, or public
- Data sources available: Prometheus, Loki, Tempo, or custom
- Key metrics to surface (or approve defaults below)

---

## Default Dashboard Panels — Solana Protocol

### Panel 1: Transaction Success Rate (stat + timeseries)

```json
{
  "title": "Tx Success Rate (5m)",
  "type": "stat",
  "targets": [{
    "expr": "sum(rate(solana_transaction_total{status=\"success\"}[5m])) / sum(rate(solana_transaction_total[5m]))",
    "legendFormat": "Success rate"
  }],
  "fieldConfig": {
    "defaults": {
      "unit": "percentunit",
      "thresholds": {
        "steps": [
          { "color": "red",    "value": 0 },
          { "color": "yellow", "value": 0.95 },
          { "color": "green",  "value": 0.999 }
        ]
      }
    }
  }
}
```

### Panel 2: Fee Payer Balance (gauge)

```json
{
  "title": "Fee Payer SOL Balance",
  "type": "gauge",
  "targets": [{
    "expr": "solana_fee_payer_balance_sol",
    "legendFormat": "{{ address }}"
  }],
  "fieldConfig": {
    "defaults": {
      "unit": "short",
      "min": 0, "max": 10,
      "thresholds": {
        "steps": [
          { "color": "red",    "value": 0 },
          { "color": "yellow", "value": 0.5 },
          { "color": "green",  "value": 2 }
        ]
      }
    }
  }
}
```

### Panel 3: RPC Slot Lag (timeseries)

```promql
# PromQL for RPC slot lag panel
solana_rpc_slot_lag{job="solana-exporter"}
```

### Panel 4: Error Budget Burn Rate

```promql
# 1-hour burn rate vs monthly budget
(
  1 - (
    sum(rate(solana_transaction_total{status="success"}[1h])) /
    sum(rate(solana_transaction_total[1h]))
  )
) / (1 - 0.999)
# > 1.0 = burning faster than budget allows
# > 14.4 = will exhaust monthly budget in < 2 hours
```

---

## Dashboard Hierarchy (for multi-team setups)

```
L1 Executive  — SLO burn rate, monthly availability, P0 incidents/month
L2 Operations — tx rate, error rate, fee payer runway, indexer lag
L3 Technical  — CU usage by instruction, RPC latency p95/p99, slot lag
L4 On-call    — active alerts, runbook links, current P0/P1 count
```

---

## Grafana Import via API

```bash
# Import dashboard JSON via Grafana API
curl -X POST http://admin:${GRAFANA_PASSWORD}@localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d "{\"dashboard\": $(cat deploy/grafana/dashboards/solana-program-monitoring.json), \"overwrite\": true, \"folderId\": 0}"
```

---

## Grafana Dashboard Variables (Template)

```json
{
  "templating": {
    "list": [
      {
        "name": "cluster",
        "type": "custom",
        "options": [
          { "value": "mainnet-beta", "text": "Mainnet" },
          { "value": "devnet", "text": "Devnet" }
        ]
      },
      {
        "name": "program_id",
        "type": "query",
        "query": "label_values(solana_transaction_total, program_id)"
      }
    ]
  }
}
```

---

## Panel 5: Active Alerts Table

```json
{
  "title": "Active Alerts",
  "type": "table",
  "targets": [{
    "expr": "ALERTS{job=~\"solana.*\"}",
    "legendFormat": "{{ alertname }}"
  }],
  "transformations": [
    { "id": "filterByValue", "options": { "filters": [{ "fieldName": "Value", "config": { "operator": { "value": 1 } } }] } }
  ]
}
```

---

## Panel 6: Indexer Lag Heatmap

```promql
# Heatmap of indexer lag spikes over time
max_over_time(solana_indexer_lag_seconds[5m])
```

---

## Review Checklist Before Publishing

- [ ] All panels have units set (not raw numbers)
- [ ] All panels have thresholds set (red/yellow/green)
- [ ] Runbook links in alert annotations point to valid URLs
- [ ] No raw wallet addresses or API keys in panel queries
- [ ] Dashboard saved with version comment
