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
// Check 4: Recent transaction success rate from confirmed signatures
async function checkRecentSuccessRate(programId: string, connection: Connection) {
  const signatures = await connection.getSignaturesForAddress(new PublicKey(programId), { limit: 100 });
  if (signatures.length < 20) {
    return { status: "warn", rate: 1, detail: `Only ${signatures.length} recent signatures; denominator too small` };
  }
  const failed = signatures.filter((s) => s.err !== null).length;
  const rate = 1 - failed / signatures.length;
  if (rate < 0.90) return { status: "fail", rate, detail: `${(rate * 100).toFixed(1)}% success over last ${signatures.length}` };
  if (rate < 0.98) return { status: "warn", rate, detail: `${(rate * 100).toFixed(1)}% success over last ${signatures.length}` };
  return { status: "pass", rate, detail: `${(rate * 100).toFixed(1)}% success over last ${signatures.length}` };
}

// Check 5: Indexer freshness; endpoint should return { latestFinalizedSlot }
async function checkIndexerFreshness(indexerUrl: string, connection: Connection) {
  const [chainSlot, response] = await Promise.all([
    connection.getSlot("finalized"),
    fetch(`${indexerUrl.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(5000) }),
  ]);
  if (!response.ok) return { status: "fail", lagSlots: Infinity, detail: `indexer health HTTP ${response.status}` };
  const body = await response.json() as { latestFinalizedSlot?: number };
  const lagSlots = chainSlot - (body.latestFinalizedSlot ?? 0);
  if (lagSlots > 1500) return { status: "fail", lagSlots, detail: `${lagSlots} slots behind finalized tip` };
  if (lagSlots > 300) return { status: "warn", lagSlots, detail: `${lagSlots} slots behind finalized tip` };
  return { status: "pass", lagSlots, detail: `${lagSlots} slots behind finalized tip` };
}

// Check 6: Backend readiness and deep health endpoints
async function checkBackendHealth(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  const checks = await Promise.all(["/live", "/ready", "/healthz"].map(async (path) => {
    const start = Date.now();
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
    return { path, ok: response.ok, statusCode: response.status, latencyMs: Date.now() - start };
  }));
  const failed = checks.filter((c) => !c.ok);
  return { status: failed.length ? "fail" : "pass", checks, detail: failed.length ? `${failed.length} backend health endpoints failed` : "all backend probes passed" };
}

// Check 7: Anchor IDL drift via hash comparison with deployed IDL endpoint
async function checkIdlSync(programId: string, localIdlPath: string, deployedIdlUrl: string) {
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const local = await readFile(localIdlPath, "utf8");
  const deployed = await fetch(deployedIdlUrl, { signal: AbortSignal.timeout(5000) }).then((r) => r.text());
  const hash = (value: string) => createHash("sha256").update(JSON.stringify(JSON.parse(value))).digest("hex");
  const localHash = hash(local);
  const deployedHash = hash(deployed);
  return {
    status: localHash === deployedHash ? "pass" : "fail",
    programId,
    localHash,
    deployedHash,
    detail: localHash === deployedHash ? "local IDL matches deployed IDL" : "IDL drift detected",
  };
}
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
