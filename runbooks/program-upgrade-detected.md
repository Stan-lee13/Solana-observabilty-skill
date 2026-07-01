# Runbook: Program Upgrade Detected

**Alert:** `ProgramUpgradeDetected` | **Severity:** P0 if unplanned; P2 if planned
**Target resolution:** P0 → pause within 15 min | **Owner:** Protocol Lead + Security

---

## When this fires
- `solana_program_upgrade_detected_total` counter increases
- Program data hash differs from last known-good hash
- Upgrade authority changed to unexpected pubkey

---

## Immediate actions (do this first)

```bash
# 1. Verify upgrade authority
solana program show <PROGRAM_ID> --url <RPC_URL>
# "Authority" field must match <EXPECTED_UPGRADE_AUTHORITY>

# 2. Check program data hash
solana program dump <PROGRAM_ID> /tmp/current.so --url <RPC_URL>
sha256sum /tmp/current.so
# Compare to expected: <EXPECTED_PROGRAM_HASH>
```

**If hash matches expected AND this was a planned upgrade → Step A (verify)**
**If hash is unexpected → P0 → Step B (emergency)**

---

## Diagnosis steps

| Finding | Action |
|---|---|
| Planned upgrade, hash correct | Step A — verify and close |
| Unplanned, authority unchanged | Investigate who deployed |
| Authority changed to unknown wallet | Key compromise — Step B immediately |
| Hash differs, team has no record | Step B — treat as malicious |

---

## Remediation

### Step A — Verify planned upgrade
```bash
# Run smoke tests
cd <PROJECT_ROOT>
anchor test --skip-local-validator -- --grep "smoke"
npx ts-node scripts/smoke-test.ts --rpc <RPC_URL>
# If tests pass: close alert, update hash record
echo "<NEW_HASH>" > <EXPECTED_HASH_FILE>
```

### Step B — Unplanned upgrade — Emergency
```bash
# 1. IMMEDIATELY pause via Squads 3-of-5
#    https://v3.squads.so → call set_paused(true) on <PROGRAM_ID>

# 2. Preserve evidence
solana program dump <PROGRAM_ID> /tmp/UNKNOWN-$(date +%Y%m%d-%H%M%S).so --url <RPC_URL>
sha256sum /tmp/UNKNOWN-*.so > /tmp/evidence.txt

# 3. Find the upgrade transaction
solana program show <PROGRAM_ID> --url <RPC_URL> | grep "Last Deployed In Slot"
# Then inspect that slot for upgrade instructions

# 4. Broadcast immediately:
# "⚠️ Unauthorized program change detected. All operations paused. Investigating."
```

---

## Escalation
- Unplanned upgrade → P0 — page Protocol Lead AND Security Lead
- Upgrade authority changed → key compromise → full incident response
- Users impacted → status page update within 15 min

---

## Post-incident (planned)
- [ ] New hash recorded in deployment log
- [ ] IDL updated and published
- [ ] Smoke tests passed and documented

## Post-incident (unplanned)
- [ ] Full forensic analysis — how was authority obtained?
- [ ] Community post-mortem published within 72 hours
- [ ] Upgrade authority moved to immutable Squads multisig

---

## Forensic Transaction Trace

When an unplanned upgrade is confirmed, use this to identify the signer and timing:

```bash
#!/bin/bash
# Forensic trace — find who deployed the program upgrade

PROGRAM_ID="${1:-<PROGRAM_ID>}"
RPC_URL="${RPC_URL:-<RPC_URL>}"

echo "=== FORENSIC TRACE: Program Upgrade ==="
echo "Program: $PROGRAM_ID"
echo ""

# Get program data account (where upgrade slot is stored)
PROGRAM_DATA=$(solana program show "$PROGRAM_ID" --url "$RPC_URL" \
  | grep "ProgramdataAddress" | awk '{print $2}')
echo "ProgramData account: $PROGRAM_DATA"

# Get most recent transactions on the program data account (upgrade transactions)
echo ""
echo "Recent program data account transactions:"
curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"$PROGRAM_DATA\",{\"limit\":5}]}" \
  | python3 -c "
import json,sys
sigs=json.load(sys.stdin)['result']
for s in sigs:
    print(f'  slot={s[\"slot\"]} | sig={s[\"signature\"]}')
"

# Inspect the most recent transaction for upgrade instruction + signer
RECENT_SIG=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"$PROGRAM_DATA\",{\"limit\":1}]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result'][0]['signature'])")

echo ""
echo "Upgrade transaction: $RECENT_SIG"
echo "Inspect at: https://solscan.io/tx/$RECENT_SIG"

solana confirm -v "$RECENT_SIG" --url "$RPC_URL" 2>/dev/null | grep -E "Account|Signer|Program"
```

---

## Hash Tracking Automation

```bash
# Add to cron — check program hash every 5 minutes and alert on change
# crontab: */5 * * * * /opt/scripts/check-program-hash.sh >> /var/log/program-hash.log 2>&1

#!/bin/bash
EXPECTED_HASH=$(cat /opt/config/expected-program-hash.txt)
solana program dump <PROGRAM_ID> /tmp/current-check.so --url <RPC_URL> 2>/dev/null
CURRENT_HASH=$(sha256sum /tmp/current-check.so | awk '{print $1}')
if [ "$CURRENT_HASH" != "$EXPECTED_HASH" ]; then
  echo "$(date -u) ALERT: Program hash changed! Expected=$EXPECTED_HASH Current=$CURRENT_HASH"
  # Trigger PagerDuty / webhook here
fi
rm -f /tmp/current-check.so
```
