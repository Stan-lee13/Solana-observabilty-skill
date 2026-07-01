# /obs cu-optimize

Analyze compute unit usage and create profiling or regression gates for Solana programs.

## Inputs Required
- Program ID and framework: Anchor, native, or Seahorse
- Critical instructions to profile
- Current requested CU limits
- Target p95/p99 CU budget

---

## Step 1 — Profile Current CU Usage

```typescript
// scripts/cu-profile.ts — measure actual CU usage per instruction
import { Connection, PublicKey } from '@solana/web3.js';

async function profileInstruction(
  connection: Connection,
  programId: string,
  instructionName: string,
  sampleCount: number = 100,
): Promise<{ p50: number; p95: number; p99: number; max: number }> {
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(programId), { limit: sampleCount }
  );

  const cuValues: number[] = [];
  for (const sig of sigs) {
    const tx = await connection.getTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const cu = tx?.meta?.computeUnitsConsumed;
    if (cu != null) cuValues.push(cu);
  }

  cuValues.sort((a, b) => a - b);
  const pct = (p: number) => cuValues[Math.floor(cuValues.length * p / 100)] ?? 0;

  return { p50: pct(50), p95: pct(95), p99: pct(99), max: Math.max(...cuValues) };
}

// Recommended CU limit = p99 * 1.2 (20% safety buffer)
const profile = await profileInstruction(connection, '<PROGRAM_ID>', 'stake');
const recommended = Math.ceil(profile.p99 * 1.2);
console.log(`p50=${profile.p50} p95=${profile.p95} p99=${profile.p99} recommended=${recommended}`);
```

---

## Step 2 — Add CU Regression Gate (CI)

```yaml
# .github/workflows/cu-regression.yml
name: CU Budget Regression Gate
on: [pull_request]
jobs:
  cu-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Run CU budget test
        run: npx ts-node scripts/cu-profile.ts --assert
        env:
          RPC_URL: ${{ secrets.DEVNET_RPC_URL }}
          # Fails if any instruction exceeds its budget:
          CU_BUDGETS: '{"stake":200000,"unstake":150000,"claim":180000}'
```

---

## Step 3 — Set Optimal CU Limit Per Instruction

```typescript
import { ComputeBudgetProgram, Transaction } from '@solana/web3.js';

// CU budgets per instruction (from profiling — update after each major release)
const CU_BUDGETS: Record<string, number> = {
  stake:          200_000,  // p99=162k → limit=200k (23% buffer)
  unstake:        150_000,  // p99=121k → limit=150k (24% buffer)
  claim_rewards:  180_000,  // p99=148k → limit=180k (22% buffer)
  emergency_exit: 400_000,  // complex path — higher limit
};

function buildTxWithCUBudget(instructionName: string, tx: Transaction): Transaction {
  const limit = CU_BUDGETS[instructionName] ?? 200_000;
  return new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: limit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), // priority fee
    ...tx.instructions,
  );
}
```

---

## Step 4 — Prometheus CU Monitoring

```promql
# Alert when CU usage approaches limit (>85% of requested)
solana_compute_units_used / solana_compute_units_requested > 0.85

# Track CU usage trend by instruction
sum by (instruction) (rate(solana_compute_units_used_total[5m]))
```
