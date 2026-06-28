# /obs trace

Enable distributed tracing across a Solana user flow.

## Inputs Required

- Flow name: claim, swap, stake, bridge, node onboarding, or custom
- Backend framework and frontend stack
- RPC provider aliases
- Trace backend: Tempo, Jaeger, Honeycomb, Datadog, New Relic
- Privacy constraints

## Procedure

1. Load `skill/logging-tracing.md`.
2. Define correlation ID propagation from frontend to backend to RPC.
3. Add spans for wallet request, transaction build, simulation, send, confirm, and indexer update.
4. Add safe Solana span attributes without wallet/signature labels.
5. Redact secrets and high-cardinality identifiers.
6. Add exemplars or dashboard links from latency panels to traces.
7. Validate trace continuity in staging.

## Output

Return tracing plan, span map, attribute schema, redaction rules, and validation steps.
