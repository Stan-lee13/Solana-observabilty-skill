# Runbook: Wallet Drain Detected

## Severity

P0 if drain is active. P1 if drain pattern is suspected but not confirmed.

## Symptoms

- `solana_set_authority_instruction_total` spikes unexpectedly
- Users reporting sudden balance loss after dApp interaction
- `solana_synthetic_blinks_program_mismatch_total > 0` (drainer in Blinks action)
- Wallet error logs show `SetAuthority` or bulk `transferChecked` from user accounts
- Multiple Discord/Twitter reports of "my wallet was emptied"
- Frontend release, CDN change, or DNS update preceded reports

## First 5 Minutes

1. Confirm: are funds being drained through your legitimate domain or a phishing site?
2. Check frontend deployment logs — what changed in the last 24h?
3. Reproduce: connect a blank devnet wallet and inspect transaction instructions being built
4. Check `solana_set_authority_instruction_total` in Grafana — spike = drainer active

## PromQL

```promql
# SetAuthority spike (drainer signal)
rate(solana_set_authority_instruction_total[5m])

# Watchlist wallet interaction
increase(solana_watchlist_wallet_hit_total[5m])

# Blinks program mismatch (drainer in action)
solana_synthetic_blinks_program_mismatch_total
```

## Containment (If Your Frontend Is Serving Drainer Transactions)

```
[ ] Take frontend OFFLINE immediately (Vercel: disable deployment / Netlify: lock)
[ ] Post on all official channels: "Investigating an issue — do NOT sign transactions"
[ ] Do NOT specify the nature of the issue publicly yet
[ ] Load skill/wallet-security.md → Drainer Detection section
[ ] Escalate to incident-response-skill: load agents/comms-director.md
[ ] Audit git history: check commits and deploy hooks in last 48 hours
[ ] Rotate all deploy keys, CI secrets, DNS credentials
[ ] Alert exchanges with token address to watch for drainer proceeds
```

## User Recovery Guidance (After Containment)

```
1. Visit https://revoke.cash or https://solanatools.xyz — revoke any token approvals
2. If SetAuthority was called on your token accounts → create a new wallet (ownership is transferred)
3. If only tokens were drained via delegate approval → revoke + move remaining assets
4. Report transaction signatures to security@solana.org and Chainalysis for tracing
```

## Cross-Skill Escalation

Load `solana-incident-response-skill/skill/wallet-security.md` for:
- Drainer contract analysis
- Authority rotation procedures
- Post-incident user communication templates

## Resolution Criteria

- Drainer source removed (compromised frontend taken offline)
- Clean deployment verified and live
- Affected users notified with recovery instructions
- Token approval revoke guide published
- Root cause of frontend compromise documented
- Post-mortem filed in `solana-incident-response-skill`
