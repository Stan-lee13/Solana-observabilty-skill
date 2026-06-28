# Runbook: Wallet Error Spike

## Severity

P2 for wallet adapter errors affecting a subset of users. P1 if claim, swap, or signing flows are broadly blocked. P0 if wallet-drain behavior is suspected.

## Symptoms

- wallet error counter spikes by adapter or error class
- users report unexpected signing prompts
- transaction simulation differs from UI intent
- frontend release or dependency change occurred recently

## First 5 Minutes

1. Identify affected wallet adapters and flow.
2. Check whether retries are safe.
3. If drain risk is possible, escalate to incident response immediately.
4. Ask UX skill for safe error copy or safe-mode state.
5. Roll back recent frontend release if correlated.

## Resolution Criteria

- Wallet error rate returns to baseline.
- Affected flow conversion recovers.
- Safe-mode or warning banner is removed only after incident commander approval for security issues.


