# Release Checklist

Use this checklist before publishing or installing a new version of the Solana observability skill.

## Repository Quality

- [ ] No TODOs, fake dashboard IDs, or accidental example credentials.
- [ ] Agent routing in `CLAUDE.md`, `README.md`, and `skill/SKILL.md` is consistent.
- [ ] Metric names match `rules/monitoring-rules.md`.
- [ ] P0/P1 alerts link to runbooks.
- [ ] Public examples do not expose API-key-bearing RPC URLs.
- [ ] Dashboard JSON is committed and validates.

## Deploy Stack

- [ ] `docker compose config` passes in `deploy/`.
- [ ] Exporter image builds.
- [ ] Exporter `/live`, `/ready`, `/healthz`, and `/metrics` respond.
- [ ] Prometheus loads `prometheus.yml` and `alerts.yml`.
- [ ] Grafana provisions datasource and dashboard.
- [ ] No default secret is suitable for production; README calls this out.

## Validation Commands

```bash
python -m json.tool deploy/grafana/dashboards/solana-infrastructure.json
cd deploy/solana-exporter && npm install && npm run build
cd ../.. && docker compose -f deploy/docker-compose.yml config
```

If available:

```bash
promtool check config deploy/prometheus.yml
promtool check rules deploy/alerts.yml
```

## Release Notes

Document changes to:

- metric names or labels
- alert thresholds or severities
- runbook procedures
- dashboard visibility
- install path or deploy stack
- external provider recommendations
