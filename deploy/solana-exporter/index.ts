import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { Connection } from "@solana/web3.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const CLUSTER = process.env.SOLANA_CLUSTER ?? "mainnet-beta";
const SCRAPE_INTERVAL_MS =
  Number.parseInt(process.env.SCRAPE_INTERVAL_SECONDS ?? "15", 10) * 1000;
const PROGRAM_IDS = (process.env.PROGRAM_IDS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

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
  rpcEndpoints: EndpointConfig[];
};

export function parseProgramIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function buildExporterConfig(env = process.env): ExporterConfig {
  const rpcEndpoints: EndpointConfig[] = [
  {
    alias: env.HELIUS_RPC_ALIAS ?? "helius-primary",
    url: env.HELIUS_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  },
  {
    alias: env.QUICKNODE_RPC_ALIAS ?? "quicknode-backup",
    url: env.QUICKNODE_RPC_URL ?? "",
  },
  ].filter((endpoint) => endpoint.url.length > 0);

  return {
    port: Number.parseInt(env.PORT ?? "3001", 10),
    cluster: env.SOLANA_CLUSTER ?? "mainnet-beta",
    scrapeIntervalMs:
      Number.parseInt(env.SCRAPE_INTERVAL_SECONDS ?? "15", 10) * 1000,
    programIds: parseProgramIds(env.PROGRAM_IDS),
    rpcEndpoints,
  };
}

const CONFIG = buildExporterConfig();
const { port: PORT, cluster: CLUSTER, scrapeIntervalMs: SCRAPE_INTERVAL_MS, programIds: PROGRAM_IDS, rpcEndpoints: RPC_ENDPOINTS } = CONFIG;

export const registry = new Registry();
registry.setDefaultLabels({ cluster: CLUSTER });
collectDefaultMetrics({ register: registry, prefix: "nodejs_" });

const rpcHealthGauge = new Gauge({
  name: "solana_rpc_healthy",
  help: "1 if RPC endpoint is healthy, 0 otherwise",
  labelNames: ["cluster", "endpoint"],
  registers: [registry],
});

const rpcLatencyHistogram = new Histogram({
  name: "solana_rpc_request_duration_seconds",
  help: "RPC endpoint request duration in seconds",
  labelNames: ["cluster", "endpoint", "method"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const rpcErrorsCounter = new Counter({
  name: "solana_rpc_errors_total",
  help: "Total RPC errors by endpoint, method, and bounded error class",
  labelNames: ["cluster", "endpoint", "method", "error_class"],
  registers: [registry],
});

const slotLagGauge = new Gauge({
  name: "solana_slot_lag_slots",
  help: "Number of slots this endpoint is behind trusted network tip",
  labelNames: ["cluster", "endpoint"],
  registers: [registry],
});

const currentSlotGauge = new Gauge({
  name: "solana_current_slot",
  help: "Current confirmed slot observed by endpoint",
  labelNames: ["cluster", "endpoint"],
  registers: [registry],
});

new Counter({
  name: "solana_transaction_total",
  help: "Transactions observed by monitored programs. Populate via webhook/indexer integration.",
  labelNames: ["cluster", "program_id", "instruction", "status"],
  registers: [registry],
});

new Histogram({
  name: "solana_transaction_confirmation_seconds",
  help: "Transaction confirmation duration. Populate via webhook/indexer integration.",
  labelNames: ["cluster", "program_id", "instruction"],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

new Histogram({
  name: "solana_instruction_cu_consumed",
  help: "Compute units consumed by instruction. Populate via enhanced transaction/indexer integration.",
  labelNames: ["cluster", "program_id", "instruction"],
  buckets: [
    1_000, 10_000, 50_000, 100_000, 200_000, 400_000, 800_000, 1_200_000,
    1_400_000,
  ],
  registers: [registry],
});

export function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("timeout")) return "timeout";
  if (message.toLowerCase().includes("rate")) return "rate_limited";
  if (message.toLowerCase().includes("fetch")) return "network";
  return "rpc_error";
}

export async function getSlot(
  endpoint: EndpointConfig,
): Promise<{ slot: number; latencySeconds: number }> {
  const start = performance.now();
  const connection = new Connection(endpoint.url, "confirmed");
  const slot = await connection.getSlot("confirmed");
  return { slot, latencySeconds: (performance.now() - start) / 1000 };
}

export async function checkRpcHealth(
  endpoints: EndpointConfig[] = RPC_ENDPOINTS,
): Promise<EndpointHealth[]> {
  const checkedAt = new Date().toISOString();
  const firstPass = await Promise.allSettled(endpoints.map(getSlot));
  const validSlots = firstPass
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        slot: number;
        latencySeconds: number;
      }> => result.status === "fulfilled",
    )
    .map((result) => result.value.slot);
  const trustedTip = Math.max(...validSlots, 0);

  return Promise.all(
    endpoints.map(async (endpoint): Promise<EndpointHealth> => {
      try {
        const { slot, latencySeconds } = await getSlot(endpoint);
        const slotLag = Math.max(0, trustedTip - slot);
        const healthy = slotLag < 25 && latencySeconds < 5;

        rpcHealthGauge.set(
          { cluster: CLUSTER, endpoint: endpoint.alias },
        healthy ? 1 : 0,
        );
        rpcLatencyHistogram.observe(
          { cluster: CLUSTER, endpoint: endpoint.alias, method: "getSlot" },
          latencySeconds,
        );
        slotLagGauge.set(
          { cluster: CLUSTER, endpoint: endpoint.alias },
          slotLag,
        );
        currentSlotGauge.set(
          { cluster: CLUSTER, endpoint: endpoint.alias },
          slot,
        );

        return {
          endpoint: endpoint.alias,
          healthy,
          slotLag,
          latencyMs: Math.round(latencySeconds * 1000),
          currentSlot: slot,
          checkedAt,
        };
      } catch (error) {
        const errorClass = classifyError(error);
        rpcHealthGauge.set({ cluster: CLUSTER, endpoint: endpoint.alias }, 0);
        rpcErrorsCounter.inc({
          cluster: CLUSTER,
          endpoint: endpoint.alias,
          method: "getSlot",
          error_class: errorClass,
        });
        return {
          endpoint: endpoint.alias,
          healthy: false,
          slotLag: -1,
          latencyMs: -1,
          currentSlot: 0,
          errorClass,
          checkedAt,
        };
      }
    }),
  );
}

let lastHealthResults: EndpointHealth[] = [];
let lastScrapeError: string | null = null;

async function scrapeLoop() {
  try {
    lastHealthResults = await checkRpcHealth();
    lastScrapeError = null;
  } catch (error) {
    lastScrapeError = classifyError(error);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "scrape_failed",
        errorClass: lastScrapeError,
      }),
    );
  }
}

const app = new Hono();

app.get("/metrics", async (c) => {
  const metrics = await registry.metrics();
  c.header("Content-Type", registry.contentType);
  return c.body(metrics);
});

app.get("/live", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

app.get("/ready", (c) => {
  const ready =
    lastHealthResults.length > 0 &&
    lastHealthResults.some((result) => result.healthy);
  return c.json(
    {
      status: ready ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
});

app.get("/healthz", (c) => {
  const healthy = lastHealthResults.some((result) => result.healthy);
  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      cluster: CLUSTER,
      endpoints: lastHealthResults,
      monitoredPrograms: PROGRAM_IDS,
      lastScrapeError,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});

app.get("/health", (c) => c.redirect("/healthz", 308));

app.get("/", (c) =>
  c.json({
    name: "solana-observability-exporter",
    version: "1.0.0",
    endpoints: ["/live", "/ready", "/healthz", "/metrics"],
    monitoredPrograms: PROGRAM_IDS,
  }),
);

export function startExporter() {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "exporter_started",
      port: PORT,
      endpoints: RPC_ENDPOINTS.map((e) => e.alias),
    }),
  );
  void scrapeLoop();
  setInterval(() => void scrapeLoop(), SCRAPE_INTERVAL_MS);
  serve({ fetch: app.fetch, port: PORT });
}

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  startExporter();
}
