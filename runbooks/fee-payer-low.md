# Runbook: Fee Payer Balance Low

## Severity

P1 when fee payer balance drops below 0.5 SOL or runway is less than 24 hours for critical flows.

## Symptoms

- `solana_fee_payer_balance_sol < 0.5`
- account creation or sponsored transactions fail
- `InsufficientFundsForFee` or rent-exemption errors increase

## First 5 Minutes

1. Confirm account alias and cluster.
2. Check current spend rate and runway.
3. Refill from approved treasury process if authorized.
4. Verify no unexplained outflow or compromised fee payer.
5. Add incident response if outflow is suspicious.

## Resolution Criteria

- Balance is above protocol-defined safe threshold.
- Runway exceeds 7 days or launch-specific requirement.
- No suspicious outflow remains unexplained.


