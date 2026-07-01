# /obs trace

Enable distributed tracing across a Solana user flow.

## Inputs Required
- Flow name: claim, swap, stake, bridge, node onboarding, or custom
- Backend framework and frontend stack
- Trace backend: Tempo, Jaeger, Honeycomb, or Datadog

---

## OpenTelemetry Setup — Node.js Backend

```typescript
// tracing.ts — initialize before importing any other module
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'solana-protocol-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
    'solana.cluster': process.env.SOLANA_CLUSTER ?? 'mainnet-beta',
  }),
  spanProcessor: new SimpleSpanProcessor(
    new OTLPTraceExporter({ url: process.env.OTLP_ENDPOINT ?? 'http://tempo:4318/v1/traces' })
  ),
});
sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

---

## Instrumenting a Transaction Flow

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('solana-protocol');

async function executeClaimFlow(userId: string, amount: bigint): Promise<string> {
  return tracer.startActiveSpan('claim-flow', async (span) => {
    span.setAttributes({
      'user.id': userId,
      'claim.amount_lamports': amount.toString(),
      'solana.program_id': PROGRAM_ID.toBase58(),
    });

    try {
      // Child span: build transaction
      const tx = await tracer.startActiveSpan('build-tx', async (childSpan) => {
        const result = await buildClaimTransaction(userId, amount);
        childSpan.setAttributes({ 'tx.instruction_count': result.instructions.length });
        childSpan.end();
        return result;
      });

      // Child span: send and confirm
      const sig = await tracer.startActiveSpan('send-tx', async (childSpan) => {
        const signature = await sendAndConfirmTransaction(connection, tx, [payer]);
        childSpan.setAttributes({ 'tx.signature': signature, 'tx.confirmed': true });
        childSpan.end();
        return signature;
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return sig;
    } catch (err: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

---

## Grafana Tempo Query (TraceQL)

```
# Find all failed claim traces in last 1 hour
{ span.solana.program_id = "<PROGRAM_ID>" && status = error }

# Find slow transactions (> 5s end-to-end)
{ span.name = "claim-flow" && duration > 5s }
```

---

## Sampling Strategy

```yaml
# otel-collector-config.yml — tail-based sampling
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] }  # 100% of errors
      - name: slow-policy
        type: latency
        latency: { threshold_ms: 3000 }          # 100% of slow traces
      - name: base-rate
        type: probabilistic
        probabilistic: { sampling_percentage: 5 } # 5% of everything else
```
