# Alerting & Incident Response for Solana

Alert routing, severity classification, runbook automation, and incident management for Solana dApp operations.

## Alert Severity Framework

### Severity Definitions

| Severity | Response Time | Who | Example |
|---|---|---|---|
| **P0 — Critical** | Immediate (5 min) | On-call engineer | Program authority changed, all TX failing, funds at risk |
| **P1 — High** | 15 minutes | Team lead | >10% TX failure rate, RPC completely down, CU limit breaches |
| **P2 — Medium** | 1 hour | Engineering | Slot lag >50, fee market spike, single RPC degraded |
| **P3 — Low** | 4 hours | Any engineer | Non-critical metric anomalies, advisory notices |
| **P4 — Info** | Next business day | Product | Usage trends, optimization opportunities |

### Severity Classification Engine

```typescript
// severity-classifier.ts
interface AlertEvent {
  id: string;
  source: 'infrastructure' | 'program' | 'application' | 'security';
  type: string;
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

interface ClassifiedAlert extends AlertEvent {
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  runbookUrl?: string;
  autoAction?: string;
  escalationMinutes: number;
}

class AlertClassifier {
  private rules: AlertRule[] = [
    // P0 — Critical
    {
      severity: 'P0',
      conditions: [
        { field: 'type', op: 'eq', value: 'AUTHORITY_CHANGE' },
        { field: 'type', op: 'eq', value: 'PROGRAM_EXPLOIT' },
      ],
      matchLogic: 'any',
      autoAction: 'page_oncall_immediately',
      escalationMinutes: 5,
    },
    {
      severity: 'P0',
      conditions: [
        { field: 'type', op: 'eq', value: 'TX_FAILURE_RATE' },
        { field: 'metadata.failureRate', op: 'gt', value: 0.5 },
      ],
      matchLogic: 'all',
      autoAction: 'page_oncall',
      escalationMinutes: 5,
    },
    // P1 — High
    {
      severity: 'P1',
      conditions: [
        { field: 'type', op: 'eq', value: 'TX_FAILURE_RATE' },
        { field: 'metadata.failureRate', op: 'gt', value: 0.1 },
      ],
      matchLogic: 'all',
      autoAction: 'notify_team',
      escalationMinutes: 15,
    },
    {
      severity: 'P1',
      conditions: [
        { field: 'type', op: 'eq', value: 'CU_LIMIT_CRITICAL' },
      ],
      matchLogic: 'any',
      escalationMinutes: 15,
    },
    // P2 — Medium
    {
      severity: 'P2',
      conditions: [
        { field: 'type', op: 'eq', value: 'RPC_DEGRADED' },
        { field: 'metadata.slotLag', op: 'gt', value: 25 },
      ],
      matchLogic: 'all',
      escalationMinutes: 60,
    },
    {
      severity: 'P2',
      conditions: [
        { field: 'type', op: 'eq', value: 'FEE_MARKET_SPIKE' },
      ],
      matchLogic: 'any',
      escalationMinutes: 60,
    },
    // P3 — Low
    {
      severity: 'P3',
      conditions: [
        { field: 'type', op: 'eq', value: 'RATE_LIMIT_WARNING' },
      ],
      matchLogic: 'any',
      escalationMinutes: 240,
    },
  ];

  classify(event: AlertEvent): ClassifiedAlert {
    for (const rule of this.rules) {
      if (this.matchesRule(event, rule)) {
        return {
          ...event,
          severity: rule.severity,
          runbookUrl: rule.runbookUrl ?? `https://wiki.internal/runbooks/solana/${event.type.toLowerCase()}`,
          autoAction: rule.autoAction,
          escalationMinutes: rule.escalationMinutes,
        };
      }
    }

    // Default classification
    return {
      ...event,
      severity: 'P3',
      escalationMinutes: 240,
    };
  }

  private matchesRule(event: AlertEvent, rule: AlertRule): boolean {
    const results = rule.conditions.map(c => this.evaluateCondition(event, c));
    return rule.matchLogic === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(event: AlertEvent, condition: Condition): boolean {
    const value = this.getField(event, condition.field);
    switch (condition.op) {
      case 'eq': return value === condition.value;
      case 'gt': return (value as number) > (condition.value as number);
      case 'gte': return (value as number) >= (condition.value as number);
      case 'lt': return (value as number) < (condition.value as number);
      case 'lte': return (value as number) <= (condition.value as number);
      case 'contains': return (value as string).includes(condition.value as string);
      case 'regex': return new RegExp(condition.value as string).test(value as string);
      default: return false;
    }
  }

  private getField(event: AlertEvent, field: string): any {
    if (field.startsWith('metadata.')) {
      return event.metadata[field.slice(9)];
    }
    return (event as any)[field];
  }
}

interface AlertRule {
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  conditions: Condition[];
  matchLogic: 'all' | 'any';
  autoAction?: string;
  runbookUrl?: string;
  escalationMinutes: number;
}

interface Condition {
  field: string;
  op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
  value: string | number | boolean;
}
```

## Multi-Channel Alert Router

```typescript
// alert-router.ts
interface AlertChannel {
  name: string;
  send(alert: ClassifiedAlert): Promise<void>;
}

class AlertRouter {
  private channels: Map<string, AlertChannel> = new Map();
  private severityChannels: Map<string, string[]> = new Map([
    ['P0', ['pagerduty', 'discord-critical', 'slack-critical', 'sms']],
    ['P1', ['pagerduty', 'discord', 'slack']],
    ['P2', ['discord', 'slack']],
    ['P3', ['slack']],
    ['P4', ['slack']],
  ]);

  registerChannel(name: string, channel: AlertChannel) {
    this.channels.set(name, channel);
  }

  async route(alert: ClassifiedAlert) {
    const channelNames = this.severityChannels.get(alert.severity) ?? ['slack'];

    const results = await Promise.allSettled(
      channelNames.map(async name => {
        const channel = this.channels.get(name);
        if (!channel) return;

        // Add channel-specific formatting
        const formattedAlert = this.formatForChannel(alert, name);
        await channel.send(formattedAlert);
      })
    );

    // Log routing failures
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        console.error(`Failed to send alert to ${channelNames[i]}:`, result.reason);
        // Fallback: try next channel in priority
      }
    }
  }

  private formatForChannel(alert: ClassifiedAlert, channel: string): ClassifiedAlert {
    // Channel-specific formatting
    return alert;
  }
}

// PagerDuty Integration
class PagerDutyChannel implements AlertChannel {
  name = 'pagerduty';
  private routingKey: string;

  constructor(routingKey: string) {
    this.routingKey = routingKey;
  }

  async send(alert: ClassifiedAlert) {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: this.routingKey,
        event_action: alert.severity === 'P0' ? 'trigger' : 'trigger',
        dedup_key: alert.id,
        payload: {
          summary: `[${alert.severity}] ${alert.message}`,
          severity: this.mapSeverity(alert.severity),
          source: alert.source,
          custom_details: {
            ...alert.metadata,
            runbook: alert.runbookUrl,
            type: alert.type,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty rejected: ${response.status}`);
    }
  }

  private mapSeverity(sev: string): 'critical' | 'error' | 'warning' | 'info' {
    switch (sev) {
      case 'P0': return 'critical';
      case 'P1': return 'error';
      case 'P2': return 'warning';
      default: return 'info';
    }
  }
}

// Discord Integration
class DiscordChannel implements AlertChannel {
  name = 'discord';
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(alert: ClassifiedAlert) {
    const color = this.getColor(alert.severity);

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `[${alert.severity}] ${alert.type}`,
          description: alert.message,
          color,
          fields: [
            { name: 'Source', value: alert.source, inline: true },
            { name: 'Severity', value: alert.severity, inline: true },
            { name: 'Time', value: alert.timestamp.toISOString(), inline: true },
            ...(alert.runbookUrl ? [{ name: 'Runbook', value: alert.runbookUrl }] : []),
            {
              name: 'Details',
              value: '```json\n' + JSON.stringify(alert.metadata, null, 2).slice(0, 1000) + '\n```',
            },
          ],
          timestamp: alert.timestamp.toISOString(),
        }],
      }),
    });
  }

  private getColor(severity: string): number {
    switch (severity) {
      case 'P0': return 0xff0000;  // Red
      case 'P1': return 0xff6600;  // Orange
      case 'P2': return 0xffcc00;  // Yellow
      case 'P3': return 0x0066ff;  // Blue
      default: return 0x808080;    // Gray
    }
  }
}

// Slack Integration
class SlackChannel implements AlertChannel {
  name = 'slack';
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(alert: ClassifiedAlert) {
    const emoji = this.getEmoji(alert.severity);

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *[${alert.severity}]* ${alert.type}: ${alert.message}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} ${alert.severity}: ${alert.type}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Source:*\n${alert.source}` },
              { type: 'mrkdwn', text: `*Time:*\n${alert.timestamp.toISOString()}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: alert.message },
          },
          ...(alert.runbookUrl ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `<${alert.runbookUrl}|View Runbook>` },
          }] : []),
        ],
      }),
    });
  }

  private getEmoji(severity: string): string {
    switch (severity) {
      case 'P0': return ':rotating_light:';
      case 'P1': return ':warning:';
      case 'P2': return ':yellow_circle:';
      case 'P3': return ':information_source:';
      default: return ':grey_question:';
    }
  }
}
```

## Runbook Templates

```markdown
<!-- runbook-template.md — Example for TX_FAILURE_RATE alert -->
# Runbook: Transaction Failure Rate Alert

## Alert

Transaction failure rate for `{program_id}` exceeded threshold.

Current rate: `{failure_rate}%`
Threshold: `{threshold}%`

## Immediate Checks (2 minutes)

1. **Check if it's a global Solana issue**
   - Visit https://status.solana.com/
   - Check https://downtime.solana.com/
   - Check Solana Discord #announcements

2. **Check your RPC endpoints**
   ```bash
   curl $RPC_URL -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```

3. **Check recent program changes**
   ```bash
   # Was the program upgraded recently?
   solana program show $PROGRAM_ID --url $RPC_URL

   # Compare with known good deployment
   git log --oneline -5
   ```

## Diagnosis Steps (5 minutes)

| Check | Command/Action | Expected |
|---|---|---|
| RPC health | `getHealth` | `ok` |
| Slot lag | `getSlot` then compare with explorer | < 25 slots |
| Program data | `getAccountInfo $PROGRAM_ID` | executable: true, matches expected hash |
| Recent errors | Check logs for `meta.err` patterns | No new error types |
| CU usage | Check `solana_cu_p99` metric | < 80% of 1.4M |

## Common Causes & Fixes

### Cause: Program was upgraded with breaking change

**Fix:**
1. Identify the breaking change
2. If unintended: freeze program, redeploy previous version
3. If intended: update client IDL, notify users

### Cause: RPC endpoint degraded

**Fix:**
1. Switch to backup RPC
2. Update frontend RPC config
3. Contact RPC provider

### Cause: Fee market spike

**Fix:**
1. Increase priority fees in client
2. Check `/fee-market` dashboard for recommendations
3. Consider Jito bundles for critical transactions

### Cause: Account data bloat

**Fix:**
1. Identify growing accounts
2. Implement account reaping/rent collection
3. Increase rent exemption if needed

## Escalation

If not resolved in 15 minutes:
- P0: Escalate to security team
- P1: Page engineering lead
- Include: diagnosis summary, attempted fixes, current state

## Post-Incident

1. Document root cause in incident tracker
2. Update runbook if needed
3. Schedule follow-up for preventive measures
```

## Auto-Remediation Actions

```typescript
// auto-remediation.ts
interface RemediationAction {
  name: string;
  condition: (alert: ClassifiedAlert) => boolean;
  execute: (alert: ClassifiedAlert) => Promise<RemediationResult>;
  cooldownMs: number;
  maxExecutionsPerHour: number;
}

class AutoRemediationEngine {
  private actions: RemediationAction[] = [];
  private executionLog: Map<string, Date[]> = new Map();

  registerAction(action: RemediationAction) {
    this.actions.push(action);
  }

  async evaluate(alert: ClassifiedAlert): Promise<RemediationResult[]> {
    const results: RemediationResult[] = [];

    for (const action of this.actions) {
      if (!action.condition(alert)) continue;
      if (!this.canExecute(action.name)) continue;

      try {
        const result = await action.execute(alert);
        this.logExecution(action.name);
        results.push(result);
      } catch (error) {
        results.push({
          action: action.name,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  private canExecute(actionName: string): boolean {
    const executions = this.executionLog.get(actionName) ?? [];
    const oneHourAgo = Date.now() - 3600_000;
    const recentExecutions = executions.filter(t => t.getTime() > oneHourAgo);
    this.executionLog.set(actionName, recentExecutions);

    const action = this.actions.find(a => a.name === actionName);
    return recentExecutions.length < (action?.maxExecutionsPerHour ?? 1);
  }

  private logExecution(actionName: string) {
    const executions = this.executionLog.get(actionName) ?? [];
    executions.push(new Date());
    this.executionLog.set(actionName, executions);
  }
}

// Register common auto-remediations
const engine = new AutoRemediationEngine();

// Auto: Switch RPC on degradation
engine.registerAction({
  name: 'rpc_failover',
  condition: (alert) => alert.type === 'RPC_DEGRADED' && alert.metadata.slotLag > 50,
  execute: async (alert) => {
    // Trigger failover to next RPC
    const failoverRouter = new FailoverRouter(/* endpoints */);
    const newEndpoint = failoverRouter.getHealthyEndpoint();

    return {
      action: 'rpc_failover',
      success: !!newEndpoint,
      message: newEndpoint ? `Failed over to ${newEndpoint}` : 'No healthy endpoint available',
    };
  },
  cooldownMs: 60_000,
  maxExecutionsPerHour: 6,
});

// Auto: Increase priority fees during congestion
engine.registerAction({
  name: 'priority_fee_bump',
  condition: (alert) => alert.type === 'FEE_MARKET_SPIKE',
  execute: async (alert) => {
    const currentFee = alert.metadata.currentPriorityFee ?? 5000;
    const newFee = Math.min(currentFee * 2, 1_000_000); // Cap at 0.001 SOL

    return {
      action: 'priority_fee_bump',
      success: true,
      message: `Increased priority fee from ${currentFee} to ${newFee} micro-lamports`,
      newConfig: { priorityFee: newFee },
    };
  },
  cooldownMs: 300_000,
  maxExecutionsPerHour: 3,
});

interface RemediationResult {
  action: string;
  success: boolean;
  message?: string;
  error?: string;
  newConfig?: any;
}
```

## Alert Suppression & Deduplication

```typescript
// alert-deduper.ts
class AlertDeduplicator {
  private recentAlerts: Map<string, { count: number; firstSeen: Date; lastSeen: Date }> = new Map();
  private readonly WINDOW_MS = 300_000; // 5 minute dedup window
  private readonly SUPPRESS_AFTER = 3;  // Suppress after 3 duplicates

  shouldAlert(event: AlertEvent): { shouldSend: boolean; isDuplicate: boolean; suppressionCount: number } {
    const key = `${event.source}:${event.type}:${JSON.stringify(this.sanitizeMetadata(event.metadata))}`;
    const now = new Date();
    const existing = this.recentAlerts.get(key);

    if (!existing) {
      this.recentAlerts.set(key, { count: 1, firstSeen: now, lastSeen: now });
      return { shouldSend: true, isDuplicate: false, suppressionCount: 0 };
    }

    existing.count++;
    existing.lastSeen = now;

    if (existing.count > this.SUPPRESS_AFTER) {
      return { shouldSend: false, isDuplicate: true, suppressionCount: existing.count };
    }

    return { shouldSend: true, isDuplicate: true, suppressionCount: existing.count };
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    // Remove high-cardinality fields for dedup key
    const { timestamp, slot, signature, ...rest } = metadata;
    return rest;
  }

  // Cleanup old entries
  prune() {
    const cutoff = Date.now() - this.WINDOW_MS;
    for (const [key, value] of this.recentAlerts) {
      if (value.lastSeen.getTime() < cutoff) {
        this.recentAlerts.delete(key);
      }
    }
  }
}
```


