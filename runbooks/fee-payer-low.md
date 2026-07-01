# Runbook: Fee Payer Balance Low

**Alert:** `FeePayerBalanceLow` | **Severity:** P1 → P0 if < 0.1 SOL
**Target resolution:** < 30 minutes | **Owner:** On-call SRE

---

## When this fires
- `solana_fee_payer_balance_sol < 0.5` sustained > 5 minutes
- Estimated runway < 24 hours at current transaction rate
- Automated top-up failed (no refill in > 72 hours)

---

## Immediate actions (do this first)

```bash
# 1. Check live balance and burn rate
FEE_PAYER="<FEE_PAYER_PUBKEY>"
solana balance $FEE_PAYER --url <RPC_URL>

# 2. Estimate runway
TX_PER_HR=$(curl -s -X POST <RPC_URL> \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"$FEE_PAYER\",{\"limit\":1000}]}" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")
BALANCE=$(solana balance $FEE_PAYER --url <RPC_URL> | awk '{print $1}')
# Runway hours ≈ balance / (tx_per_hr * 0.000005 avg fee)
python3 -c "print(f'Runway: {$BALANCE / ($TX_PER_HR * 0.000005):.1f} hours')"
```

---

## Diagnosis steps

| Symptom | Root cause | Fix |
|---|---|---|
| Balance low but refill automation healthy | Tx spike | Reduce tx rate or add fee payer pool |
| Refill automation not running | Automation down | Restart refill service (Step A) |
| Unexpected transactions from unknown callers | Fee payer leak | Audit signers — escalate if unknown |
| All tx succeeding but balance still dropping | Fee calculation wrong | Check avg fee vs estimated |

---

## Remediation

### Step A — Manual top-up (fastest)
```bash
# Transfer from treasury (use Squads if > threshold)
solana transfer <FEE_PAYER_PUBKEY> 5 \
  --from <TREASURY_KEYPAIR_PATH> \
  --url <RPC_URL>
# Target: ≥ 5 SOL (≥ 7 days runway at normal rate)
```

### Step B — Restart refill automation
```bash
systemctl restart <FEE_PAYER_REFILL_SERVICE>
sleep 10 && systemctl status <FEE_PAYER_REFILL_SERVICE>
```

### Step C — Add fee payer pool (if spikes are recurrent)
```typescript
// Rotate across 3 fee payers to avoid single-point exhaustion
const POOL = [keypair1, keypair2, keypair3];
let idx = 0;
const nextPayer = () => POOL[idx++ % POOL.length];
```

---

## Escalation
- Balance < 0.1 SOL → **P0** — page Protocol Lead immediately
- Unknown signers on fee payer → treat as drain → `runbooks/wallet-drain-detected.md`
- Refill automation broken and team unavailable → manual transfer from cold wallet

---

## Post-incident
- [ ] Root cause documented
- [ ] Refill threshold reviewed (consider raising P1 alert to 1 SOL)
- [ ] If spike: CU optimization reviewed to reduce tx count
