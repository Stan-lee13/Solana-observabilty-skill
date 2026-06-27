# Dashboards & Visualization for Solana

Grafana dashboards, real-time React components, and visualization patterns for Solana dApp metrics.

## Core Grafana Dashboards

### 1. Infrastructure Overview Dashboard

```json
{
  "dashboard": {
    "title": "Solana Infrastructure Overview",
    "tags": ["solana", "infrastructure", "health"],
    "timezone": "browser",
    "panels": [
      {
        "title": "RPC Endpoint Health",
        "type": "stat",
        "targets": [{
          "expr": "solana_rpc_healthy",
          "legendFormat": "{{endpoint}}"
        }],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "options": { "0": { "text": "DOWN", "color": "red" } }, "type": "value" },
              { "options": { "1": { "text": "UP", "color": "green" } }, "type": "value" }
            ]
          }
        },
        "gridPos": { "h": 4, "w": 12, "x": 0, "y": 0 }
      },
      {
        "title": "Slot Lag",
        "type": "timeseries",
        "targets": [{
          "expr": "solana_slot_lag_slots",
          "legendFormat": "{{endpoint}}"
        }],
        "fieldConfig": {
          "defaults": {
            "custom": { "lineWidth": 2 },
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 25, "color": "yellow" },
                { "value": 50, "color": "red" }
              ]
            },
            "unit": "slots"
          }
        },
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 }
      },
      {
        "title": "RPC Latency (P50/P95/P99)",
        "type": "timeseries",
        "targets": [
          { "expr": "histogram_quantile(0.50, rate(solana_rpc_request_duration_seconds_bucket[5m]))", "legendFormat": "P50" },
          { "expr": "histogram_quantile(0.95, rate(solana_rpc_request_duration_seconds_bucket[5m]))", "legendFormat": "P95" },
          { "expr": "histogram_quantile(0.99, rate(solana_rpc_request_duration_seconds_bucket[5m]))", "legendFormat": "P99" }
        ],
        "fieldConfig": {
          "defaults": { "unit": "ms" }
        },
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 }
      },
      {
        "title": "Rate Limit Utilization",
        "type": "gauge",
        "targets": [{
          "expr": "solana_rate_limit_utilization",
          "legendFormat": "{{endpoint}}"
        }],
        "fieldConfig": {
          "defaults": {
            "min": 0,
            "max": 1,
            "unit": "percentunit",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 0.7, "color": "yellow" },
                { "value": 0.9, "color": "red" }
              ]
            }
          }
        },
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 }
      }
    ]
  }
}
```

### 2. Program Performance Dashboard

```json
{
  "dashboard": {
    "title": "Solana Program Performance",
    "tags": ["solana", "program", "performance"],
    "panels": [
      {
        "title": "Transaction Success Rate by Instruction",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(rate(solana_tx_successful{program_id=~\"$program_id\"}[5m])) by (instruction) / sum(rate(solana_tx_total{program_id=~\"$program_id\"}[5m])) by (instruction)",
          "legendFormat": "{{instruction}}"
        }],
        "fieldConfig": {
          "defaults": {
            "unit": "percentunit",
            "min": 0,
            "max": 1,
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 0.95, "color": "yellow" },
                { "value": 0.99, "color": "green" }
              ]
            }
          }
        }
      },
      {
        "title": "CU Usage Heatmap",
        "type": "heatmap",
        "targets": [{
          "expr": "solana_cu_usage_bucket{program_id=~\"$program_id\"}",
          "format": "heatmap"
        }],
        "heatmap": {},
        "dataFormat": "tsbuckets",
        "yAxis": { "format": "short", "logBase": 1, "min": 0, "max": 1400000 }
      },
      {
        "title": "Top CU Consumers",
        "type": "table",
        "targets": [{
          "expr": "topk(10, solana_cu_p99{program_id=~\"$program_id\"})",
          "format": "table",
          "instant": true
        }],
        "transformations": [
          {
            "id": "organize",
            "options": {
              "indexByName": {
                "instruction": 0,
                "Value": 1
              },
              "renameByName": {
                "Value": "P99 CU"
              }
            }
          }
        ]
      },
      {
        "title": "Confirmation Time Distribution",
        "type": "histogram",
        "targets": [{
          "expr": "solana_tx_confirmation_duration_seconds_bucket{program_id=~\"$program_id\"}",
          "format": "heatmap"
        }]
      }
    ],
    "templating": {
      "list": [
        {
          "name": "program_id",
          "type": "query",
          "query": "label_values(solana_tx_total, program_id)",
          "multi": true,
          "includeAll": true
        }
      ]
    }
  }
}
```

### 3. User Experience Dashboard

```json
{
  "dashboard": {
    "title": "Solana User Experience",
    "tags": ["solana", "ux", "frontend"],
    "panels": [
      {
        "title": "User Journey Funnel",
        "type": "bargauge",
        "targets": [{
          "expr": "solana_journey_stage",
          "legendFormat": "{{stage}}"
        }],
        "options": {
          "orientation": "horizontal",
          "displayMode": "gradient"
        }
      },
      {
        "title": "Wallet Error Distribution",
        "type": "piechart",
        "targets": [{
          "expr": "sum(rate(solana_wallet_errors[5m])) by (error_category)",
          "legendFormat": "{{error_category}}"
        }],
        "options": {
          "pieType": "donut"
        }
      },
      {
        "title": "Transaction Latency Breakdown",
        "type": "timeseries",
        "targets": [
          { "expr": "histogram_quantile(0.50, rate(solana_tx_stage_duration_seconds_bucket{stage=\"signing\"}[5m]))", "legendFormat": "Signing" },
          { "expr": "histogram_quantile(0.50, rate(solana_tx_stage_duration_seconds_bucket{stage=\"confirmation\"}[5m]))", "legendFormat": "Confirmation" }
        ],
        "fieldConfig": {
          "defaults": { "unit": "s" }
        }
      },
      {
        "title": "Bottleneck Analysis",
        "type": "table",
        "targets": [{
          "expr": "solana_journey_dropoff_rate",
          "format": "table",
          "instant": true
        }],
        "transformations": [
          {
            "id": "organize",
            "options": {
              "renameByName": {
                "stage": "Stage",
                "Value": "Drop-off Rate"
              }
            }
          }
        ]
      }
    ]
  }
}
```

### 4. Alert Status Dashboard

```json
{
  "dashboard": {
    "title": "Solana Alert Status",
    "tags": ["solana", "alerting"],
    "panels": [
      {
        "title": "Active Alerts by Severity",
        "type": "stat",
        "targets": [{
          "expr": "solana_alert_active",
          "legendFormat": "{{severity}}"
        }],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "options": { "from": 1, "to": 999, "result": { "color": "red", "text": "FIRING" } }, "type": "range" }
            ]
          }
        }
      },
      {
        "title": "Alert History (24h)",
        "type": "state-timeline",
        "targets": [{
          "expr": "solana_alert_state",
          "legendFormat": "{{alertname}}"
        }],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "options": { "0": { "text": "Normal", "color": "green" } }, "type": "value" },
              { "options": { "1": { "text": "Pending", "color": "yellow" } }, "type": "value" },
              { "options": { "2": { "text": "Firing", "color": "red" } }, "type": "value" }
            ]
          }
        }
      }
    ]
  }
}
```

## Real-Time React Components

### Live Metrics Card

```tsx
// LiveMetricCard.tsx
import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';

interface MetricValue {
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  timestamp: Date;
}

export function LiveMetricCard({
  title,
  query,
  unit,
  thresholds,
}: {
  title: string;
  query: () => Promise<number>;
  unit: string;
  thresholds: { warning: number; critical: number };
}) {
  const [metric, setMetric] = useState<MetricValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let previous = 0;
    const interval = setInterval(async () => {
      try {
        const current = await query();
        const trend = current > previous * 1.1 ? 'up' : current < previous * 0.9 ? 'down' : 'stable';
        previous = current;
        setMetric({ current, previous, trend, timestamp: new Date() });
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [query]);

  const status = metric
    ? metric.current > thresholds.critical ? 'critical'
    : metric.current > thresholds.warning ? 'warning' : 'ok'
    : 'unknown';

  return (
    <div className={`metric-card metric-card--${status}`}>
      <h3>{title}</h3>
      <div className="metric-card__value">
        {metric ? `${metric.current.toFixed(2)} ${unit}` : '--'}
        {metric && (
          <span className={`trend trend--${metric.trend}`}>
            {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      {error && <div className="metric-card__error">{error}</div>}
      <div className="metric-card__timestamp">
        {metric?.timestamp.toLocaleTimeString()}
      </div>
    </div>
  );
}

// Usage
function MetricsGrid() {
  const { connection } = useConnection();

  return (
    <div className="metrics-grid">
      <LiveMetricCard
        title="Slot Lag"
        query={async () => {
          const slot = await connection.getSlot();
          const epochInfo = await connection.getEpochInfo();
          return epochInfo.absoluteSlot - slot;
        }}
        unit="slots"
        thresholds={{ warning: 25, critical: 50 }}
      />
      <LiveMetricCard
        title="TX Success Rate (5m)"
        query={async () => {
          // Fetch from your metrics API
          const res = await fetch('/api/metrics/success-rate');
          return (await res.json()).rate;
        }}
        unit="%"
        thresholds={{ warning: 95, critical: 90 }}
      />
    </div>
  );
}
```

### Real-Time Log Stream

```tsx
// LogStream.tsx
import { useEffect, useRef, useState } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  metadata: Record<string, any>;
}

export function LogStream({ filter }: { filter?: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`wss://your-log-aggregator.com/stream?filter=${filter ?? ''}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const entry: LogEntry = JSON.parse(event.data);
      setLogs(prev => [...prev.slice(-500), entry]); // Keep last 500
    };

    return () => ws.close();
  }, [filter]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs]);

  return (
    <div className="log-stream" ref={scrollRef}>
      {logs.map((log, i) => (
        <div key={i} className={`log-entry log-entry--${log.level}`}>
          <span className="log-entry__time">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={`log-entry__level log-entry__level--${log.level}`}>
            {log.level.toUpperCase()}
          </span>
          <span className="log-entry__source">{log.source}</span>
          <span className="log-entry__message">{log.message}</span>
          {Object.keys(log.metadata).length > 0 && (
            <pre className="log-entry__meta">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
```

### CU Optimization Heatmap

```tsx
// CUHeatmap.tsx
import { useEffect, useState } from 'react';

interface CUDataPoint {
  instruction: string;
  timestamp: number;
  cuConsumed: number;
}

export function CUHeatmap({ programId }: { programId: string }) {
  const [data, setData] = useState<CUDataPoint[]>([]);

  useEffect(() => {
    // Fetch from your metrics API or gRPC stream
    const fetchData = async () => {
      const res = await fetch(`/api/metrics/cu-heatmap?program=${programId}`);
      setData(await res.json());
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [programId]);

  const instructions = [...new Set(data.map(d => d.instruction))];
  const maxCU = Math.max(...data.map(d => d.cuConsumed), 1);

  return (
    <div className="cu-heatmap">
      <h3>CU Consumption Heatmap</h3>
      <div className="heatmap-grid">
        {instructions.map(instruction => (
          <div key={instruction} className="heatmap-row">
            <span className="heatmap-label">{instruction}</span>
            {data
              .filter(d => d.instruction === instruction)
              .map((d, i) => (
                <div
                  key={i}
                  className="heatmap-cell"
                  style={{
                    backgroundColor: `rgba(239, 68, 68, ${d.cuConsumed / maxCU})`,
                  }}
                  title={`${instruction}: ${d.cuConsumed.toLocaleString()} CU`}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>0 CU</span>
        <div className="heatmap-gradient" />
        <span>{maxCU.toLocaleString()} CU</span>
      </div>
    </div>
  );
}
```

## Prometheus Recording Rules

```yaml
# recording-rules.yml
groups:
  - name: solana_aggregations
    interval: 30s
    rules:
      # Pre-compute success rate
      - record: solana:tx_success_rate_5m
        expr: |
          sum(rate(solana_tx_successful[5m])) by (program_id, instruction)
          /
          sum(rate(solana_tx_total[5m])) by (program_id, instruction)

      # Pre-compute average CU per instruction
      - record: solana:avg_cu_per_instruction_5m
        expr: |
          sum(rate(solana_cu_total[5m])) by (program_id, instruction)
          /
          sum(rate(solana_tx_total[5m])) by (program_id, instruction)

      # Pre-compute RPC health score
      - record: solana:rpc_health_score
        expr: |
          (
            solana_rpc_healthy * 0.4 +
            (1 - clamp(solana_slot_lag_slots / 100, 0, 1)) * 0.3 +
            (1 - clamp(solana_rpc_request_duration_seconds / 5000, 0, 1)) * 0.3
          )

      # Pre-compute user journey conversion
      - record: solana:journey_conversion_rate
        expr: |
          solana_journey_stage{stage="tx_confirmed"}
          /
          solana_journey_stage{stage="tx_init"}

      # Pre-compute program security score
      - record: solana:program_security_score
        expr: |
          (
            (1 - changes(solana_program_authority[1h])) * 0.5 +
            (1 - changes(solana_program_data_hash[24h])) * 0.3 +
            (1 - clamp(solana_tx_failure_rate, 0, 1)) * 0.2
          )
```

## Custom Exporters

```typescript
// custom-exporter.ts
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Create custom Solana registry
export const solanaRegistry = new Registry();

// Register default Node.js metrics
collectDefaultMetrics({ register: solanaRegistry });

// Solana-specific metrics
export const solanaMetrics = {
  txTotal: new Counter({
    name: 'solana_tx_total',
    help: 'Total transactions processed',
    labelNames: ['program_id', 'instruction', 'status'],
    registers: [solanaRegistry],
  }),

  txDuration: new Histogram({
    name: 'solana_tx_duration_seconds',
    help: 'Transaction confirmation time',
    labelNames: ['program_id', 'instruction'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [solanaRegistry],
  }),

  cuUsed: new Histogram({
    name: 'solana_cu_used',
    help: 'Compute units consumed per transaction',
    labelNames: ['program_id', 'instruction'],
    buckets: [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 1400000],
    registers: [solanaRegistry],
  }),

  rpcLatency: new Histogram({
    name: 'solana_rpc_request_duration_seconds',
    help: 'RPC request latency in milliseconds',
    labelNames: ['endpoint', 'method'],
    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [solanaRegistry],
  }),

  slotLag: new Gauge({
    name: 'solana_slot_lag_slots',
    help: 'Slots behind network tip',
    labelNames: ['endpoint'],
    registers: [solanaRegistry],
  }),

  rpcHealthy: new Gauge({
    name: 'solana_rpc_healthy',
    help: 'RPC endpoint health status (1=healthy, 0=unhealthy)',
    labelNames: ['endpoint'],
    registers: [solanaRegistry],
  }),

  programAuthority: new Gauge({
    name: 'solana_program_authority',
    help: 'Program authority hash for change detection',
    labelNames: ['program_id'],
    registers: [solanaRegistry],
  }),

  priorityFee: new Gauge({
    name: 'solana_priority_fee_micro_lamports',
    help: 'Current priority fee in micro-lamports',
    labelNames: ['strategy'],
    registers: [solanaRegistry],
  }),

  walletConnections: new Counter({
    name: 'solana_wallet_connections_total',
    help: 'Wallet connection attempts',
    labelNames: ['wallet_name', 'status'],
    registers: [solanaRegistry],
  }),

  walletErrors: new Counter({
    name: 'solana_wallet_errors_total',
    help: 'Wallet errors by category',
    labelNames: ['wallet_name', 'error_category'],
    registers: [solanaRegistry],
  }),
};

// Fastify/Express middleware to expose metrics
export function metricsEndpoint() {
  return async (req: any, res: any) => {
    res.set('Content-Type', solanaRegistry.contentType);
    res.end(await solanaRegistry.metrics());
  };
}
```

## Grafana Provisioning

```yaml
# provisioning/dashboards/solana.yml
apiVersion: 1

providers:
  - name: 'solana-dashboards'
    orgId: 1
    folder: 'Solana'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards/solana

---
# provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus (Solana)
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    jsonData:
      timeInterval: "15s"
      httpMethod: POST
      manageAlerts: true
      prometheusType: Prometheus
      cacheLevel: 'High'
    secureJsonData: {}
```
