# Runbook: Indexer Lag

## Severity

P1 when indexer lag exceeds 5 minutes for user-facing balances, claims, or status. P2 for non-critical analytics lag.

## Symptoms

- `solana_indexer_lag_seconds > 300`
- UI shows stale balances or claim state
- webhook delivery errors or queue depth increases

## First 5 Minutes

1. Compare finalized chain slot to latest indexed slot.
2. Check webhook receiver health and backlog.
3. Check database writes and queue workers.
4. Mark UI data as stale via UX/status page if user-facing.
5. Scale workers or pause non-critical indexing jobs.

## Resolution Criteria

- Lag remains below 60 seconds for 15 minutes.
- Stale-data UI banner is removed only after freshness is verified.
- Missing events are replayed or reconciled.
