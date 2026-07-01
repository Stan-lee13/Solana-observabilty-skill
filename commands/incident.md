# /obs incident

Start observability-driven incident response for a Solana production issue.

## Immediate Classification (60 seconds)

| Severity | Condition | Response |
|---|---|---|
| P0 | Funds at risk, total outage, authority compromise, tx failure > 10% | Wake everyone, pause program |
| P1 | Tx failure 2-10%, RPC degradation affecting users, indexer lag > 5m | Page on-call, start runbook |
| P2 | Elevated non-critical errors, degraded subset of users | Notify team, monitor |
| P3 | Informational anomaly | Log, monitor next 30m |

---

## Triage Script — Run First

```bash
#!/bin/bash
# scripts/triage.sh — run at incident start to snapshot all key metrics

RPC_URL="${RPC_URL:-https://api.mainnet-beta.solana.com}"
PROGRAM_ID="${1:-<PROGRAM_ID>}"
FEE_PAYER="${FEE_PAYER_PUBKEY:-<FEE_PAYER_PUBKEY>}"

echo "=== INCIDENT TRIAGE — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo ""

echo "── RPC Health ──"
curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('RPC:', d.get('result', d.get('error','unknown')))"

echo ""
echo "── Chain Slot ──"
SLOT=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result'])")
echo "Current slot: $SLOT"

echo ""
echo "── Fee Payer Balance ──"
solana balance "$FEE_PAYER" --url "$RPC_URL" 2>/dev/null || echo "Cannot reach RPC"

echo ""
echo "── Recent Program Failures (last 20 txs) ──"
curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"$PROGRAM_ID\",{\"limit\":20}]}" \
  | python3 -c "
import json,sys
from collections import Counter
sigs=json.load(sys.stdin)['result']
failed=[s for s in sigs if s.get('err')]
errs=Counter(str(s['err']) for s in failed)
print(f'Failed: {len(failed)}/{len(sigs)}')
for e,n in errs.most_common(3): print(f'  {n}x  {e}')
"

echo ""
echo "── Program Info ──"
solana program show "$PROGRAM_ID" --url "$RPC_URL" 2>/dev/null | grep -E "Authority|Last Deployed"

echo ""
echo "=== Triage complete. Classify severity and load matching runbook. ==="
```

---

## Runbook Lookup

```bash
# Quickly find the right runbook for your alert
declare -A RUNBOOKS=(
  ["rpc"]="runbooks/rpc-degradation.md"
  ["fee"]="runbooks/fee-payer-low.md"
  ["indexer"]="runbooks/indexer-lag.md"
  ["tx"]="runbooks/transaction-success-rate-low.md"
  ["upgrade"]="runbooks/program-upgrade-detected.md"
  ["wallet-error"]="runbooks/wallet-error-spike.md"
  ["drain"]="runbooks/wallet-drain-detected.md"
)
# Usage: echo ${RUNBOOKS["drain"]}
```

---

## War Room Setup

```bash
# Post to incident channel immediately (Slack/Discord template)
cat << TEMPLATE
🚨 INCIDENT DECLARED — $(date -u +%Y-%m-%dT%H:%M:%SZ)
Severity: P<N>
Issue: <one-line description>
Impact: <what users see>
Runbook: <link>
Incident Commander: @<name>
Next update: in 15 minutes
TEMPLATE
```
