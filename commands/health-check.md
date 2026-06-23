# /obs health-check

Runs a comprehensive health check across every layer of a Solana dApp's infrastructure and produces a structured report with remediation steps for anything failing.

## Usage

```bash
/obs health-check [--program PROGRAM_ID] [--cluster mainnet-beta|devnet] [--rpc RPC_URL1,RPC_URL2]
```

## What It Runs

Seven checks, each with a pass/warn/fail result, latency measurement, and a remediation step if non-passing:

---

### Check 1: RPC Endpoint Health (per endpoint)

```typescript
// src/commands/health-check/rpc.ts
import { Connection } from "@solana/web3.js";

interface RPCHealthResult {
  endpoint: string;
  status: "pass" | "warn" | "fail";
  slot: number;
  networkTip: number;
  lag: number;
  latencyMs: number;
  rateLimit: { used: number; limit: number } | null;
  detail: string;
  remediation?: string;
}

async function checkRPCHealth(
  endpoint: string,
  referenceEndpoint: string
): Promise<RPCHealthResult> {
  const conn = new Connection(endpoint);
  const refConn = new Connection(referenceEndpoint);
  const start = Date.now();

  try {
    const [localSlot, networkSlot] = await Promise.all([
      conn.getSlot("confirmed"),
      refConn.getSlot("confirmed"),
    ]);

    const latencyMs = Date.now() - start;
    const lag = networkSlot - localSlot;

    // Check rate limit headers via raw fetch
    const rpcBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" });
    const rpcRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rpcBody,
    });
    const rateLimitRemaining = rpcRes.headers.get("x-ratelimit-remaining");
    const rateLimitLimit = rpcRes.headers.get("x-ratelimit-limit");

    let status: "pass" | "warn" | "fail" = "pass";
    let detail = `slot=${localSlot}, lag=${lag}, latency=${latencyMs}ms`;
    let remediation: string | undefined;

    if (lag > 100) {
      status = "fail";
      detail += " — CRITICAL slot lag";
      remediation = "Remove this endpoint from rotation immediately. Check if provider has an incident.";
    } else if (lag > 20) {
      status = "warn";
      detail += " — elevated slot lag";
      remediation = "Reduce weight of this endpoint in your load balancer. Monitor for improvement.";
    }

    if (latencyMs > 2000) {
      status = status === "pass" ? "warn" : status;
      remediation = (remediation ?? "") + " High latency — consider switching to a closer region.";
    }

    if (rateLimitRemaining && rateLimitLimit) {
      const usedPct = 1 - (parseInt(rateLimitRemaining) / parseInt(rateLimitLimit));
      if (usedPct > 0.9) {
        status = "warn";
        remediation = (remediation ?? "") + ` Rate limit at ${(usedPct * 100).toFixed(0)}% — add a secondary endpoint.`;
      }
    }

    return {
      endpoint,
      status,
      slot: localSlot,
      networkTip: networkSlot,
      lag,
      latencyMs,
      rateLimit: rateLimitRemaining
        ? { used: parseInt(rateLimitLimit!) - parseInt(rateLimitRemaining), limit: parseInt(rateLimitLimit!) }
        : null,
      detail,
      remediation,
    };
  } catch (err) {
    return {
      endpoint,
      status: "fail",
      slot: 0,
      networkTip: 0,
      lag: 9999,
      latencyMs: Date.now() - start,
      rateLimit: null,
      detail: `Unreachable: ${err}`,
      remediation: "Endpoint is down. Switch traffic to backup immediately.",
    };
  }
}
```

---

### Check 2: Program State Validation

```typescript
async function checkProgramState(
  programId: string,
  connection: Connection,
  expectedUpgradeAuthority?: string,
  knownGoodBinaryHash?: string
): Promise<{
  status: "pass" | "warn" | "fail";
  executable: boolean;
  upgradeAuthority: string | null;
  authorityMatch: boolean;
  recentlyUpgraded: boolean;
  detail: string;
  remediation?: string;
}> {
  const { PublicKey } = await import("@solana/web3.js");

  const programInfo = await connection.getAccountInfo(new PublicKey(programId));

  if (!programInfo) {
    return {
      status: "fail",
      executable: false,
      upgradeAuthority: null,
      authorityMatch: false,
      recentlyUpgraded: false,
      detail: "Program account not found",
      remediation: "Verify program ID is correct and deployed to this cluster.",
    };
  }

  if (!programInfo.executable) {
    return {
      status: "fail",
      executable: false,
      upgradeAuthority: null,
      authorityMatch: false,
      recentlyUpgraded: false,
      detail: "Program account exists but is NOT executable",
      remediation: "Program may have been closed or corrupted. Check program data account.",
    };
  }

  // Get upgrade authority from BPFUpgradeableLoader program data account
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [new PublicKey(programId).toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
  );

  const programDataInfo = await connection.getAccountInfo(programDataAddress);
  // Bytes 4-8: last deploy slot; bytes 8-40: upgrade authority pubkey
  const lastDeploySlot = programDataInfo?.data
    ? Number(programDataInfo.data.readBigUInt64LE(4))
    : null;
  const upgradeAuthorityBytes = programDataInfo?.data?.slice(8, 40);
  const upgradeAuthority = upgradeAuthorityBytes
    ? new PublicKey(upgradeAuthorityBytes).toBase58()
    : null;

  const currentSlot = await connection.getSlot();
  const slotsSinceDeploy = lastDeploySlot ? currentSlot - lastDeploySlot : null;
  const recentlyUpgraded = slotsSinceDeploy !== null && slotsSinceDeploy < 1000; // ~7 minutes

  const authorityMatch = !expectedUpgradeAuthority || upgradeAuthority === expectedUpgradeAuthority;

  let status: "pass" | "warn" | "fail" = "pass";
  let detail = `executable=true, authority=${upgradeAuthority?.slice(0, 8)}...`;
  let remediation: string | undefined;

  if (!authorityMatch) {
    status = "fail";
    detail += " — AUTHORITY MISMATCH";
    remediation = `Expected ${expectedUpgradeAuthority?.slice(0, 8)}, got ${upgradeAuthority?.slice(0, 8)}. SECURITY ALERT — load incident-response skill immediately.`;
  }

  if (recentlyUpgraded) {
    status = status === "pass" ? "warn" : status;
    detail += ` — upgraded ~${Math.round((slotsSinceDeploy ?? 0) * 0.4 / 60)} minutes ago`;
    remediation = (remediation ?? "") + " Verify this upgrade was intentional. Check IDL drift.";
  }

  return { status, executable: true, upgradeAuthority, authorityMatch, recentlyUpgraded, detail, remediation };
}
```

---

### Check 3: Fee Payer Balance

```typescript
async function checkFeePayerBalance(
  feePayerAddress: string,
  connection: Connection
): Promise<{ status: "pass" | "warn" | "fail"; balanceSOL: number; detail: string; remediation?: string }> {
  const { PublicKey } = await import("@solana/web3.js");
  const balance = await connection.getBalance(new PublicKey(feePayerAddress));
  const balanceSOL = balance / 1e9;

  if (balanceSOL < 0.1) return {
    status: "fail", balanceSOL,
    detail: `${balanceSOL.toFixed(4)} SOL — CRITICALLY LOW`,
    remediation: "Refill immediately. Transactions will fail when balance hits ~0.001 SOL.",
  };
  if (balanceSOL < 0.5) return {
    status: "warn", balanceSOL,
    detail: `${balanceSOL.toFixed(4)} SOL — low`,
    remediation: "Refill within 24 hours. Set up auto-refill automation.",
  };
  return { status: "pass", balanceSOL, detail: `${balanceSOL.toFixed(4)} SOL` };
}
```

---

### Check 4–7 (Inline)

```typescript
// Check 4: Recent transaction success rate (last 100 txs)
async function checkRecentSuccessRate(programId: string) { /* ... */ }

// Check 5: Indexer freshness (if applicable)
async function checkIndexerFreshness(indexerUrl: string) { /* ... */ }

// Check 6: Health endpoint (your own backend)
async function checkBackendHealth(healthUrl: string) { /* ... */ }

// Check 7: IDL sync (on-chain IDL vs client IDL)
async function checkIdlSync(programId: string, localIdlPath: string) { /* ... */ }
```

---

## Report Format

```
=== Solana Health Check ===
Cluster:  mainnet-beta
Program:  6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
Checked:  2026-06-23T10:30:00Z

RPC ENDPOINTS:
  ✅ Helius Primary          slot lag: 2    latency:  43ms   rate: 12%/limit
  ✅ QuickNode Backup        slot lag: 4    latency:  71ms   rate:  6%/limit
  ⚠️  Self-hosted            slot lag: 28   latency: 340ms   rate: N/A
     → Reduce weight in LB. Elevated slot lag.

PROGRAM:
  ✅ Executable              yes
  ✅ Upgrade authority       matches expected (Squads multisig)
  ✅ Recently upgraded       no (last upgrade: 14 days ago)

OPERATIONAL:
  ✅ Fee payer balance       3.42 SOL
  ✅ TX success rate (1h)    99.7%
  ⚠️  IDL sync               last uploaded 3 days ago — verify matches deployed binary
     → Run: anchor idl upgrade <PROGRAM_ID>

BACKEND:
  ✅ /health endpoint        200 OK (47ms)
  ✅ Indexer freshness       8s behind chain tip

SUMMARY: 8/9 checks passing (1 warning, 0 critical)
Exit code: 1 (warnings present)
```

---

## CI Integration

```yaml
# .github/workflows/health-check.yml
name: Production Health Check

on:
  schedule:
    - cron: '*/15 * * * *'   # Every 15 minutes
  workflow_dispatch:

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx ts-node scripts/health-check.ts
        env:
          HELIUS_API_KEY: ${{ secrets.HELIUS_API_KEY }}
          PROGRAM_ID: ${{ vars.PROGRAM_ID }}
          FEE_PAYER_ADDRESS: ${{ vars.FEE_PAYER_ADDRESS }}
          EXPECTED_UPGRADE_AUTHORITY: ${{ vars.EXPECTED_UPGRADE_AUTHORITY }}
      - name: Notify on failure
        if: failure()
        uses: act10ns/slack@v2
        with:
          webhook-url: ${{ secrets.DISCORD_ALERT_WEBHOOK }}
          message: "🚨 Health check failed — ${{ github.run_url }}"
```
