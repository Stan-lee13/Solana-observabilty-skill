import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { Connection, PublicKey } from "@solana/web3.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EndpointConfig = { alias: string; url: string };
export type EndpointHealth = {
  endpoint: string;
  healthy: boolean;
  slotLag: number;
  latencyMs: number;
  currentSlot: number;
  errorClass?: string;
  checkedAt: string;
};

export type ExporterConfig = {
  port: number;
  cluster: string;
  scrapeIntervalMs: number;
  programIds: string[];
  vaultAddresses: string[];
  governanceMints: string[];
  bridgeMints: string[];
  depinNodeAddresses: string[];
  feePayerAddresses: string[];
  rpcEndpoints: EndpointConfig[];
};

// ─── Config Helpers ────────────────────────────────────────────────────────────

export function parseAddressList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

export function normalizeRpcEndpoints(env: NodeJS.ProcessEnv): EndpointConfig[] {
  const candidates = [
    { alias: env.HELIUS_RPC_ALIAS ?? "helius-primary", url: env.HELIUS_RPC_URL ?? "" },
    { alias: env.QUICKNODE_RPC_ALIAS ?? "quicknode-backup", url: env.QUICKNODE_RPC_URL ?? "" },
    { alias: env.TRITON_RPC_ALIAS ?? "triton-fallback", url: env.TRITON_RPC_URL ?? "" },
  ];
  return candidates.filter((e) => e.url.trim().length > 0);
}

export function buildExporterConfig(env = process.env): ExporterConfig {
  return {
    port: Number.parseInt(env.PORT ?? "3001", 10),
    cluster: env.SOLANA_CLUSTER ?? "mainnet-beta",
    scrapeIntervalMs: Number.parseInt(env.SCRAPE_INTERVAL_SECONDS ?? "15", 10) * 1000,
    programIds: parseAddressList(env.PROGRAM_IDS),
    vaultAddresses: parseAddressList(env.VAULT_ADDRESSES),
    governanceMints: parseAddressList(env.GOVERNANCE_MINTS),
    bridgeMints: parseAddressList(env.BRIDGE_MINTS),
    depinNodeAddresses: parseAddressList(env.DEPIN_NODE_ADDRESSES),
    feePayerAddresses: parseAddressList(env.FEE_PAYER_ADDRESSES),
    rpcEndpoints: normalizeRpcEndpoints(env),
  };
}

const CONFIG = buildExporterConfig();
const {
  port: PORT,
  cluster: CLUSTER,
  scrapeIntervalMs: SCRAPE_INTERVAL_MS,
  programIds: PROGRAM_IDS,
  vaultAddresses: VAULT_ADDRESSES,
  governanceMints: GOVERNANCE_MINTS,
  bridgeMints: BRIDGE_MINTS,
  depinNodeAddresses: DEPIN_NODE_ADDRESSES,
  feePayerAddresses: FEE_PAYER_ADDRESSES,
  rpcEndpoints: RPC_ENDPOINTS,
} = CONFIG;

// ─── Prometheus Registry ───────────────────────────────────────────────────────

export const registry = new Registry();
registry.setDefaultLabels({ cluster: CLUSTER });
collectDefaultMetrics({ register: registry, prefix: "nodejs_" });

// ─── Infrastructure Metrics ───────────────────────────────────────────────────

const rpcHealthGauge = new Gauge({
  name: "solana_rpc_healthy",
  help: "1 if RPC endpoint is healthy, 0 otherwise",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

const slotLagGauge = new Gauge({
  name: "solana_slot_lag_slots",
  help: "Slots behind the network tip",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

const rpcLatencyHistogram = new Histogram({
  name: "solana_rpc_request_duration_seconds",
  help: "RPC request latency in seconds",
  labelNames: ["endpoint", "method"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ─── Transaction Metrics ──────────────────────────────────────────────────────

const txTotal = new Counter({
  name: "solana_transaction_total",
  help: "Total transactions processed",
  labelNames: ["program_id", "instruction", "status", "error_class"] as const,
  registers: [registry],
});

const txConfirmationTime = new Histogram({
  name: "solana_transaction_confirmation_seconds",
  help: "Transaction confirmation time from send to confirmed",
  labelNames: ["program_id", "instruction"] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

const instructionCuHistogram = new Histogram({
  name: "solana_instruction_compute_units",
  help: "Compute units consumed per instruction",
  labelNames: ["program_id", "instruction"] as const,
  buckets: [5000, 10000, 25000, 50000, 100000, 200000, 400000, 800000, 1200000],
  registers: [registry],
});

// ─── Program Upgrade & Security Metrics ──────────────────────────────────────

const programUpgradeCounter = new Counter({
  name: "solana_program_upgrade_detected_total",
  help: "Program upgrades detected",
  labelNames: ["program_id", "expected"] as const,
  registers: [registry],
});

const authorityChangeCounter = new Counter({
  name: "solana_authority_change_total",
  help: "Authority changes detected (upgrade, mint, freeze, metadata)",
  labelNames: ["program_id", "authority_type", "expected"] as const,
  registers: [registry],
});

const probePatternScore = new Gauge({
  name: "solana_probe_pattern_score",
  help: "Rolling probe pattern risk score per wallet (0-100)",
  labelNames: ["program_id", "wallet"] as const,
  registers: [registry],
});

const vaultDrainRate = new Gauge({
  name: "solana_vault_drain_rate_lamports_per_sec",
  help: "Rate of balance decrease for monitored vaults",
  labelNames: ["vault_alias", "vault_address"] as const,
  registers: [registry],
});

const watchlistHitCounter = new Counter({
  name: "solana_watchlist_wallet_hit_total",
  help: "Transactions from wallets on the security watchlist",
  labelNames: ["program_id", "wallet_label"] as const,
  registers: [registry],
});

const setAuthorityCounter = new Counter({
  name: "solana_set_authority_instruction_total",
  help: "SetAuthority instructions observed",
  labelNames: ["program_id", "authority_type"] as const,
  registers: [registry],
});

const flashLoanCoOccurrence = new Counter({
  name: "solana_flash_loan_cooccurrence_total",
  help: "Flash loan txs in same block as protocol interaction",
  labelNames: ["program_id", "flash_loan_program"] as const,
  registers: [registry],
});

// ─── Governance Metrics ───────────────────────────────────────────────────────

const governanceProposalGauge = new Gauge({
  name: "solana_governance_proposals_active",
  help: "Number of active governance proposals",
  labelNames: ["governance_program", "realm"] as const,
  registers: [registry],
});

const governanceVotesGauge = new Gauge({
  name: "solana_governance_votes_cast",
  help: "Total votes cast on current active proposals",
  labelNames: ["proposal_pubkey", "vote_type"] as const,
  registers: [registry],
});

const governanceTokenAccumulation = new Gauge({
  name: "solana_governance_token_accumulation_pct",
  help: "Max governance token share accumulated by single wallet in 48h window",
  labelNames: ["governance_mint"] as const,
  registers: [registry],
});

// ─── Bridge / Wrapped Asset Metrics ──────────────────────────────────────────

const bridgeWrappedSupply = new Gauge({
  name: "solana_bridge_wrapped_supply",
  help: "Total wrapped asset supply on Solana",
  labelNames: ["mint", "bridge_program", "source_chain"] as const,
  registers: [registry],
});

const bridgeLockedCollateral = new Gauge({
  name: "solana_bridge_locked_collateral",
  help: "Expected locked collateral backing wrapped supply (from off-chain source)",
  labelNames: ["mint", "bridge_program"] as const,
  registers: [registry],
});

const bridgeSupplyMismatch = new Gauge({
  name: "solana_bridge_supply_mismatch",
  help: "Difference between wrapped supply and locked collateral (0 = healthy)",
  labelNames: ["mint", "bridge_program"] as const,
  registers: [registry],
});

// ─── DePIN Node Metrics ───────────────────────────────────────────────────────

const depinNodeStatus = new Gauge({
  name: "solana_depin_node_active",
  help: "1 if DePIN node account is active and staked, 0 otherwise",
  labelNames: ["node_address", "node_type"] as const,
  registers: [registry],
});

const depinNodeStake = new Gauge({
  name: "solana_depin_node_stake_lamports",
  help: "Staked amount for DePIN node in lamports",
  labelNames: ["node_address", "node_type"] as const,
  registers: [registry],
});

const depinEpochRewards = new Gauge({
  name: "solana_depin_epoch_reward_tokens",
  help: "Token rewards earned by DePIN nodes in the current epoch",
  labelNames: ["node_address", "node_type"] as const,
  registers: [registry],
});

const depinProofSubmissions = new Counter({
  name: "solana_depin_proof_submission_total",
  help: "Total proof-of-work submissions by DePIN nodes",
  labelNames: ["node_type", "status"] as const,
  registers: [registry],
});

// ─── Fee Payer & Treasury Metrics ─────────────────────────────────────────────

const feePayerBalance = new Gauge({
  name: "solana_fee_payer_balance_sol",
  help: "Fee payer wallet balance in SOL",
  labelNames: ["alias", "address"] as const,
  registers: [registry],
});

const vaultBalance = new Gauge({
  name: "solana_vault_balance_lamports",
  help: "Protocol vault balance in lamports",
  labelNames: ["vault_alias", "vault_address"] as const,
  registers: [registry],
});

// ─── Synthetic Probe Metrics ──────────────────────────────────────────────────

const syntheticProbeSuccess = new Gauge({
  name: "solana_synthetic_rpc_probe_success",
  help: "1 if synthetic RPC probe succeeded",
  labelNames: ["endpoint"] as const,
  registers: [registry],
});

const syntheticInstructionSuccess = new Gauge({
  name: "solana_synthetic_instruction_success",
  help: "1 if synthetic instruction probe succeeded",
  labelNames: ["program_id", "instruction_name"] as const,
  registers: [registry],
});

const syntheticFeePayerBalance = new Gauge({
  name: "solana_synthetic_fee_payer_balance_sol",
  help: "Fee payer balance observed by synthetic probe",
  labelNames: ["alias", "address"] as const,
  registers: [registry],
});

// ─── Scrape Functions ─────────────────────────────────────────────────────────

const NETWORK_TIP_CACHE: { slot: number; updatedAt: number } = { slot: 0, updatedAt: 0 };

async function getNetworkTip(connections: Map<string, Connection>): Promise<number> {
  if (Date.now() - NETWORK_TIP_CACHE.updatedAt < 5000) {
    return NETWORK_TIP_CACHE.slot;
  }
  for (const conn of connections.values()) {
    try {
      const slot = await conn.getSlot("finalized");
      NETWORK_TIP_CACHE.slot = slot;
      NETWORK_TIP_CACHE.updatedAt = Date.now();
      return slot;
    } catch {}
  }
  return NETWORK_TIP_CACHE.slot;
}

async function scrapeRpcHealth(
  connections: Map<string, Connection>
): Promise<void> {
  const networkTip = await getNetworkTip(connections);

  for (const [alias, conn] of connections) {
    const start = performance.now();
    try {
      const slot = await Promise.race([
        conn.getSlot("confirmed"),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      const latencySec = (performance.now() - start) / 1000;
      const lag = Math.max(0, networkTip - slot);

      rpcHealthGauge.set({ endpoint: alias }, lag < 50 ? 1 : 0);
      slotLagGauge.set({ endpoint: alias }, lag);
      rpcLatencyHistogram.observe({ endpoint: alias, method: "getSlot" }, latencySec);
    } catch {
      rpcHealthGauge.set({ endpoint: alias }, 0);
      slotLagGauge.set({ endpoint: alias }, 999);
      rpcLatencyHistogram.observe(
        { endpoint: alias, method: "getSlot" },
        (performance.now() - start) / 1000
      );
    }
  }
}

async function scrapeFeePayersAndVaults(
  connection: Connection
): Promise<void> {
  const allAddresses = [...FEE_PAYER_ADDRESSES, ...VAULT_ADDRESSES];
  if (allAddresses.length === 0) return;

  const pubkeys = allAddresses.map((a) => new PublicKey(a));
  try {
    const accounts = await connection.getMultipleAccountsInfo(pubkeys, {
      dataSlice: { offset: 0, length: 0 },
      commitment: "confirmed",
    });

    for (let i = 0; i < FEE_PAYER_ADDRESSES.length; i++) {
      const addr = FEE_PAYER_ADDRESSES[i];
      const lamports = accounts[i]?.lamports ?? 0;
      feePayerBalance.set({ alias: `fee-payer-${i}`, address: addr }, lamports / 1e9);
    }

    const vaultOffset = FEE_PAYER_ADDRESSES.length;
    for (let i = 0; i < VAULT_ADDRESSES.length; i++) {
      const addr = VAULT_ADDRESSES[i];
      const lamports = accounts[vaultOffset + i]?.lamports ?? 0;
      vaultBalance.set({ vault_alias: `vault-${i}`, vault_address: addr }, lamports);
    }
  } catch (err) {
    console.error("[exporter] Failed to scrape fee payers/vaults:", err);
  }
}

async function scrapeDepinNodes(connection: Connection): Promise<void> {
  if (DEPIN_NODE_ADDRESSES.length === 0) return;

  const pubkeys = DEPIN_NODE_ADDRESSES.map((a) => new PublicKey(a));
  try {
    const accounts = await connection.getMultipleAccountsInfo(pubkeys, {
      commitment: "confirmed",
    });

    for (let i = 0; i < DEPIN_NODE_ADDRESSES.length; i++) {
      const addr = DEPIN_NODE_ADDRESSES[i];
      const acc = accounts[i];
      const active = acc !== null ? 1 : 0;
      depinNodeStatus.set({ node_address: addr, node_type: "unknown" }, active);

      if (acc) {
        depinNodeStake.set(
          { node_address: addr, node_type: "unknown" },
          acc.lamports
        );
      }
    }
  } catch (err) {
    console.error("[exporter] Failed to scrape DePIN nodes:", err);
  }
}

// ─── Hono App ─────────────────────────────────────────────────────────────────

const app = new Hono();

app.get("/metrics", async (c) => {
  return c.text(await registry.metrics(), 200, {
    "Content-Type": registry.contentType,
  });
});

app.get("/health", (c) =>
  c.json({ status: "ok", cluster: CLUSTER, timestamp: new Date().toISOString() })
);

app.get("/live", (c) => c.text("ok"));

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const connections = new Map<string, Connection>(
  RPC_ENDPOINTS.map((ep) => [ep.alias, new Connection(ep.url, "confirmed")])
);

const [primaryConnection] = connections.values();

async function runScrape(): Promise<void> {
  await Promise.allSettled([
    scrapeRpcHealth(connections),
    scrapeFeePayersAndVaults(primaryConnection),
    scrapeDepinNodes(primaryConnection),
  ]);
}

setInterval(runScrape, SCRAPE_INTERVAL_MS);
runScrape().catch(console.error);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(
    `[solana-exporter] Listening on :${PORT} | cluster=${CLUSTER} | programs=${PROGRAM_IDS.length} | endpoints=${RPC_ENDPOINTS.length}`
  );
});
