# Runbook: Wallet Drain Detected

**Alert:** `WalletDrainDetected` | **Severity:** P0 — ALL HANDS
**Target resolution:** Mitigate within 10 minutes | **Owner:** Protocol Lead + Security

---

## When this fires
- Unexpected large outflow from treasury or fee payer
- `solana_set_authority_instruction_total` spikes without planned operation
- Mint/freeze authority changes not initiated by team
- `UnexpectedOutflowSOL > <THRESHOLD>`

---

## Immediate actions (do this first)

```
1. PAGE: Protocol Lead, Security Lead, all engineers
2. Screenshot ALL wallet balances right now
3. Join war-room: <WAR_ROOM_CHANNEL>
4. DO NOT rotate keys from any machine that touched the compromised key
```

---

## Diagnosis steps

```bash
# Confirm drain is active
BEFORE=$(solana balance <TREASURY_PUBKEY> --url <RPC_URL>)
sleep 15
AFTER=$(solana balance <TREASURY_PUBKEY> --url <RPC_URL>)
[ "$BEFORE" != "$AFTER" ] && echo "DRAIN ACTIVE" || echo "Drain stopped"

# Find suspicious transactions
curl -s -X POST <RPC_URL> -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"<TREASURY_PUBKEY>\",{\"limit\":20}]}" \
  | python3 -c "
import json,sys
for s in json.load(sys.stdin)['result'][:5]:
    print(f'slot={s[\"slot\"]} | {s[\"signature\"][:30]}...')
"
```

---

## Remediation

### Step A — Stop the bleeding (use CLEAN machine)
```bash
# Transfer remaining funds to cold wallet immediately
solana transfer <COLD_WALLET_ADDRESS> ALL \
  --from <HOT_WALLET_KEYPAIR> \
  --url <RPC_URL> \
  --allow-unfunded-recipient
```

### Step B — Pause program via Squads
```
https://v3.squads.so → call set_paused(true) → collect 3-of-5 signatures → execute
Stops all program interactions while investigation proceeds
```

### Step C — Preserve evidence
```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir /tmp/incident-$TIMESTAMP
# Dump all recent tx signatures before chain prunes them
curl -s -X POST <RPC_URL> -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"<TREASURY_PUBKEY>\",{\"limit\":1000}]}" \
  > /tmp/incident-$TIMESTAMP/treasury-sigs.json
echo "Evidence at: /tmp/incident-$TIMESTAMP/"
```

---

## Escalation
- Drain confirmed → hand off to `solana-incident-response-skill/skill/wallet-security.md`
- Drain > $10K → notify legal counsel within 1 hour
- Drain > $100K → law enforcement consultation
- User funds impacted → SEC/CFTC notification obligation assessment

---

## Post-incident
- [ ] Drain amount and timeframe confirmed
- [ ] Attack vector identified
- [ ] All keys rotated on clean machines
- [ ] Community disclosure published within 24-72 hours
- [ ] New security controls implemented
