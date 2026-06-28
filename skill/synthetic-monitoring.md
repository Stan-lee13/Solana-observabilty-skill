# Synthetic Monitoring — Canary Transactions & Continuous Health Probes

> Load this skill to verify your protocol is actually working from the user's perspective,
> not just that the infrastructure is up.
>
> A healthy RPC with a broken program instruction looks fine in infrastructure dashboards.
> Synthetic monitoring catches it immediately.

---

## Why Synthetic Monitoring Matters

Infrastructure monitoring answers: "Is the server running?"
Synthetic monitoring answers: "Can a user actually do the thing that makes us money?"

```
Infrastructure healthy ≠ Protocol healthy

Example failure modes infrastructure monitoring MISSES:
  ✗ A program instruction silently fails for all users (program error, not RPC error)
  ✗ A fee payer wallet runs out of SOL (sponsored tx path breaks for 0 users on RPC metrics)
  ✗ An indexer stops processing but returns stale data (latency looks fine)
  ✗ A Blinks action URL returns 200 but produces malformed transaction JSON
  ✗ A vesting cliff hits and all unlock attempts fail (state-dependent failure)

Synthetic monitoring catches all of these within one probe interval.
```

---

## Probe Architecture

```
CANARY WALLET (devnet or mainnet dedicated probe wallet)
         │
         ▼
  PROBE SCHEDULER (cron / Cloudflare Worker / standalone service)
         │
         ├── /probe/rpc-roundtrip        (every 30s)
         ├── /probe/instruction-noop      (every 60s)
         ├── /probe/fee-payer-balance     (every 5m)
         ├── /probe/indexer-freshness     (every 60s)
         ├── /probe/blinks-action         (every 5m)
         └── /probe/full-user-journey     (every 15m)
         │
         ▼
  PROMETHEUS METRICS → Grafana dashboard → Alert rules → PagerDuty/Discord
```

---

## Core Probe Implementations

### Probe 1 — RPC Round-Trip Canary

Measures end-to-end RPC health including slot freshness:

```typescript
// src/synthetic/probes/rpc-roundtrip.ts
import { Connection } from "@solana/web3.js";
import { Histogram, Gauge, Registry } from "prom-client";

export function createRpcProbe(registry: Registry) {
  const latency = new Histogram({
    name: "solana_synthetic_rpc_roundtrip_seconds",
    help: "RPC round-trip latency from probe",
    labelNames: ["endpoint", "method"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const slotFreshness = new Gauge({
    name: "solana_synthetic_slot_freshness_seconds",
    help: "Age of latest slot returned by RPC in seconds",
    labelNames: ["endpoint"] as const,
    registers: [registry],
  });

  const probeSuccess = new Gauge({
    name: "solana_synthetic_rpc_probe_success",
    help: "1 if RPC probe succeeded, 0 if failed",
    labelNames: ["endpoint"] as const,
    registers: [registry],
  });

  return async function probeRpc(endpoint: string): Promise<void> {
    const connection = new Connection(endpoint, "confirmed");
    const start = performance.now();

    try {
      // Method 1: getSlot — fastest liveness check
      const slot = await Promise.race([
        connection.getSlot("confirmed"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        ),
      ]);

      const durationSec = (performance.now() - start) / 1000;
      latency.observe({ endpoint, method: "getSlot" }, durationSec);

      // Method 2: getBlockTime for freshness
      const blockTime = await connection.getBlockTime(slot);
      if (blockTime) {
        const ageSec = Math.floor(Date.now() / 1000) - blockTime;
        slotFreshness.set({ endpoint }, ageSec);

        // Alert if slot is >30 seconds old (network stall or RPC issue)
        if (ageSec > 30) {
          console.warn(`[synthetic] Slot freshness degraded on ${endpoint}: ${ageSec}s old`);
        }
      }

      probeSuccess.set({ endpoint }, 1);
    } catch (err) {
      probeSuccess.set({ endpoint }, 0);
      latency.observe({ endpoint, method: "getSlot" }, (performance.now() - start) / 1000);
      console.error(`[synthetic] RPC probe failed on ${endpoint}:`, err);
    }
  };
}
```

---

### Probe 2 — Program Instruction Canary (No-Op Probe)

The most important probe: does your program actually accept transactions?

```typescript
// src/synthetic/probes/instruction-probe.ts
import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Gauge, Histogram, Counter, Registry } from "prom-client";

export function createInstructionProbe(registry: Registry) {
  const probeSuccess = new Gauge({
    name: "solana_synthetic_instruction_success",
    help: "1 if program instruction probe succeeded",
    labelNames: ["program_id", "instruction_name"] as const,
    registers: [registry],
  });

  const confirmationTime = new Histogram({
    name: "solana_synthetic_instruction_confirmation_seconds",
    help: "Time from send to confirmed for synthetic probe transaction",
    labelNames: ["program_id", "instruction_name"] as const,
    buckets: [0.5, 1, 2, 5, 10, 20, 30],
    registers: [registry],
  });

  const probeErrors = new Counter({
    name: "solana_synthetic_instruction_errors_total",
    help: "Total probe instruction failures by error class",
    labelNames: ["program_id", "instruction_name", "error_class"] as const,
    registers: [registry],
  });

  return async function probeInstruction(
    connection: Connection,
    canaryKeypair: Keypair,
    programId: string,
    instructionName: string,
    buildInstruction: (canary: Keypair) => TransactionInstruction
  ): Promise<void> {
    const start = performance.now();

    try {
      const ix = buildInstruction(canaryKeypair);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction()
        .add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
          ix
        );
      tx.recentBlockhash = blockhash;
      tx.feePayer = canaryKeypair.publicKey;

      await sendAndConfirmTransaction(connection, tx, [canaryKeypair], {
        commitment: "confirmed",
        maxRetries: 3,
      });

      const durationSec = (performance.now() - start) / 1000;
      probeSuccess.set({ program_id: programId, instruction_name: instructionName }, 1);
      confirmationTime.observe(
        { program_id: programId, instruction_name: instructionName },
        durationSec
      );
    } catch (err: any) {
      probeSuccess.set({ program_id: programId, instruction_name: instructionName }, 0);

      const errorClass =
        err.message?.includes("custom program error") ? "program_error" :
        err.message?.includes("simulation") ? "simulation_failed" :
        err.message?.includes("timeout") ? "timeout" :
        err.message?.includes("blockhash") ? "blockhash_expired" : "unknown";

      probeErrors.inc({
        program_id: programId,
        instruction_name: instructionName,
        error_class: errorClass,
      });

      console.error(
        `[synthetic] Instruction probe failed: ${programId}/${instructionName}:`,
        err.message
      );
    }
  };
}
```

---

### Probe 3 — Fee Payer Balance Monitor

Critical for gasless/sponsored flows — catches wallet runout before users do:

```typescript
// src/synthetic/probes/fee-payer-probe.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Gauge, Registry } from "prom-client";

export function createFeePayerProbe(registry: Registry) {
  const balance = new Gauge({
    name: "solana_synthetic_fee_payer_balance_sol",
    help: "Fee payer wallet balance in SOL",
    labelNames: ["alias", "address"] as const,
    registers: [registry],
  });

  const runway = new Gauge({
    name: "solana_synthetic_fee_payer_runway_hours",
    help: "Estimated hours until fee payer is empty at current spend rate",
    labelNames: ["alias"] as const,
    registers: [registry],
  });

  // Track spend rate (rolling 1-hour average)
  const spendHistory: number[] = [];

  return async function probeFeePayerBalance(
    connection: Connection,
    feePayerAddress: string,
    alias: string,
    txPerHour: number // estimated transactions per hour for runway calc
  ): Promise<{ balanceSol: number; runwayHours: number }> {
    const pubkey = new PublicKey(feePayerAddress);
    const lamports = await connection.getBalance(pubkey, "confirmed");
    const balanceSol = lamports / LAMPORTS_PER_SOL;

    balance.set({ alias, address: feePayerAddress }, balanceSol);

    // Estimate runway: balance / (txPerHour * avgFeePerTx in SOL)
    const avgFeePerTxSol = 0.000005; // ~5000 lamports base + priority
    const hourlySpend = txPerHour * avgFeePerTxSol;
    const runwayHrs = hourlySpend > 0 ? balanceSol / hourlySpend : 999;
    runway.set({ alias }, runwayHrs);

    if (balanceSol < 0.5) {
      console.warn(`[synthetic] CRITICAL: Fee payer ${alias} balance low: ${balanceSol} SOL`);
    } else if (balanceSol < 2) {
      console.warn(`[synthetic] WARNING: Fee payer ${alias} balance: ${balanceSol} SOL`);
    }

    return { balanceSol, runwayHours: runwayHrs };
  };
}
```

---

### Probe 4 — Indexer Freshness Canary

Sends a known transaction, then verifies the indexer/API reflects it within SLO:

```typescript
// src/synthetic/probes/indexer-freshness.ts
import { Gauge, Histogram, Registry } from "prom-client";

export function createIndexerFreshnessProbe(registry: Registry) {
  const lagSeconds = new Gauge({
    name: "solana_synthetic_indexer_lag_seconds",
    help: "Seconds between on-chain confirmation and indexer visibility",
    labelNames: ["indexer_name"] as const,
    registers: [registry],
  });

  const freshnessOk = new Gauge({
    name: "solana_synthetic_indexer_freshness_ok",
    help: "1 if indexer is within SLO, 0 if lagging",
    labelNames: ["indexer_name"] as const,
    registers: [registry],
  });

  return async function probeIndexerFreshness(
    indexerName: string,
    confirmedSignature: string,
    confirmationTimestamp: number,
    queryFn: () => Promise<boolean>, // returns true if tx is visible
    sloSeconds = 30
  ): Promise<void> {
    const pollStart = Date.now();
    const timeout = sloSeconds * 2 * 1000;

    while (Date.now() - pollStart < timeout) {
      const visible = await queryFn();
      if (visible) {
        const lagSec = (Date.now() - confirmationTimestamp * 1000) / 1000;
        lagSeconds.set({ indexer_name: indexerName }, lagSec);
        freshnessOk.set({ indexer_name: indexerName }, lagSec <= sloSeconds ? 1 : 0);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Not visible within timeout
    lagSeconds.set({ indexer_name: indexerName }, timeout / 1000);
    freshnessOk.set({ indexer_name: indexerName }, 0);
    console.error(`[synthetic] Indexer ${indexerName} not reflecting tx ${confirmedSignature} within ${sloSeconds}s SLO`);
  };
}
```

---

### Probe 5 — Blinks / Actions Endpoint Canary

Verifies your Blinks action URL returns a valid, non-malicious transaction:

```typescript
// src/synthetic/probes/blinks-probe.ts
import { Gauge, Counter, Registry } from "prom-client";

interface BlinksProbeResult {
  urlOk: boolean;
  transactionValid: boolean;
  expectedProgram: boolean;
  latencyMs: number;
  error?: string;
}

export function createBlinksProbe(registry: Registry) {
  const probeOk = new Gauge({
    name: "solana_synthetic_blinks_probe_ok",
    help: "1 if Blinks action URL returns valid transaction",
    labelNames: ["action_url", "action_name"] as const,
    registers: [registry],
  });

  const programMismatch = new Counter({
    name: "solana_synthetic_blinks_program_mismatch_total",
    help: "Blinks action returned transaction with unexpected program ID",
    labelNames: ["action_url"] as const,
    registers: [registry],
  });

  return async function probeBlinksAction(
    actionUrl: string,
    actionName: string,
    expectedProgramId: string,
    probeWallet: string
  ): Promise<BlinksProbeResult> {
    const start = performance.now();

    try {
      // Step 1: Fetch the action spec
      const specRes = await fetch(actionUrl, {
        headers: { Accept: "application/json" },
      });
      if (!specRes.ok) throw new Error(`HTTP ${specRes.status}`);

      // Step 2: POST to get transaction
      const txRes = await fetch(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: probeWallet }),
      });
      if (!txRes.ok) throw new Error(`TX fetch HTTP ${txRes.status}`);

      const { transaction: txBase64 } = await txRes.json();
      const latencyMs = performance.now() - start;

      // Step 3: Verify the transaction contains expected program
      const txBytes = Buffer.from(txBase64, "base64");
      const programPresent = txBytes.toString("hex").includes(
        // simplified check — in production decode the transaction fully
        expectedProgramId.substring(0, 8)
      );

      if (!programPresent) {
        programMismatch.inc({ action_url: actionUrl });
        console.error(`[synthetic] Blinks program mismatch on ${actionUrl} — expected ${expectedProgramId}`);
      }

      probeOk.set(
        { action_url: actionUrl, action_name: actionName },
        programPresent ? 1 : 0
      );

      return {
        urlOk: true,
        transactionValid: true,
        expectedProgram: programPresent,
        latencyMs,
      };
    } catch (err: any) {
      probeOk.set({ action_url: actionUrl, action_name: actionName }, 0);
      return {
        urlOk: false,
        transactionValid: false,
        expectedProgram: false,
        latencyMs: performance.now() - start,
        error: err.message,
      };
    }
  };
}
```

---

## Probe Scheduler — Cloudflare Worker (Zero Infrastructure)

Run all probes without a server using Cloudflare Workers cron triggers:

```typescript
// workers/synthetic-probe-worker.ts
import { createRpcProbe } from "../src/synthetic/probes/rpc-roundtrip";

export default {
  // Runs every 30 seconds via Wrangler cron trigger
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    // RPC probes
    for (const endpoint of (env.RPC_ENDPOINTS ?? "").split(",")) {
      try {
        const probe = createRpcProbe(globalRegistry);
        await probe(endpoint.trim());
        results[`rpc_${endpoint}`] = "ok";
      } catch (err: any) {
        errors.push(`rpc_${endpoint}: ${err.message}`);
      }
    }

    // Emit to Prometheus pushgateway or Grafana Cloud
    if (env.PUSHGATEWAY_URL) {
      await fetch(`${env.PUSHGATEWAY_URL}/metrics/job/synthetic-probes`, {
        method: "PUT",
        body: await globalRegistry.metrics(),
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (errors.length > 0) {
      // Alert via Discord webhook
      await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🔴 **Synthetic probe failures:**\n${errors.map((e) => `• ${e}`).join("\n")}`,
        }),
      });
    }
  },

  // Also expose probe results as HTTP for pull-based scrape
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname === "/metrics") {
      return new Response(await globalRegistry.metrics(), {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }
    return new Response("Synthetic probe worker", { status: 200 });
  },
};

// wrangler.toml
/*
[triggers]
crons = ["*\/0.5 * * * *"]  # Every 30 seconds

[vars]
RPC_ENDPOINTS = "https://mainnet.helius-rpc.com/?api-key=KEY,https://api.mainnet-beta.solana.com"
PROGRAM_IDS = "YOUR_PROGRAM_ID"
PUSHGATEWAY_URL = "https://prometheus-pushgateway.your-domain.com"
*/
```

---

## Alert Rules for Synthetic Probes

```yaml
# Add to deploy/alerts.yml
- name: solana-synthetic-monitoring
  interval: 30s
  rules:
    - alert: SolanaSyntheticRpcProbeFailed
      expr: solana_synthetic_rpc_probe_success == 0
      for: 2m
      labels:
        severity: p1
        service: solana-synthetic
        runbook_url: runbooks/rpc-degradation.md
      annotations:
        summary: "Synthetic RPC probe failing on {{ $labels.endpoint }}"

    - alert: SolanaSyntheticInstructionFailed
      expr: solana_synthetic_instruction_success == 0
      for: 3m
      labels:
        severity: p1
        service: solana-synthetic
        runbook_url: runbooks/transaction-success-rate-low.md
      annotations:
        summary: "Synthetic instruction probe failing: {{ $labels.program_id }}/{{ $labels.instruction_name }}"

    - alert: SolanaSyntheticFeePayerCritical
      expr: solana_synthetic_fee_payer_balance_sol < 0.5
      for: 0m
      labels:
        severity: p1
        service: solana-synthetic
        runbook_url: runbooks/fee-payer-low.md
      annotations:
        summary: "Fee payer {{ $labels.alias }} critically low: {{ $value }} SOL"

    - alert: SolanaSyntheticIndexerLagging
      expr: solana_synthetic_indexer_freshness_ok == 0
      for: 5m
      labels:
        severity: p1
        service: solana-synthetic
        runbook_url: runbooks/indexer-lag.md
      annotations:
        summary: "Indexer {{ $labels.indexer_name }} outside SLO"

    - alert: SolanaSyntheticBlinksMalformed
      expr: solana_synthetic_blinks_program_mismatch_total > 0
      for: 0m
      labels:
        severity: p0
        service: solana-synthetic
        runbook_url: runbooks/wallet-drainer.md
      annotations:
        summary: "Blinks action {{ $labels.action_url }} returned unexpected program — possible drainer"
```

---

## Canary Wallet Setup

```bash
# Generate a dedicated canary wallet — fund with minimal SOL for probes
solana-keygen new --outfile ./keys/canary-mainnet.json --no-bip39-passphrase

# Fund with exactly what's needed for probes (do not overfund)
# Each probe tx costs ~0.000005 SOL
# 1000 probes/day × 0.000005 = 0.005 SOL/day
# Keep 0.1 SOL in canary for ~20 days of runway

# Store in secret manager, not in code
export CANARY_KEYPAIR=$(cat ./keys/canary-mainnet.json)
```
