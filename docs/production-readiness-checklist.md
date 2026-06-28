# Production Readiness Checklist

This document captures a comprehensive checklist to validate that observability, monitoring, and dashboard artifacts are production-ready. Use this as a gating checklist during launch, postmortems, and quarterly reviews.

## Owners and Contacts

- [ ] Owner declared in `owner` metadata for dashboards, alerts, and runbooks.
- [ ] On-call rotation assigned and contactable via PagerDuty/Slack.
- [ ] Escalation contacts (lead, director) listed in runbooks.

## SLOs, SLIs, and Error Budgets

- [ ] SLO defined with objective, window, and owner.
- [ ] SLI expression included (PromQL) with numerator and denominator.
- [ ] Error budget calculated and burn-rate thresholds defined.
- [ ] SLO and budget visible on executive & on-call dashboards.

## Metrics and Labels

- [ ] Metric names conform to canonical metric contract.
- [ ] Labels are bounded and privacy-safe.
- [ ] No wallet addresses, tx signatures, secrets, or raw RPC URLs as labels.
- [ ] Backward compatibility adapter exists when renaming metrics.

## Logging and Tracing

- [ ] Logs redact sensitive fields and use structured JSON.
- [ ] Traces sample strategy is documented and error traces are preserved.
- [ ] Required trace/span attributes are attached where safe.

## Health Checks and Heartbeats

- [ ] `/live`, `/ready`, `/healthz`, and `/metrics` endpoints implemented.
- [ ] Rate limiting and network restrictions applied to public endpoints.
- [ ] Heartbeat metrics for cron jobs, indexers, and webhooks exist and have alerts.

## Alerts and Runbooks

- [ ] Alerts map to user impact or funds risk.
- [ ] Alerts include `severity`, `owner`, `runbook_url`, and `dashboard_url`.
- [ ] Runbooks include first-5-minute actions and resolution criteria.
- [ ] Alert suppression for maintenance windows is configured.

## Dashboards and Visuals

- [ ] Audience declared for each dashboard (exec, ops, tech, on-call, public).
- [ ] SLOs, thresholds, and runbook links present in relevant panels.
- [ ] Dashboards are version-controlled and deployed from repo.
- [ ] Public dashboards sanitized and do not leak provider or treasury details.

## Synthetic and Canary Checks

- [ ] Synthetic checks for wallet connect, transaction simulation, and page load exist.
- [ ] Canary accounts used for synthetic transactions are low-value and documented.
- [ ] Synthetic checks cannot cause meaningful spend or state changes.

## Capacity, Cost, and Retention

- [ ] Prometheus retention & series budget documented.
- [ ] Grafana folders and retention rules set.
- [ ] Cost impact evaluated and approved.
- [ ] Sampling/retention strategies in place for logs and traces.

## CI and Validation

- [ ] `promtool check rules` runs in CI and passes.
- [ ] Grafana JSON lint/validation in CI.
- [ ] Runbook front-matter validation in CI.
- [ ] IaC plans (`terraform plan`) run in CI for infra changes.

## Security and Governance

- [ ] Secrets are stored in secret manager; not in repo or public envs.
- [ ] Grafana API keys and service tokens rotated on schedule.
- [ ] Dashboard and alert change owners verified; critical alerts require two reviewers.
- [ ] Public dashboards reviewed by security for information exposure.

## Operational Runability

- [ ] Playbooks exist for major failure scenarios (RPC outage, fee payer exhaustion, indexer lag).
- [ ] Contact lists and status pages included in runbooks.
- [ ] Postmortem process defined and linked in runbooks.

## Release and Post-Launch

- [ ] Monitoring changes deployed with release notes and changelog entries.
- [ ] SLOs and dashboards reviewed 1 week post-launch and quarterly thereafter.
- [ ] Any incident during launch has a retro and follow-up ticket assigned.

---

Use this checklist as a PR gate for observability-related changes and include a short checklist in PR descriptions for any alerts, dashboards, or monitoring code changes.


