# Infrastructure Monitoring for Solana

RPC endpoint health, network-level metrics, and infrastructure reliability patterns for Solana dApps.

## RPC Health Checks

### Multi-Endpoint Health Monitor

Always monitor multiple RPC endpoints. Never rely on a single source of truth.

```typescript
// rpc-health-monitor.ts
import { createSolanaRpc, type SolanaRpcApiMainnet } from '@solana/kit';

interface EndpointConfig {
  url: string;
  weight: number;        // For failover priority (higher = preferred)
  timeoutMs: number;
  retries: number;
  tags: string[];        // e.g., ['helius', 'mainnet', 'paid']
}

interface HealthResult {
  endpoint: string;
  healthy: boolean;
  slotLag: number;       // Slots behind tip
  blockTime: number;     // ms to produce latest block
  responseTimeMs: number;
  rateLimitRemaining: number | null;
  version: string;
  features: {
    priorityFees: boolean;
    blockSubscription: boolean;
    transactionHistory: boolean;
  };
  lastHealthyAt: Date;
  consecutiveFailures: number;
}

class RpcHealthMonitor {
  private endpoints: EndpointConfig[];
  private healthMap: Map<string, HealthResult> = new Map();
  private readonly UNHEALTHY_THRESHOLD = 3;  // Consecutive failures before marking unhealthy
  private readonly MAX_SLOT_LAG = 25;        // ~10 seconds behind

  constructor(endpoints: EndpointConfig[]) {
    this.endpoints = endpoints;
  }

  async checkHealth(): Promise<HealthResult[]> {
    const checks = this.endpoints.map(ep => this.checkEndpoint(ep));
    return Promise.all(checks);
  }

  private async checkEndpoint(config: EndpointConfig): Promise<HealthResult> {
    const start = performance.now();
    const previous = this.healthMap.get(config.url);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      const rpc = createSolanaRpc(config.url);

      // Parallel checks: slot + version + block time
      const [slot, version, blockTime] = await Promise.all([
        rpc.getSlot().send(),
        rpc.getVersion().send(),
        rpc.getBlockTime(await rpc.getSlot().send()).send(),
      ]);

      clearTimeout(timeout);

      const tipSlot = await this.getTipSlot();
      const slotLag = tipSlot - Number(slot);
      const responseTimeMs = performance.now() - start;

      const result: HealthResult = {
        endpoint: config.url,
        healthy: slotLag <= this.MAX_SLOT_LAG,
        slotLag,
        blockTime: Number(blockTime) * 1000,
        responseTimeMs,
        rateLimitRemaining: this.extractRateLimit(/* headers */),
        version: version['solana-core'],
        features: await this.probeFeatures(rpc),
        lastHealthyAt: new Date(),
        consecutiveFailures: 0,
      };

      this.healthMap.set(config.url, result);
      return result;

    } catch (error) {
      const failures = (previous?.consecutiveFailures ?? 0) + 1;
      const result: HealthResult = {
        endpoint: config.url,
        healthy: false,
        slotLag: -1,
        blockTime: -1,
        responseTimeMs: performance.now() - start,
        rateLimitRemaining: null,
        version: 'unknown',
        features: { priorityFees: false, blockSubscription: false, transactionHistory: false },
        lastHealthyAt: previous?.lastHealthyAt ?? new Date(0),
        consecutiveFailures: failures,
      };

      this.healthMap.set(config.url, result);
      return result;
    }
  }

  private async getTipSlot(): Promise<number> {
    // Use highest slot across all healthy endpoints
    const slots = Array.from(this.healthMap.values())
      .filter(h => h.healthy)
      .map(h => h.slotLag);
    return Math.max(...slots, 0);
  }

  getBestEndpoint(): string | null {
    const healthy = Array.from(this.healthMap.values())
      .filter(h => h.healthy)
      .sort((a, b) => a.responseTimeMs - b.responseTimeMs);

    return healthy[0]?.endpoint ?? null;
  }

  private async probeFeatures(rpc: any): Promise<HealthResult['features']> {
    const [priorityFees, blockSub, txHistory] = await Promise.allSettled([
      rpc.getRecentPriorityFeeEstimate().send(),
      // WebSocket probe would go here
      rpc.getSignaturesForAddress(
        '11111111111111111111111111111111' as Address
      ).send(),
    ]);

    return {
      priorityFees: priorityFees.status === 'fulfilled',
      blockSubscription: false, // Probed via WS
      transactionHistory: txHistory.status === 'fulfilled',
    };
  }

  private extractRateLimit(headers: any): number | null {
    // Helius: x-ratelimit-remaining
    // QuickNode: x-ratelimit-remaining
    return headers?.['x-ratelimit-remaining'] ?? null;
  }
}
```

### HTTP Health Check Endpoint (Hono)

```typescript
// health-api.ts
import { Hono } from 'hono';
import { RpcHealthMonitor } from './rpc-health-monitor';

const app = new Hono();

// Kubernetes / load balancer probe
app.get('/healthz', async (c) => {
  const results = await monitor.checkHealth();
  const allHealthy = results.every(r => r.healthy);

  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    endpoints: results.map(r => ({
      url: r.endpoint,
      healthy: r.healthy,
      slotLag: r.slotLag,
      responseMs: Math.round(r.responseTimeMs),
    })),
  }, allHealthy ? 200 : 503);
});

// Readiness probe — can we serve traffic?
app.get('/ready', async (c) => {
  const best = monitor.getBestEndpoint();
  return c.json(
    { ready: best !== null, endpoint: best },
    best ? 200 : 503
  );
});

// Liveness probe — are we running?
app.get('/live', (c) => c.json({ status: 'alive' }));

// Detailed status for operators
app.get('/status', async (c) => {
  const results = await monitor.checkHealth();
  return c.json({
    summary: {
      total: results.length,
      healthy: results.filter(r => r.healthy).length,
      degraded: results.filter(r => !r.healthy && r.consecutiveFailures < 3).length,
      down: results.filter(r => r.consecutiveFailures >= 3).length,
    },
    endpoints: results,
  });
});
```

## Slot Lag & Network Metrics

```typescript
// network-metrics.ts
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const meterProvider = new MeterProvider({
  readers: [new PrometheusExporter({ port: 9464 })],
});

const meter = meterProvider.getMeter('solana-infra');

// Gauges
const slotLagGauge = meter.createObservableGauge('solana_slot_lag_slots', {
  description: 'Slots behind network tip',
});

const blockTimeGauge = meter.createObservableGauge('solana_block_time_ms', {
  description: 'Time to produce latest block',
});

const rpcLatencyHistogram = meter.createHistogram('solana_rpc_request_duration_seconds', {
  description: 'RPC request latency',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000] },
});

// Track slot progression for TPS calculation
class NetworkMetricsCollector {
  private lastSlot = 0;
  private lastTimestamp = Date.now();

  async collect(rpc: any) {
    const currentSlot = await rpc.getSlot().send();
    const currentTime = Date.now();
    const blockTime = await rpc.getBlockTime(currentSlot).send();

    // Calculate approximate TPS from slot progression
    const slotsProduced = Number(currentSlot) - this.lastSlot;
    const timeElapsed = (currentTime - this.lastTimestamp) / 1000;
    const tps = slotsProduced > 0 && timeElapsed > 0
      ? await this.estimateTps(rpc, currentSlot)
      : 0;

    slotLagGauge.addCallback((obs) => {
      obs.observe(this.slotLag, { endpoint: this.endpointName });
    });

    this.lastSlot = Number(currentSlot);
    this.lastTimestamp = currentTime;

    return {
      slot: Number(currentSlot),
      blockTime: Number(blockTime),
      tps: Math.round(tps),
      estimatedTps: tps,
    };
  }

  private async estimateTps(rpc: any, currentSlot: number): Promise<number> {
    try {
      const block = await rpc.getBlock(currentSlot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'none',
      }).send();

      // Count signatures as proxy for transaction count
      const txCount = block?.signatures?.length ?? 0;
      return txCount / 0.4; // ~400ms block time
    } catch {
      return 0;
    }
  }
}
```

## Rate Limit Monitoring

```typescript
// rate-limit-tracker.ts
interface RateLimitState {
  remaining: number;
  limit: number;
  resetAt: Date;
  window: string;      // e.g., "1m", "1h"
}

class RateLimitTracker {
  private state: Map<string, RateLimitState> = new Map();
  private alertsFired: Map<string, number> = new Map();

  update(endpoint: string, headers: Headers) {
    const remaining = parseInt(headers.get('x-ratelimit-remaining') ?? '0');
    const limit = parseInt(headers.get('x-ratelimit-limit') ?? '0');
    const reset = headers.get('x-ratelimit-reset');

    this.state.set(endpoint, {
      remaining,
      limit,
      resetAt: reset ? new Date(parseInt(reset) * 1000) : new Date(Date.now() + 60000),
      window: headers.get('x-ratelimit-window') ?? '1m',
    });

    // Alert when < 20% remaining
    if (limit > 0 && remaining / limit < 0.2) {
      this.fireAlert(endpoint, remaining, limit);
    }
  }

  getUtilization(endpoint: string): number {
    const state = this.state.get(endpoint);
    if (!state || state.limit === 0) return 0;
    return 1 - (state.remaining / state.limit);
  }

  shouldThrottle(endpoint: string): boolean {
    return this.getUtilization(endpoint) > 0.9;
  }

  private fireAlert(endpoint: string, remaining: number, limit: number) {
    const lastAlert = this.alertsFired.get(endpoint) ?? 0;
    const now = Date.now();

    // Throttle alerts to 1 per 5 minutes per endpoint
    if (now - lastAlert < 300_000) return;

    this.alertsFired.set(endpoint, now);

    // Fire alert (see alerting.md for full implementation)
    console.error(`RATE_LIMIT_WARNING: ${endpoint} at ${((1 - remaining/limit) * 100).toFixed(0)}%`);
  }
}
```

## Endpoint Failover Pattern

```typescript
// failover-router.ts
class FailoverRouter {
  private endpoints: EndpointConfig[];
  private currentIndex = 0;
  private failureCounts: Map<string, number> = new Map();
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_RESET_MS = 30_000;
  private circuitOpen: Map<string, number> = new Map(); // endpoint -> openedAt

  constructor(endpoints: EndpointConfig[]) {
    this.endpoints = endpoints.sort((a, b) => b.weight - a.weight);
  }

  async execute<T>(operation: (rpc: string) => Promise<T>): Promise<T> {
    const endpoint = this.getHealthyEndpoint();
    if (!endpoint) {
      throw new Error('All RPC endpoints are down or circuit-open');
    }

    try {
      const result = await operation(endpoint.url);
      this.recordSuccess(endpoint.url);
      return result;
    } catch (error) {
      this.recordFailure(endpoint.url);
      // Retry with next endpoint
      return this.execute(operation);
    }
  }

  private getHealthyEndpoint(): EndpointConfig | null {
    const now = Date.now();

    for (const ep of this.endpoints) {
      const openedAt = this.circuitOpen.get(ep.url);
      if (openedAt && now - openedAt < this.CIRCUIT_BREAKER_RESET_MS) {
        continue; // Circuit still open
      }
      if (openedAt) {
        this.circuitOpen.delete(ep.url); // Half-open, allow try
      }

      const failures = this.failureCounts.get(ep.url) ?? 0;
      if (failures < this.CIRCUIT_BREAKER_THRESHOLD) {
        return ep;
      }
    }

    return null;
  }

  private recordSuccess(url: string) {
    this.failureCounts.set(url, 0);
    this.circuitOpen.delete(url);
  }

  private recordFailure(url: string) {
    const count = (this.failureCounts.get(url) ?? 0) + 1;
    this.failureCounts.set(url, count);

    if (count >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitOpen.set(url, Date.now());
    }
  }
}
```

## Prometheus Metrics Export

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'solana-dapp'
    static_configs:
      - targets: ['localhost:9464']
    scrape_interval: 15s
    metrics_path: /metrics

  - job_name: 'solana-health'
    static_configs:
      - targets: ['localhost:3000']
    scrape_interval: 5s
    metrics_path: /metrics/health
```

## Cloudflare Workers Edge Monitoring

```typescript
// worker-monitoring.ts
import { Counter, Gauge, Histogram } from '@cloudflare/workers-metrics';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const start = Date.now();
    const url = new URL(request.url);

    try {
      // Route to handler
      const response = await handleRequest(request, env, ctx);

      // Record metrics
      requestDuration.record(Date.now() - start, {
        path: url.pathname,
        status: response.status.toString(),
      });

      requestCounter.add(1, {
        path: url.pathname,
        status: response.status.toString(),
        method: request.method,
      });

      return response;
    } catch (error) {
      errorCounter.add(1, { path: url.pathname, type: error.name });
      throw error;
    }
  },
};

// Workers Analytics Engine binding
async function logToAnalytics(engine: AnalyticsEngineDataset, data: any) {
  engine.writeDataPoint({
    blobs: [data.endpoint, data.method, data.status],
    doubles: [data.latencyMs, data.slotLag],
    indexes: [data.customerId],
  });
}
```

## Common RPC Provider Headers

| Provider | Rate Limit Header | Remaining Header | Reset Header |
|---|---|---|---|
| Helius | `x-ratelimit-limit` | `x-ratelimit-remaining` | `x-ratelimit-reset` |
| QuickNode | `x-ratelimit-limit` | `x-ratelimit-remaining` | — |
| Alchemy | `x-alchemy-ratelimit` | `x-alchemy-ratelimit-remaining` | — |
| Custom | Varies | Varies | Varies |

## Resources

- [Helius Status API](https://status.helius.xyz/)
- [Solana Ping Statistics](https://solana.com/docs/rpc/http/getrecentperformancesample)
- [Yellowstone gRPC for streaming](https://github.com/rpcpool/yellowstone-grpc)
- [Prometheus Node.js client](https://github.com/siimon/prom-client)
- [OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)
