# /obs alert-setup

Configure production alerting rules, routing, and runbook links for a Solana protocol.

## Inputs Required

- Protocol name and owner
- Cluster: `mainnet-beta`, `devnet`, or both
- Program IDs and critical instructions
- RPC endpoint aliases, not raw URLs
- SLO targets or approval to use defaults
- Notification targets: PagerDuty, Slack, Discord, Opsgenie
- Runbook base URL

## Procedure

1. Define SLOs and SLIs from `rules/monitoring-rules.md`.
2. Map each P0/P1 alert to user impact, funds risk, or error-budget burn.
3. Generate Prometheus rules using canonical metrics.
4. Add labels: `severity`, `service`, `owner`, `slo`, `runbook_url`, `dashboard_url`.
5. Add Alertmanager routing and inhibition rules.
6. Link every P0/P1 alert to a runbook.
7. Test with a synthetic threshold before production.

## Required Alerts

- Transaction success rate low
- Error budget fast burn
- RPC endpoint down
- RPC slot lag high
- Indexer lag high
- Fee payer balance low
- Program upgrade detected
- Authority anomaly detected
- Webhook ingest lag high

## Output

Return alert rules, routing config, runbook links, and a validation checklist.
