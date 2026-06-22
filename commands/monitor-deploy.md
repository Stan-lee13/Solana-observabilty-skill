# Command: /obs monitor-deploy

Set up monitoring for a new Solana program or dApp deployment.

## Usage

```
/obs monitor-deploy [--program <address>] [--name <name>] [--tier <level>]
```

## Options

- `--program <address>`: Program ID to monitor
- `--name <name>`: Human-readable name for the deployment
- `--tier <level>`: Observability tier (basic, standard, advanced)

## Tiers

### Basic (MVP)
- Health check endpoint
- Transaction success/failure counter
- Basic error logging
- Discord alerts on critical failures

### Standard (Production)
- All basic features
- Per-instruction CU tracking
- RPC failover monitoring
- Grafana dashboard
- PagerDuty integration for P0/P1

### Advanced (Scale)
- All standard features
- Distributed tracing
- Auto-remediation actions
- Custom SLO definitions
- Historical trend analysis

## What It Creates

1. **Metrics pipeline** — Prometheus metrics or OpenTelemetry setup
2. **Health endpoint** — HTTP `/healthz`, `/ready`, `/live` probes
3. **Alert rules** — YAML for Prometheus Alertmanager
4. **Dashboard config** — Grafana JSON dashboard
5. **Runbook template** — Incident response procedures

## Post-Deploy Checklist

After running this command:
- [ ] Verify metrics are flowing to your backend
- [ ] Test alert notifications (send synthetic alert)
- [ ] Confirm dashboard loads with real data
- [ ] Share runbook with on-call team
- [ ] Schedule first incident response drill
