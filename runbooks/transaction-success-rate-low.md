# Runbook: Transaction Success Rate Low

**Alert:** `TxSuccessRateLow` | **Severity:** P0 if > 10% failure for 5+ min
**Target resolution:** < 20 minutes | **Owner:** On-call SRE

---

## When this fires
- `solana_tx_success_rate_5m < 0.90` (< 90% success)
- `solana_transaction_total{status="failed"}` sharply increasing
- User reports: "tx stuck", "blockhash not found", "simulation failed"

---

## Immediate actions (do this first)

```bash
# Identify failure classes from recent txs
curl -s -X POST <RPC_URL> -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getSignaturesForAddress\",
       \"params\":[\"<PROGRAM_ID>\",{\"limit\":50}]}" \
  | python3 -c "
import json,sys
from collections import Counter
sigs=json.load(sys.stdin)['result']
failed=[s for s in sigs if s.get('err')]
errs=Counter(str(s['err']) for s in failed)
print(f'Failed: {len(failed)}/{len(sigs)}')
for e,n in errs.most_common(5): print(f'  {n}x {e}')
"
```

---

## Diagnosis steps

| Error | Root cause | Fix |
|---|---|---|
| `BlockhashNotFound` | Blockhash expired before landing | Step A |
| `InsufficientFundsForFee` | Fee payer low | → `runbooks/fee-payer-low.md` |
| `ComputeBudgetExceeded` | CU limit too low | Step B |
| `custom program error: 0x...` | Program logic rejection | Step C |
| `TransactionTooLarge` | Tx > 1232 bytes | Step D |

---

## Remediation

### Step A — BlockhashNotFound: add retry with fresh blockhash
```typescript
async function sendWithRetry(connection: Connection, tx: Transaction, signers: Keypair[]): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);
    try {
      const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 0 });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return sig;
    } catch(e: any) {
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Step B — ComputeBudgetExceeded: raise CU limit
```typescript
import { ComputeBudgetProgram } from '@solana/web3.js';
// Add as FIRST instructions
tx.instructions = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
  ...tx.instructions,
];
```

### Step C — Program error: check simulation
```typescript
const sim = await connection.simulateTransaction(tx, { replaceRecentBlockhash: true });
if (sim.value.err) {
  const errLine = sim.value.logs?.find(l => l.includes('Error') || l.includes('failed'));
  console.error('Simulation failed:', errLine ?? JSON.stringify(sim.value.err));
}
```

### Step D — TransactionTooLarge: split instructions
```typescript
// Split tx into multiple if > 1200 bytes
const MAX_TX_BYTES = 1200;
const serialized = tx.serialize({ requireAllSignatures: false });
if (serialized.length > MAX_TX_BYTES) {
  // Split instructions into 2 transactions
}
```

---

## Escalation
- Error rate > 50% sustained → P0, pause user-facing operations
- Program-specific errors → pull program dev on-call
- Network-wide issues → check https://status.solana.com

---

## Post-incident
- [ ] Error distribution by type documented
- [ ] Retry logic added to all tx paths that lacked it
- [ ] CU budgets profiled with `solana-program-profiler` if CU errors recurred
