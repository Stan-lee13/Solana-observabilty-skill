# Release Checklist — Observability Stack

Run this checklist before every production deployment of the monitoring stack.

---

## Pre-Release (before deploying)

### Validate configuration files

```bash
# 1. Prometheus rules
promtool check rules deploy/alerts.yml
echo "Exit: $? (0=OK)"

# 2. Alertmanager config
amtool config routes show --config.file=deploy/alertmanager.yml
amtool config check --config.file=deploy/alertmanager.yml

# 3. Docker Compose syntax
docker compose -f deploy/docker-compose.yml config --quiet
echo "Exit: $? (0=OK)"

# 4. Prometheus config
docker run --rm -v $(pwd)/deploy:/etc/prometheus \
  prom/prometheus:latest \
  promtool check config /etc/prometheus/prometheus.yml
```

### Verify exporter is collecting correctly

```bash
# Spin up stack against devnet
SOLANA_CLUSTER=devnet docker compose -f deploy/docker-compose.yml up -d

# Wait for first scrape
sleep 15

# Confirm key metrics are present
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=solana_rpc_healthy' \
  | python3 -c "
import json,sys
r=json.load(sys.stdin)['data']['result']
print(f'solana_rpc_healthy: {\"✅ Present\" if r else \"❌ MISSING\"}')"

curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=solana_fee_payer_balance_sol' \
  | python3 -c "
import json,sys
r=json.load(sys.stdin)['data']['result']
print(f'solana_fee_payer_balance_sol: {\"✅ Present\" if r else \"❌ MISSING\"}')"
```

---

## Deployment

```bash
# Pull latest images and restart with zero-downtime rolling update
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --remove-orphans

# Verify all containers healthy
docker compose -f deploy/docker-compose.yml ps
```

---

## Post-Release (within 30 minutes)

- [ ] All containers show `healthy` status
- [ ] Prometheus targets page shows all jobs UP: http://localhost:9090/targets
- [ ] Grafana dashboards loading without errors: http://localhost:3000
- [ ] Test alert fires and routes to correct receiver
- [ ] Run e2e validation: `bash scripts/e2e-validate.sh`
- [ ] Confirm no alert noise (false positives) in first 15 minutes

```bash
# Quick health check post-deploy
curl -sf http://localhost:9090/-/healthy && echo "Prometheus: ✅"
curl -sf http://localhost:3000/api/health && echo "Grafana: ✅"
curl -sf http://localhost:9093/-/healthy && echo "Alertmanager: ✅"
curl -sf http://localhost:9090/metrics | grep -q "up 1" && echo "Exporter: ✅"
```

---

## Rollback

```bash
# If any check fails — rollback to previous image tags
docker compose -f deploy/docker-compose.yml down
git stash  # or: git checkout <previous-commit>
docker compose -f deploy/docker-compose.yml up -d
```

---

## Notification Test

```bash
# Fire a test alert through the full pipeline
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": { "alertname": "TestRelease", "severity": "info", "env": "staging" },
    "annotations": { "summary": "Release validation alert — ignore" },
    "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }]'
# Verify it appears in Discord/Slack within 60 seconds
# Then silence it:
amtool silence add alertname="TestRelease" --comment "Release test" \
  --duration 1h --alertmanager.url http://localhost:9093
```

---

## Rollback Decision Matrix

| Condition observed | Action |
|---|---|
| Exporter not scraping | Check container logs: `docker logs solana-exporter` |
| Alert rules not loading | `promtool check rules` output in CI was ignored — fix and redeploy |
| Grafana dashboards blank | Datasource URL wrong in provisioning — update `.env` and restart |
| Alertmanager not routing | Run `amtool config check` — fix YAML errors |
| Any P0 alert fires post-deploy | Rollback immediately, investigate in staging |
