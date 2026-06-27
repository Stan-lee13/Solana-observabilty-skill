# /obs incident

Start observability-driven incident response for a Solana production issue.

## Immediate Classification

Classify severity within 60 seconds:

- P0: funds at risk, total outage, authority compromise, tx failure >10%
- P1: tx failure 2-10%, RPC degradation affecting users, indexer lag >5m
- P2: elevated non-critical errors or degraded cohort
- P3: informational anomaly

## Evidence Packet

Collect:

- Dashboard and panel URL
- UTC time range and first bad slot
- Metric, observed value, and threshold
- Top contributing instruction, endpoint, pool, mint, or node cohort
- Recent deploy, TGE, or program upgrade annotations
- Sample signatures for investigation only

## Procedure

1. Hand off P0/P1 to `incident-commander`.
2. Preserve logs, traces, and dashboard snapshots.
3. Confirm user impact before broad communication.
4. Track mitigation against explicit resolution criteria.
5. Generate post-incident monitoring actions.

## Output

Return severity, timeline, suspected blast radius, evidence, and next command.
