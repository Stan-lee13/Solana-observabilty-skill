# Runbook: Program Upgrade Detected

## Severity

P0 for unexpected program data hash, upgrade authority, mint authority, freeze authority, or metadata authority change.

## Symptoms

- `solana_program_upgrade_detected_total` increases
- deploy annotation absent or does not match expected window
- new transaction failures begin after upgrade slot

## First 5 Minutes

1. Confirm program ID and cluster.
2. Verify expected deploy approval and multisig transaction.
3. Compare program data hash to release artifact.
4. Check upgrade authority against expected authority inventory.
5. If unexpected, escalate to incident response and prepare pause/containment.

## Evidence

Preserve program data account, slot, signature, authority, deploy commit, and dashboard annotation.

## Resolution Criteria

- Upgrade is verified as authorized or incident containment is active.
- Transaction success and program error rates are stable.
- Authority inventory is updated.
