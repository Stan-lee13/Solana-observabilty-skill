# Command: /obs health-check

Run comprehensive health checks across all Solana infrastructure layers.

## Usage

```
/obs health-check [--target <layer>] [--format <output>]
```

## Options

- `--target <layer>`: Specific layer to check (rpc, program, frontend, all)
- `--format <output>`: Output format (json, table, summary)

## What It Checks

### RPC Layer
- Endpoint connectivity and slot lag
- Rate limit status per provider
- Feature availability (priority fees, history)
- Response time distributions

### Program Layer
- Program account exists and is executable
- Authority matches expected value
- Recent upgrade detection
- Instruction discriminator validation

### Frontend Layer
- Wallet adapter connectivity
- dApp bundle health (no console errors)
- LocalStorage / session state

## Example Output

```
=== Solana Health Check ===
Timestamp: 2026-01-15T14:30:00Z
Cluster: mainnet-beta

RPC Endpoints:
  ✓ Helius Mainnet          lag: 2 slots    latency: 45ms    rate: 12%
  ✓ QuickNode Pro           lag: 3 slots    latency: 62ms    rate: 8%
  ⚠ Backup RPC              lag: 28 slots   latency: 340ms   rate: 45%

Programs:
  ✓ pump.fun (6EF8...F6P)   executable: yes  authority: matches  upgraded: no
  ✓ token-program           executable: yes  authority: system   upgraded: no

Frontend:
  ✓ Phantom adapter         connected: yes  version: 24.1.0
  ✓ React bundle            errors: 0       warnings: 2

Summary: 7/8 checks passing (1 warning)
```

## Exit Codes

- `0`: All checks passing
- `1`: One or more warnings
- `2`: One or more critical failures
