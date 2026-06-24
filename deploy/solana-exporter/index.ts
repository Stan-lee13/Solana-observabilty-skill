/**
 * Solana Observability Exporter
 * Prometheus metrics exporter for Solana dApp infrastructure
 *
 * Exposes:
 *   /metrics  — Prometheus scrape endpoint
 *   /health   — Liveness probe
 */
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

// ── Configuration ──────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3001");
const SCRAPE_INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_SECONDS ?? "15") * 1000;
const PROGRAM_IDS = (process.env.PROGRAM_IDS ?? "").split(",").filter(Boolean);
const RPC_ENDPOINTS = [
  { url: process.env.HELIUS_RPC_URL!, label: "helius" },
  { url: process.env.QUICKNODE_RPC_URL!, label: "quicknode" },
].filter((e) => e.url);

// ── Prometheus Registry ───────────────────────────────────────────────────
const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "nodejs_" });

// RPC metrics
const rpcHealthGauge = new Gauge({
  name: "solana_rpc_healthy",
  help: "1 if RPC endpoint is healthy, 0 if not",
  labelNames: ["endpoint"],
  registers: [registry],
});

const rpcLatencyHistogram = new Histogram({
  name: "solana_rpc_latency_ms",
  help: "RPC endpoint response latency in milliseconds",
  labelNames: ["endpoint", "method"],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
  registers: [registry],
});

const slotLagGauge = new Gauge({
  name: "solana_slot_lag",
  help: "Number of slots this endpoint is behind the tip",
  labelNames: ["endpoint"],
  registers: [registry],
});

const currentSlotGauge = new Gauge({
  name: "solana_current_slot",
  help: "Current confirmed slot",
  labelNames: ["endpoint"],
  registers: [registry],
});

// Transaction metrics
const txSuccessCounter = new Counter({
  name: "solana_tx_success_total",
  help: "Total successful transactions",
  labelNames: ["program_id", "instruction"],
  registers: [registry],
});

const txFailureCounter = new Counter({
  name: "solana_tx_failure_total",
  help: "Total failed transactions",
  labelNames: ["program_id", "instruction", "error_type"],
  registers: [registry],
});

const txConfirmationHistogram = new Histogram({
  name: "solana_tx_confirmation_ms",
  help: "Transaction confirmation time in milliseconds",
  labelNames: ["program_id"],
  buckets: [500, 1000, 2000, 5000, 10000, 30000],
  registers: [registry],
});

const cuUsageHistogram = new Histogram({
  name: "solana_cu_consumed",
  help: "Compute units consumed per transaction",
  labelNames: ["program_id", "instruction"],
  buckets: [1000, 10000, 50000, 100000, 200000, 400000, 800000, 1200000],
  registers: [registry],
});

// ── Health Check Logic ────────────────────────────────────────────────────
interface EndpointHealth {
  label: string;
  url: string;
  healthy: boolean;
  slotLag: number;
  latencyMs: number;
  currentSlot: number;
}

async function checkRpcHealth(): Promise<EndpointHealth[]> {
  let tipSlot = 0;

  // First pass: get tip slot from all endpoints
  const slots = await Promise.allSettled(
    RPC_ENDPOINTS.map(async (ep) => {
      const conn = new Connection(ep.url, "confirmed");
      return conn.getSlot("confirmed");
    })
  );

  const validSlots = slots
    .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
    .map((r) => r.value);

  tipSlot = Math.max(...validSlots, 0);

  // Second pass: full health check
  return Promise.all(
    RPC_ENDPOINTS.map(async (ep): Promise<EndpointHealth> => {
      const start = Date.now();
      try {
        const conn = new Connection(ep.url, "confirmed");
        const slot = await conn.getSlot("confirmed");
        const latencyMs = Date.now() - start;
        const slotLag = tipSlot - slot;
        const healthy = slotLag < 25; // >25 slots = ~10s behind tip

        rpcHealthGauge.set({ endpoint: ep.label }, healthy ? 1 : 0);
        rpcLatencyHistogram.observe({ endpoint: ep.label, method: "getSlot" }, latencyMs);
        slotLagGauge.set({ endpoint: ep.label }, slotLag);
        currentSlotGauge.set({ endpoint: ep.label }, slot);

        return { label: ep.label, url: ep.url, healthy, slotLag, latencyMs, currentSlot: slot };
      } catch (e) {
        const latencyMs = Date.now() - start;
        rpcHealthGauge.set({ endpoint: ep.label }, 0);
        rpcLatencyHistogram.observe({ endpoint: ep.label, method: "getSlot" }, latencyMs);
        return { label: ep.label, url: ep.url, healthy: false, slotLag: -1, latencyMs, currentSlot: 0 };
      }
    })
  );
}

// ── Scrape Loop ────────────────────────────────────────────────────────────
let lastHealthResults: EndpointHealth[] = [];

async function scrapeLoop() {
  try {
    lastHealthResults = await checkRpcHealth();
  } catch (e) {
    console.error("Scrape error:", e);
  }
}

scrapeLoop();
setInterval(scrapeLoop, SCRAPE_INTERVAL);

// ── HTTP Server ────────────────────────────────────────────────────────────
const app = new Hono();

app.get("/metrics", async (c) => {
  const metrics = await registry.metrics();
  c.header("Content-Type", registry.contentType);
  return c.body(metrics);
});

app.get("/health", (c) => {
  const healthy = lastHealthResults.some((r) => r.healthy);
  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      endpoints: lastHealthResults.map((r) => ({
        label: r.label,
        healthy: r.healthy,
        slotLag: r.slotLag,
        latencyMs: r.latencyMs,
      })),
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503
  );
});

app.get("/", (c) =>
  c.json({
    name: "solana-observability-exporter",
    version: "1.0.0",
    endpoints: ["/metrics", "/health"],
    monitoredPrograms: PROGRAM_IDS,
  })
);

console.log(`Solana Observability Exporter running on :${PORT}`);
console.log(`Monitoring ${RPC_ENDPOINTS.length} RPC endpoint(s): ${RPC_ENDPOINTS.map((e) => e.label).join(", ")}`);
serve({ fetch: app.fetch, port: PORT });
