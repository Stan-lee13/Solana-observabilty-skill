# Observability Governance

This document defines ownership, change control, deprecation, and review processes for observability artifacts (metrics, dashboards, alerts, runbooks, and retention policies).

## Owners and Stewardship

- Each metric, dashboard, alert, and runbook must declare a single `owner` (team or individual) and at least one backup reviewer.
- Owners are responsible for quarterly reviews, on-call alignment, and responding to P0/P1 incidents.
- Owners must maintain a short README for their owned artifacts describing purpose, inputs, and upgrade path.

## Change Control Process

1. Open a PR describing the change and its impact on SLOs, cardinality, and cost.
2. Include CI validation evidence (promtool, Grafana JSON lint, Terraform plan where applicable).
3. Notify owners of dependent artifacts (dashboards, runbooks) via PR reviewers.
4. For critical alert or SLO changes, require at least two approvers: `sre-engineer` and `monitoring-engineer`.
5. Deploy changes from the repository; do not edit production dashboards directly in the Grafana UI.

## Deprecation & Backwards Compatibility

- Renaming a metric requires a 4-step deprecation: provide adapter (emit both names), update dashboards and alerts to use new name, monitor adapter for errors for at least one release, remove old name after a deprecation window (e.g., 90 days).
- Deprecation decisions must be documented in PR and include migration steps for external consumers.

## Review Cadence

- Quarterly review for SLOs, alerting thresholds, and retention policies.
- Immediate review after any P0 incident with follow-up action items.
- Annual review of providers and cost optimization plans.

## Audit & Compliance

- Maintain a changelog of monitoring-related PRs and reviewers.
- Store long-lived evidence (runbooks, postmortems) in this repository or approved document storage.
- Periodically (quarterly) export dashboard metadata and validate that required fields (`owner`, `audience`, `slo_links`) exist.

## Exceptions

- Rare emergency changes are allowed with post-facto PR and retrospective review.
- Any exception must be justified in the PR description and approved by on-call lead.

***

This governance file should be included in onboarding and used by reviewers to gate observability-related changes.


