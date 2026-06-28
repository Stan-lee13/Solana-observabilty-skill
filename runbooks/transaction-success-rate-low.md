# Runbook: Transaction Success Rate Low

## Severity

P0 when transaction failure rate exceeds 10% for 5 minutes or funds are at risk. P1 when failure rate is 2-10% for 10 minutes.

## Symptoms

- `solana_transaction_total{status="failed"}` increases sharply
- users report failed claims, swaps, stakes, or confirmations
- program error table shows one instruction dominating failures

## First 5 Minutes

1. Classify failure: simulation, program error, RPC error, timeout, or wallet error.
2. Check recent deploy, program upgrade, IDL change, and TGE annotations.
3. Compare priority fee p95 and RPC slot lag.
4. Identify top failing instruction and error class.
5. Escalate to `incident-commander` for P0/P1.

## PromQL

```promql
sum(rate(solana_transaction_total{status="failed"}[5m])) / clamp_min(sum(rate(solana_transaction_total[5m])), 1)
```

## Resolution Criteria

- Success rate returns above 99.5% or protocol SLO for 15 minutes.
- Failure class is understood and mitigated.
- Post-incident monitoring gap is filed if detection was late.


