# Rules: Solana Observability

Auto-loading rules for monitoring patterns in Solana codebases.

## Log Safety

**Rule**: Never log sensitive data
- **Applies to**: All TypeScript/JavaScript files
- **Trigger**: Code review, before commit
- **Pattern**: Scan for `console.log`, `logger.*` containing sensitive keys
- **Action**: Flag for review, suggest redaction

**Forbidden patterns**:
```javascript
// ❌ NEVER
console.log("Keypair:", keypair.secretKey);
logger.info("Mnemonic:", mnemonic);
console.log("Response:", response.data?.privateKey);
```

**Correct patterns**:
```javascript
// ✅ SAFE
logger.info({ publicKey: keypair.publicKey.toBase58() }, "Wallet loaded");
logger.debug({ signature }, "Transaction sent");
```

## Health Check Patterns

**Rule**: All HTTP services must expose health endpoints
- **Applies to**: Backend services (Hono, Express, Fastify)
- **Required endpoints**:
  - `GET /healthz` — Deep health check (includes RPC connectivity)
  - `GET /ready` — Readiness probe (can accept traffic)
  - `GET /live` — Liveness probe (process running)

## RPC Call Instrumentation

**Rule**: All RPC calls must be traced and timed
- **Applies to**: Any file making `@solana/kit` or `@solana/web3.js` calls
- **Required**: Latency histogram, error counter, trace span
- **Pattern**: Wrap RPC calls with OpenTelemetry tracing

## Alert Thresholds

**Rule**: Alert thresholds must be percentage-based, not absolute
- **Applies to**: Alert rule definitions
- **Correct**: `failure_rate > 0.05` (5% of transactions)
- **Incorrect**: `failed_tx > 100` (100 failures — meaningless without context)

## Correlation ID Propagation

**Rule**: Correlation IDs must flow through the entire request lifecycle
- **Applies to**: Request handlers, RPC calls, transaction builders
- **Required chain**: HTTP Request → Correlation ID → RPC Span → TX Signature → Confirmation

## Compute Unit Budgets

**Rule**: All program instructions must have CU monitoring
- **Applies to**: Program test files, client integration code
- **Required**: Track CU consumed vs requested, alert on >80% utilization
