# Logging & Tracing for Solana

Structured logging, distributed tracing, and correlation patterns for Solana dApp operations.

## Structured Logging Setup

### Pino Configuration (Node.js)

```typescript
// logger.ts
import pino from 'pino';

// Solana-specific log context enrichment
interface SolanaContext {
  rpc_endpoint?: string;
  program_id?: string;
  instruction?: string;
  transaction_signature?: string;
  wallet_address?: string;
  slot?: number;
  compute_units?: number;
  priority_fee?: number;
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  correlation_id?: string;
}

let currentContext: SolanaContext = {};

export function setLogContext(context: Partial<SolanaContext>) {
  currentContext = { ...currentContext, ...context };
}

export function clearLogContext(keys?: (keyof SolanaContext)[]) {
  if (keys) {
    for (const key of keys) {
      delete currentContext[key];
    }
  } else {
    currentContext = {};
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  
  // Redact sensitive fields
  redact: {
    paths: [
      '*.private_key',
      '*.secret',
      '*.mnemonic',
      '*.seed',
      'headers.authorization',
      '*.password',
    ],
    remove: true,
  },

  // Solana-specific mixin
  mixin() {
    return {
      ...currentContext,
      service: 'solana-dapp',
      timestamp: new Date().toISOString(),
    };
  },

  // Pretty print in development
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,

  // Standard serializers
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// Specialized loggers for different domains
export const rpcLogger = logger.child({ domain: 'rpc' });
export const programLogger = logger.child({ domain: 'program' });
export const walletLogger = logger.child({ domain: 'wallet' });
export const metricsLogger = logger.child({ domain: 'metrics' });

// Helper for transaction lifecycle logging
export function logTransactionLifecycle(
  signature: string,
  stage: 'initiated' | 'signed' | 'sent' | 'simulated' | 'confirmed' | 'finalized' | 'failed',
  details: {
    programId?: string;
    instruction?: string;
    computeUnits?: number;
    error?: string;
    confirmationTimeMs?: number;
    slot?: number;
  }
) {
  const logData = {
    event: 'transaction_lifecycle',
    transaction_signature: signature,
    stage,
    ...details,
  };

  if (stage === 'failed') {
    programLogger.error(logData, `Transaction ${signature} failed: ${details.error}`);
  } else {
    programLogger.info(logData, `Transaction ${signature} reached stage: ${stage}`);
  }
}
```

### Log Entry Examples

```json
// RPC request log
{
  "level": "info",
  "time": 1704067200000,
  "msg": "RPC request completed",
  "domain": "rpc",
  "rpc_endpoint": "https://mainnet.helius-rpc.com",
  "method": "getTransaction",
  "latency_ms": 245,
  "slot": 285472341,
  "cluster": "mainnet-beta",
  "correlation_id": "abc-123-def",
  "service": "solana-dapp"
}

// Program instruction log
{
  "level": "info",
  "time": 1704067200100,
  "msg": "Instruction executed",
  "domain": "program",
  "program_id": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "instruction": "buy",
  "transaction_signature": "5UfgJ5v...",
  "compute_units": 48521,
  "slot": 285472341,
  "cluster": "mainnet-beta",
  "correlation_id": "abc-123-def",
  "service": "solana-dapp"
}

// Error log
{
  "level": "error",
  "time": 1704067200200,
  "msg": "Transaction simulation failed",
  "domain": "program",
  "program_id": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "instruction": "sell",
  "transaction_signature": "3KjM9p...",
  "error": "InsufficientFunds",
  "error_details": {
    "code": 1,
    "num": 1,
    "msg": "insufficient funds"
  },
  "cluster": "mainnet-beta",
  "correlation_id": "abc-123-def",
  "service": "solana-dapp"
}
```

## Distributed Tracing with OpenTelemetry

### Setup

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// Custom Solana semantic conventions
export const SOLANA_ATTRIBUTES = {
  CLUSTER: 'solana.cluster',
  RPC_ENDPOINT: 'solana.rpc.endpoint',
  PROGRAM_ID: 'solana.program.id',
  INSTRUCTION_NAME: 'solana.instruction.name',
  TRANSACTION_SIGNATURE: 'solana.transaction.signature',
  COMPUTE_UNITS_CONSUMED: 'solana.compute_units.consumed',
  COMPUTE_UNITS_REQUESTED: 'solana.compute_units.requested',
  PRIORITY_FEE_MICRO_LAMPORTS: 'solana.priority_fee.micro_lamports',
  SLOT: 'solana.slot',
  BLOCKHASH: 'solana.blockhash',
  WALLET_ADDRESS: 'solana.wallet.address',
  PDA_ADDRESS: 'solana.pda.address',
  TOKEN_MINT: 'solana.token.mint',
  ACCOUNT_ADDRESS: 'solana.account.address',
  SIGNER_COUNT: 'solana.transaction.signer_count',
  IS_SUCCESSFUL: 'solana.transaction.is_successful',
  ERROR_CODE: 'solana.transaction.error_code',
  RETRY_COUNT: 'solana.transaction.retry_count',
  CONFIRMATION_STATUS: 'solana.transaction.confirmation_status',
  LATENCY_MS: 'solana.transaction.latency_ms',
};

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME ?? 'solana-dapp',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  [SOLANA_ATTRIBUTES.CLUSTER]: process.env.SOLANA_CLUSTER ?? 'mainnet-beta',
});

export function initTracing() {
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? 'http://localhost:4318/v1/metrics',
      }),
      exportIntervalMillis: 15_000,
    }),
  });

  sdk.start();
  return sdk;
}

// Tracer for Solana operations
const tracer = trace.getTracer('solana-dapp');

// Helper: trace a transaction lifecycle
export async function traceTransaction<T>(
  name: string,
  details: {
    programId?: string;
    instruction?: string;
    walletAddress?: string;
    cluster?: string;
  },
  operation: (span: any) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(`solana.tx.${name}`, async (span) => {
    // Set attributes
    if (details.programId) span.setAttribute(SOLANA_ATTRIBUTES.PROGRAM_ID, details.programId);
    if (details.instruction) span.setAttribute(SOLANA_ATTRIBUTES.INSTRUCTION_NAME, details.instruction);
    if (details.walletAddress) span.setAttribute(SOLANA_ATTRIBUTES.WALLET_ADDRESS, details.walletAddress);
    if (details.cluster) span.setAttribute(SOLANA_ATTRIBUTES.CLUSTER, details.cluster);

    try {
      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute(SOLANA_ATTRIBUTES.IS_SUCCESSFUL, true);
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.setAttribute(SOLANA_ATTRIBUTES.IS_SUCCESSFUL, false);
      span.setAttribute(SOLANA_ATTRIBUTES.ERROR_CODE, (error as any).code ?? 'UNKNOWN');
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

// Helper: trace RPC calls
export async function traceRpcCall<T>(
  method: string,
  endpoint: string,
  operation: () => Promise<T>,
): Promise<T> {
  const start = performance.now();

  return tracer.startActiveSpan(`solana.rpc.${method}`, async (span) => {
    span.setAttribute(SOLANA_ATTRIBUTES.RPC_ENDPOINT, endpoint);
    span.setAttribute('rpc.method', method);

    try {
      const result = await operation();
      const latency = performance.now() - start;
      span.setAttribute(SOLANA_ATTRIBUTES.LATENCY_MS, latency);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Trace Propagation

```typescript
// trace-propagation.ts
import { W3CTraceContextPropagator, context, propagation } from '@opentelemetry/core';

const propagator = new W3CTraceContextPropagator();

/**
 * Inject trace context into outgoing requests (e.g., to RPC or webhooks)
 */
export function injectTraceContext(headers: Record<string, string> = {}): Record<string, string> {
  const carrier = {};
  propagator.inject(context.active(), carrier, {
    set(carrier, key, value) {
      (carrier as any)[key] = value;
    },
  });
  return { ...headers, ...carrier };
}

/**
 * Extract trace context from incoming requests (e.g., webhooks)
 */
export function extractTraceContext(headers: Record<string, string>): void {
  propagator.extract(context.active(), headers, {
    get(carrier, key) {
      return (carrier as any)[key] ?? undefined;
    },
    keys(carrier) {
      return Object.keys(carrier);
    },
  });
}

/**
 * Create correlation ID that links HTTP request → RPC call → Transaction
 */
export function createCorrelationContext(
  requestId: string,
  walletAddress?: string,
): { correlationId: string; setInContext: () => void } {
  const correlationId = `${requestId}-${Date.now()}`;

  return {
    correlationId,
    setInContext: () => {
      setLogContext({ correlation_id: correlationId, wallet_address: walletAddress });
    },
  };
}
```

## Cloudflare Workers Logging

```typescript
// workers-logger.ts
export interface WorkersLogger {
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, any>) => void;
  writeDataPoint: (binding: AnalyticsEngineDataset, data: WorkersDataPoint) => void;
}

export interface WorkersDataPoint {
  blobs?: (string | null)[];
  doubles?: (number | null)[];
  indexes?: string[];
}

/**
 * Structured logging for Cloudflare Workers environment
 * Uses Analytics Engine for metrics and console for logs
 */
export class SolanaWorkersLogger implements WorkersLogger {
  private requestId: string;
  private startTime: number;

  constructor(requestId?: string) {
    this.requestId = requestId ?? crypto.randomUUID();
    this.startTime = Date.now();
  }

  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, any>) {
    const entry = {
      level,
      message,
      request_id: this.requestId,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - this.startTime,
      ...data,
    };

    // Workers console is captured by Logpush
    console.log(JSON.stringify(entry));
  }

  writeDataPoint(binding: AnalyticsEngineDataset, data: WorkersDataPoint) {
    // Always include request ID as first index
    const indexes = [this.requestId, ...(data.indexes ?? [])];
    binding.writeDataPoint({
      blobs: data.blobs,
      doubles: data.doubles,
      indexes,
    });
  }

  // Solana-specific helpers
  logRpcCall(method: string, endpoint: string, latencyMs: number, success: boolean) {
    this.log('info', `RPC ${method} ${success ? 'success' : 'failed'}`, {
      rpc_method: method,
      rpc_endpoint: endpoint,
      latency_ms: latencyMs,
      success,
    });
  }

  logTransaction(signature: string, stage: string, details?: Record<string, any>) {
    this.log('info', `TX ${signature}: ${stage}`, {
      transaction_signature: signature,
      transaction_stage: stage,
      ...details,
    });
  }

  logInstruction(programId: string, instruction: string, cuConsumed: number, success: boolean) {
    this.log(success ? 'info' : 'error', `Instruction ${instruction}`, {
      program_id: programId,
      instruction,
      compute_units_consumed: cuConsumed,
      success,
    });
  }
}
```

## Loki LogQL Queries

```promql
# Transaction success rate by program
sum(rate({service="solana-dapp"} |= "transaction_lifecycle" | json | stage="confirmed" [5m])) by (program_id)
/
sum(rate({service="solana-dapp"} |= "transaction_lifecycle" [5m])) by (program_id)

# High-latency RPC calls
{service="solana-dapp"} |= "RPC request completed" | json | latency_ms > 1000

# Errors by instruction
{service="solana-dapp"} |= "transaction_lifecycle" | json | stage="failed"
  | line_format "{{.instruction}}: {{.error}}"

# CU usage trends
{service="solana-dapp"} |= "Instruction executed" | json
  | __error__=""
  | line_format "{{.instruction}}={{.compute_units}}"

# Wallet connection errors
{service="solana-dapp"} |= "wallet" | json | level="error"
  | line_format "{{.wallet_name}}: {{.error_category}}"

# Correlation ID search (trace a single request across all services)
{service="solana-dapp"} | json | correlation_id="abc-123-def"
```

## Grafana Loki Datasource Config

```yaml
# datasource-loki.yml
apiVersion: 1
datasources:
  - name: Loki (Solana Logs)
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
      derivedFields:
        - name: 'Transaction'
          matcherRegex: '"transaction_signature":"([^"]+)"'
          url: 'https://solscan.io/tx/${__value.raw}'
        - name: 'Wallet'
          matcherRegex: '"wallet_address":"([^"]+)"'
          url: 'https://solscan.io/account/${__value.raw}'
        - name: 'Program'
          matcherRegex: '"program_id":"([^"]+)"'
          url: 'https://solscan.io/account/${__value.raw}'
        - name: 'Trace'
          matcherRegex: '"trace_id":"([^"]+)"'
          url: 'http://jaeger:16686/trace/${__value.raw}'
```
