# Program CU Profiling & Compute Intelligence

The gap no tool fills: knowing exactly how many compute units each instruction costs,
which CPIs are eating your budget, and whether a code change just pushed you toward the 1.2M limit.

This is NOT monitoring CU at runtime (see `program-monitoring.md`).
This is: **analyze my program's source code and tell me where the CUs go**.

---

## Why This Matters

The 1.2M CU limit is a hard ceiling. Hit it and your transaction fails — not degrades, fails.
Most teams only discover their CU problem when a user files a bug report.

**Common failure pattern:**
1. Program works in testing (simple state, no load)
2. Goes to mainnet with real accounts
3. CU usage grows as accounts fill up (deserialization cost scales with account size)
4. A complex composite instruction hits the limit under real conditions
5. Users get unexplained failures

---

## The compute_fn Profiling Pattern

Anchor provides `compute_fn!` for inline CU measurement. Use it everywhere during development.

```rust
// In your Anchor program — measure CU cost of specific sections
use anchor_lang::prelude::*;

// Macro that logs CU before and after a block
macro_rules! compute_fn {
    ($msg:expr=> $($tt:tt)*) => {{
        msg!(concat!($msg, " {"));
        msg!("CU BEFORE: {:?}", std::mem::size_of::<u64>()); // Solana 1.18+
        let out = { $($tt)* };
        msg!(concat!("} // ", $msg));
        out
    }};
}

#[program]
pub mod my_protocol {
    use super::*;

    pub fn complex_instruction(ctx: Context<ComplexCtx>, amount: u64) -> Result<()> {
        compute_fn!("deserialization" => {
            // Account deserialization already happened above
            // But expensive validation starts here
            let vault = &ctx.accounts.vault;
            require!(vault.is_initialized, ErrorCode::VaultNotReady);
        });

        compute_fn!("price_calculation" => {
            let price = calculate_price(&ctx.accounts.oracle)?;
            // Oracle reads are expensive — ~5,000 CU per read
        });

        compute_fn!("cpi_transfer" => {
            // CPI calls are expensive: base cost + called program's cost
            transfer_tokens(ctx, amount)?;
        });

        Ok(())
    }
}
```

---

## CU Cost Reference Table (Solana 2026)

Use this to estimate and audit your instructions:

| Operation | Approximate CU Cost |
|-----------|---------------------|
| Account deserialization (per 32 bytes) | ~25 CU |
| `invoke` (CPI base) | ~1,000 CU |
| `invoke_signed` (CPI with PDA) | ~1,500 CU |
| SHA256 hash (per 32 bytes) | ~85 CU |
| Ed25519 signature verify | ~10,000 CU |
| Secp256k1 signature verify | ~15,000 CU |
| `sol_log` (msg!) per call | ~100 CU |
| Account key comparison (Pubkey eq) | ~15 CU |
| Token transfer (via SPL CPI) | ~4,000–6,000 CU |
| NFT mint (Metaplex Core) | ~30,000–60,000 CU |
| Oracle read (Pyth CPI) | ~5,000–8,000 CU |
| Large account write (per 1KB) | ~200 CU |
| **Program budget cap** | **1,200,000 CU** |
| Recommended max per instruction | ~800,000 CU (leave headroom) |

---

## Automated CU Profiling in LiteSVM Tests

Run CU profiling as part of your test suite — catch regressions before mainnet.

```rust
// tests/cu_profile.rs
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};

struct CUProfile {
    instruction_name: String,
    cu_used: u64,
    cu_limit: u64,
    headroom_pct: f64,
}

impl CUProfile {
    fn from_meta(name: &str, meta: &litesvm::types::TransactionMetadata, limit: u64) -> Self {
        let used = meta.compute_units_consumed;
        Self {
            instruction_name: name.to_string(),
            cu_used: used,
            cu_limit: limit,
            headroom_pct: ((limit - used) as f64 / limit as f64) * 100.0,
        }
    }

    fn assert_within_budget(&self) {
        assert!(
            self.cu_used <= self.cu_limit,
            "{}: {} CU used exceeds {} limit",
            self.instruction_name,
            self.cu_used,
            self.cu_limit
        );
    }

    fn warn_if_tight(&self) {
        if self.headroom_pct < 20.0 {
            eprintln!(
                "⚠️  CU WARNING: {} uses {} of {} CU ({:.1}% headroom — consider optimizing)",
                self.instruction_name,
                self.cu_used,
                self.cu_limit,
                self.headroom_pct
            );
        } else {
            println!(
                "✅ {}: {} CU ({:.1}% headroom)",
                self.instruction_name,
                self.cu_used,
                self.headroom_pct
            );
        }
    }
}

#[test]
fn profile_complex_instruction_cu() {
    let mut svm = LiteSVM::new();
    // ... setup accounts, fund payers, deploy program ...

    let ix = Instruction {
        program_id: MY_PROGRAM_ID,
        accounts: vec![/* your accounts */],
        data: my_program::instruction::ComplexInstruction { amount: 1_000_000 }
            .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[
            solana_sdk::compute_budget::ComputeBudgetInstruction::set_compute_unit_limit(800_000),
            ix,
        ],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    let meta = svm.send_transaction(tx).expect("transaction failed");

    let profile = CUProfile::from_meta("complex_instruction", &meta, 800_000);
    profile.assert_within_budget();
    profile.warn_if_tight();

    // Regression gate: if CU increases by more than 5%, fail the test
    let baseline_cu: u64 = 245_000; // Committed baseline from last audit
    let regression_threshold = (baseline_cu as f64 * 1.05) as u64;
    assert!(
        meta.compute_units_consumed <= regression_threshold,
        "CU REGRESSION: {} used {} CU, baseline was {} (+{:.1}%)",
        "complex_instruction",
        meta.compute_units_consumed,
        baseline_cu,
        ((meta.compute_units_consumed as f64 - baseline_cu as f64) / baseline_cu as f64) * 100.0
    );
}
```

---

## CU Regression Detection in CI

Add to your `.github/workflows/cu-profile.yml`:

```yaml
name: CU Budget Profiling

on:
  pull_request:
    paths:
      - 'programs/**'

jobs:
  profile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Run CU profile tests
        run: cargo test --test cu_profile -- --nocapture 2>&1 | tee cu_profile_output.txt

      - name: Parse CU results
        run: |
          # Extract CU numbers and compare to baseline
          python3 scripts/cu_regression_check.py cu_profile_output.txt cu_baselines.json

      - name: Comment PR with CU breakdown
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('cu_results.json'));
            const table = results.map(r =>
              `| ${r.name} | ${r.cu_used} | ${r.baseline} | ${r.delta > 0 ? '🔴' : '✅'} ${r.delta > 0 ? '+' : ''}${r.delta} |`
            ).join('\n');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## CU Budget Report\n| Instruction | CU Used | Baseline | Change |\n|---|---|---|---|\n${table}`
            });
```

---

## High-CU Instruction Redesign Patterns

When an instruction is too expensive, these patterns reduce cost:

### Pattern 1: Split Composite Instructions
```rust
// ❌ One instruction doing 3 things = 3x CPI cost
pub fn mint_stake_and_notify(ctx: Context<...>) -> Result<()> {
    mint_nft(ctx)?;       // 50,000 CU
    stake_nft(ctx)?;      // 30,000 CU
    notify_holders(ctx)?; // 40,000 CU
    Ok(())                // Total: 120,000 CU — risky
}

// ✅ Three instructions in one transaction — each under budget
// Client sends: [mint_nft, stake_nft, notify_holders] in one tx
// Max CU per instruction: 50,000 — safe
```

### Pattern 2: Lazy Account Initialization
```rust
// ❌ Initialize + operate in one instruction (doubles account write CU)
pub fn create_and_deposit(ctx: Context<...>, amount: u64) -> Result<()> {
    ctx.accounts.vault.initialize()?; // Writes full struct
    ctx.accounts.vault.deposit(amount)?; // Writes full struct again
    Ok(())
}

// ✅ Separate init from operation
// Client sends init tx once, then operates every time
```

### Pattern 3: Reduce Account Deserialization
```rust
// ❌ Loading a 1KB account just to read one field
let full_state = &ctx.accounts.large_state; // Deserializes 1KB
let value = full_state.small_field;

// ✅ Use AccountInfo + manual offset read for hot path
let raw = ctx.accounts.large_state.try_borrow_data()?;
let value = u64::from_le_bytes(raw[offset..offset+8].try_into().unwrap());
// Skips full deserialization — saves ~500 CU
```

---

## Setting the Right Compute Budget in Production

```typescript
// Dynamic compute budget based on instruction type
import { ComputeBudgetProgram, Transaction } from "@solana/web3.js";

const CU_BUDGETS: Record<string, number> = {
  simple_transfer: 15_000,
  token_swap: 120_000,
  nft_mint: 200_000,
  complex_position: 400_000,
  emergency_withdraw: 600_000, // Set high for critical operations
};

function buildTransactionWithBudget(
  instructionName: keyof typeof CU_BUDGETS,
  instruction: TransactionInstruction,
  priorityFeePerCU: number = 1000 // microlamports
): Transaction {
  const cuLimit = CU_BUDGETS[instructionName];

  return new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeePerCU }),
    instruction
  );
}

// Never set compute unit limit to max (1.2M) for every transaction
// It signals low quality to validators and wastes fee priority
```

---

## Prometheus Metric: CU Usage by Instruction (production monitoring)

```typescript
import { Histogram } from 'prom-client';

const cuUsageHistogram = new Histogram({
  name: 'solana_instruction_cu_consumed',
  help: 'Compute units consumed per instruction type',
  labelNames: ['instruction', 'program_id'],
  buckets: [10_000, 50_000, 100_000, 200_000, 400_000, 600_000, 800_000, 1_000_000, 1_200_000],
});

// After each confirmed transaction, record CU:
async function recordCUUsage(signature: string, instructionName: string) {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (tx?.meta?.computeUnitsConsumed) {
    cuUsageHistogram.observe(
      { instruction: instructionName, program_id: MY_PROGRAM_ID.toBase58() },
      tx.meta.computeUnitsConsumed
    );
  }
}
```

---

## CU Budget Planning Worksheet

Before shipping a new instruction, fill this out:

```
Instruction: ___________________

Account deserialization:
  [ ] N accounts × ~25 CU/32 bytes = ___ CU

Validation logic:
  [ ] Signature checks × 10,000 = ___ CU
  [ ] Custom validations (estimate) = ___ CU

CPI calls:
  [ ] ___ × invoke = ___ × ~1,000 = ___ CU
  [ ] ___ × invoke_signed = ___ × ~1,500 = ___ CU
  [ ] ___ × SPL token transfer = ___ × ~5,000 = ___ CU
  [ ] ___ × oracle reads = ___ × ~7,000 = ___ CU

Business logic:
  [ ] Arithmetic (estimate) = ___ CU
  [ ] Sorting/iteration (estimate) = ___ CU

Total estimate: ___ CU
Safety buffer (20%): ___ CU
→ Set compute unit limit to: ___ CU
→ Alert if > 80% consumed: ___ CU
→ Fail CI test if > baseline + 5%: ___ CU
```


