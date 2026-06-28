# /obs dashboard

Build or review a Solana observability dashboard.

## Routing

Use `visualization-engineer` first for dashboard architecture. Use
`data-viz-engineer` only after the dashboard audience, hierarchy, thresholds,
visibility, and data sources are approved.

## Inputs Required

- Audience: executive, operational, technical, on-call, or public
- Cluster and program IDs
- Data sources: Prometheus, Loki, Tempo, Dune, Helius, warehouse
- SLOs and alert thresholds
- Public/private visibility classification
- Required runbook links

## Procedure

1. Define the dashboard decision: page, diagnose, report, or communicate.
2. Choose top-row health panels.
3. Add trend panels with thresholds and deploy annotations.
4. Add drill-down tables for errors, endpoints, instructions, or cohorts.
5. Verify freshness, denominator, and zero-traffic handling.
6. Generate Grafana JSON or implementation brief.
7. Add the dashboard to version control.

## Output

Return dashboard architecture, panel list, PromQL queries, and review checklist.


