# /obs cu-optimize

Analyze compute unit usage and create profiling or regression gates for Solana programs.

## Inputs Required

- Program ID and framework: Anchor, native, or Seahorse
- Critical instructions
- Current requested CU limits
- Recent transaction samples or test logs
- Target p95/p99 CU budget

## Procedure

1. Load `skill/program-profiling.md`.
2. Establish default CU budget: 200k unless explicitly raised.
3. Track p50/p95/p99 CU by instruction.
4. Compare against requested limit and 1.4M transaction maximum.
5. Identify expensive CPI chains, account deserialization, reallocs, and loops.
6. Add CI regression gates for critical instructions.
7. Add Grafana heatmap or percentile panel.

## Output

Return CU budget table, optimization findings, regression thresholds, and monitoring additions.


