# Runbook: RPC Degradation

## Severity

P1 when primary RPC slot lag >50 slots, endpoint is unhealthy, or user-facing transactions are impacted. P2 for latency-only degradation without user impact.

## Symptoms

- `solana_rpc_healthy == 0`
- `solana_slot_lag_slots > 50`
- RPC p95 latency >2.5s for 10 minutes
- Confirmation latency increases or blockhash expirations rise

## First 5 Minutes

1. Check Grafana RPC dashboard and Solana status.
2. Compare primary and backup endpoint aliases.
3. Verify whether failures are endpoint-specific or network-wide.
4. Fail over traffic if backup endpoint is healthy and current.
5. Escalate to provider support if provider-specific.

## PromQL

```promql
max by (endpoint) (solana_slot_lag_slots)
histogram_quantile(0.95, sum(rate(solana_rpc_request_duration_seconds_bucket[5m])) by (le, endpoint))
```

## Resolution Criteria

- All production endpoints have slot lag <10 for 10 minutes.
- p95 RPC latency returns below 1s or protocol baseline.
- Transaction success rate returns above SLO.
