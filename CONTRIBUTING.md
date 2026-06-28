# Contributing

## Review Standard

Contributions must preserve production-readiness. This repository is used to generate monitoring code, incident workflows, dashboards, and operational guidance for Solana protocols.

Before opening a pull request:

- Run markdown, JSON, YAML, and TypeScript validation where applicable.
- Verify no placeholders, TODOs, fake dashboard IDs, or secret-bearing examples remain.
- Keep metric names aligned with `rules/monitoring-rules.md`.
- Add or update runbooks for new P0/P1 alerts.
- Add dashboard ownership, audience, and freshness guidance for new dashboards.
- Avoid duplicate agent responsibilities.

## Required Checks

```bash
python -m json.tool deploy/grafana/dashboards/solana-infrastructure.json
python -c "import yaml, pathlib; [yaml.safe_load(p.read_text()) for p in pathlib.Path('deploy').glob('*.yml')]"
cd deploy/solana-exporter && npm install && npm run build
```

If `promtool` is installed:

```bash
promtool check config deploy/prometheus.yml
promtool check rules deploy/alerts.yml
```

## Documentation Style

- Be Solana-specific.
- Name concrete metrics, thresholds, and tools.
- Prefer bounded labels and safe examples.
- Explain public vs internal visibility.
- Link alerts to runbooks.

## Agent Boundaries

- `visualization-engineer`: dashboard architecture and governance.
- `data-viz-engineer`: concrete Grafana/PromQL/React artifacts.
- `monitoring-engineer`: exporters, health endpoints, instrumentation.
- `sre-engineer`: alert rules, routing, runbooks.
- `incident-commander`: production triage and root cause.


