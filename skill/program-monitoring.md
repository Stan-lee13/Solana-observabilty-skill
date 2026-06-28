# Program Monitoring for Solana

On-chain program health, transaction success tracking, compute unit optimization, and security monitoring for Solana programs.

## Transaction Success Rate Monitoring

### Per-Instruction Success Tracking

Track success rates per instruction discriminator to identify which program functions fail.

```typescript
// tx-success-tracker.ts
import { getInstructionDecoder, type Transaction } from '@solana/kit';

interface InstructionMetrics {
  discriminator: string;        // First 8 bytes of instruction data
  name: string;                 // Human-readable name from IDL
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgComputeUnits: number;
  p99ComputeUnits: number;
  avgConfirmationTimeMs: number;
  lastError?: string;
  lastCalledAt: Date;
}

class ProgramInstructionTracker {
  private metrics: Map<string, InstructionMetrics> = new Map();
  private readonly programId: string;
  private idl?: any;            // Loaded IDL for discriminator mapping

  constructor(programId: string) {
    this.programId = programId;
  }

  async recordTransaction(
    signature: string,
    tx: Transaction,
    meta: any,                   // getTransaction meta
  ) {
    const isSuccess = meta.err === null;
    const confirmationTime = meta.confirmationTime;

    for (const ix of tx.message.instructions) {
      // Only track instructions for our program
      const programPubkey = tx.message.accountKeys[ix.programIdIndex];
      if (programPubkey !== this.programId) continue;

      const discriminator = this.extractDiscriminator(ix.data);
      const name = this.idl ? this.resolveInstructionName(discriminator) : 'unknown';

      const existing = this.metrics.get(discriminator);
      if (existing) {
        existing.totalCalls++;
        if (isSuccess) existing.successfulCalls++;
        else {
          existing.failedCalls++;
          existing.lastError = JSON.stringify(meta.err);
        }
        existing.avgComputeUnits = this.rollingAverage(
          existing.avgComputeUnits,
          meta.computeUnitsConsumed,
          existing.totalCalls,
        );
        existing.avgConfirmationTimeMs = this.rollingAverage(
          existing.avgConfirmationTimeMs,
          confirmationTime,
          existing.totalCalls,
        );
        existing.lastCalledAt = new Date();
      } else {
        this.metrics.set(discriminator, {
          discriminator,
          name,
          totalCalls: 1,
          successfulCalls: isSuccess ? 1 : 0,
          failedCalls: isSuccess ? 0 : 1,
          avgComputeUnits: meta.computeUnitsConsumed ?? 0,
          p99ComputeUnits: meta.computeUnitsConsumed ?? 0,
          avgConfirmationTimeMs: confirmationTime ?? 0,
          lastError: isSuccess ? undefined : JSON.stringify(meta.err),
          lastCalledAt: new Date(),
        });
      }
    }
  }

  getMetrics(): InstructionMetrics[] {
    return Array.from(this.metrics.values());
  }

  getFailingInstructions(threshold = 0.05): InstructionMetrics[] {
    return this.getMetrics()
      .filter(m => m.totalCalls > 10)  // Minimum sample size
      .filter(m => m.failedCalls / m.totalCalls > threshold);
  }

  private extractDiscriminator(data: Uint8Array): string {
    // Anchor: first 8 bytes are the discriminator
    // Native: may vary
    return Buffer.from(data.slice(0, 8)).toString('hex');
  }

  private resolveInstructionName(discriminator: string): string {
    // Map discriminator to IDL instruction name
    const ix = this.idl?.instructions?.find(
      (i: any) => Buffer.from(i.discriminator).toString('hex') === discriminator
    );
    return ix?.name ?? 'unknown';
  }

  private rollingAverage(current: number, newValue: number, count: number): number {
    return current + (newValue - current) / count;
  }
}
```

### CU Usage Monitoring & Optimization

```typescript
// cu-optimizer.ts
import { MeterProvider } from '@opentelemetry/sdk-metrics';

interface CUReport {
  instruction: string;
  avgCU: number;
  p50CU: number;
  p95CU: number;
  p99CU: number;
  maxCU: number;
  limit: number;           // 1.4M for compute budget
  utilizationPct: number;
  recommendations: string[];
}

class CUOptimizer {
  private measurements: Map<string, number[]> = new Map();
  private readonly CU_LIMIT = 1_400_000;
  private readonly WARNING_THRESHOLD = 0.7;  // 70%
  private readonly CRITICAL_THRESHOLD = 0.9; // 90%

  record(instruction: string, cuConsumed: number) {
    const existing = this.measurements.get(instruction) ?? [];
    existing.push(cuConsumed);

    // Keep last 1000 measurements
    if (existing.length > 1000) existing.shift();
    this.measurements.set(instruction, existing);
  }

  analyze(): CUReport[] {
    return Array.from(this.measurements.entries()).map(([instruction, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p50 = this.percentile(sorted, 0.5);
      const p95 = this.percentile(sorted, 0.95);
      const p99 = this.percentile(sorted, 0.99);
      const max = sorted[sorted.length - 1];

      const recommendations: string[] = [];

      if (p99 / this.CU_LIMIT > this.CRITICAL_THRESHOLD) {
        recommendations.push(
          `CRITICAL: ${instruction} approaches CU limit. Split into multiple transactions or optimize computation.`
        );
      } else if (p95 / this.CU_LIMIT > this.WARNING_THRESHOLD) {
        recommendations.push(
          `WARNING: ${instruction} uses >70% CU limit. Consider: (1) reducing account loads, (2) using zero-copy deserialization, (3) batching smaller operations.`
        );
      }

      if (p99 > p95 * 1.5) {
        recommendations.push(
          `High variance detected. Some calls use 50%+ more CU than typical. Check for conditional logic paths with heavy computation.`
        );
      }

      return {
        instruction,
        avgCU: Math.round(avg),
        p50CU: Math.round(p50),
        p95CU: Math.round(p95),
        p99CU: Math.round(p99),
        maxCU: max,
        limit: this.CU_LIMIT,
        utilizationPct: Math.round((p99 / this.CU_LIMIT) * 100),
        recommendations,
      };
    });
  }

  getPrometheusMetrics(): string {
    // Generate Prometheus exposition format
    const lines: string[] = [];
    for (const report of this.analyze()) {
      lines.push(`solana_cu_avg{instruction="${report.instruction}"} ${report.avgCU}`);
      lines.push(`solana_cu_p95{instruction="${report.instruction}"} ${report.p95CU}`);
      lines.push(`solana_cu_p99{instruction="${report.instruction}"} ${report.p99CU}`);
      lines.push(`solana_cu_limit{instruction="${report.instruction}"} ${report.limit}`);
    }
    return lines.join('\n');
  }

  private percentile(sorted: number[], p: number): number {
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }
}
```

## Account State Monitoring

### PDA Health & Rent Exemption

```typescript
// account-monitor.ts
import { createSolanaRpc, lamportsToSol, address } from '@solana/kit';

interface AccountHealth {
  address: string;
  owner: string;
  lamports: number;
  solBalance: number;
  dataSize: number;
  rentExempt: boolean;
  rentExemptMinimum: number;
  executable: boolean;
  lastModifiedSlot: number;
  observedAt: Date;
}

class AccountMonitor {
  private rpc: ReturnType<typeof createSolanaRpc>;
  private trackedAccounts: Set<string> = new Set();

  constructor(rpcUrl: string) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  trackAccount(pubkey: string) {
    this.trackedAccounts.add(pubkey);
  }

  async checkHealth(): Promise<AccountHealth[]> {
    const results = await Promise.all(
      Array.from(this.trackedAccounts).map(addr => this.checkAccount(addr))
    );
    return results;
  }

  private async checkAccount(pubkey: string): Promise<AccountHealth> {
    const accountInfo = await this.rpc.getAccountInfo(address(pubkey), {
      encoding: 'base64',
    }).send();

    if (!accountInfo.value) {
      return {
        address: pubkey,
        owner: 'MISSING',
        lamports: 0,
        solBalance: 0,
        dataSize: 0,
        rentExempt: false,
        rentExemptMinimum: 0,
        executable: false,
        lastModifiedSlot: 0,
        observedAt: new Date(),
      };
    }

    const lamports = Number(accountInfo.value.lamports);
    const dataSize = accountInfo.value.data.length;
    const rentExemptMinimum = await this.getRentExemptMinimum(dataSize);

    return {
      address: pubkey,
      owner: accountInfo.value.owner,
      lamports,
      solBalance: lamportsToSol(BigInt(lamports)),
      dataSize,
      rentExempt: lamports >= rentExemptMinimum,
      rentExemptMinimum,
      executable: accountInfo.value.executable,
      lastModifiedSlot: Number(accountInfo.value.slot),
      observedAt: new Date(),
    };
  }

  private async getRentExemptMinimum(dataSize: number): Promise<number> {
    return Number(await this.rpc.getMinimumBalanceForRentExemption(BigInt(dataSize)).send());
  }

  // Detect unauthorized owner changes
  async detectAnomalies(previous: AccountHealth[], current: AccountHealth[]): string[] {
    const alerts: string[] = [];

    const prevMap = new Map(previous.map(a => [a.address, a]));

    for (const curr of current) {
      const prev = prevMap.get(curr.address);
      if (!prev) continue;

      if (prev.owner !== curr.owner && !curr.executable) {
        alerts.push(
          `SECURITY: Account ${curr.address} owner changed from ${prev.owner} to ${curr.owner}`
        );
      }

      if (!prev.rentExempt && !curr.rentExempt && curr.lamports < prev.lamports) {
        alerts.push(
          `RISK: Account ${curr.address} is not rent exempt and balance decreased to ${curr.solBalance} SOL`
        );
      }

      if (curr.dataSize > prev.dataSize * 1.5) {
        alerts.push(
          `GROWTH: Account ${curr.address} data size increased by ${((curr.dataSize/prev.dataSize - 1) * 100).toFixed(0)}%`
        );
      }
    }

    return alerts;
  }
}
```

## Program Upgrade Detection

```typescript
// upgrade-detector.ts
interface ProgramDeployment {
  programId: string;
  authority: string;
  lastDeploySlot: number;
  dataHash: string;           // Hash of program data for change detection
  version?: string;           // From program metadata if available
  observedAt: Date;
}

class ProgramUpgradeDetector {
  private knownPrograms: Map<string, ProgramDeployment> = new Map();
  private alertHandlers: ((alert: UpgradeAlert) => void)[] = [];

  async scan(rpc: any, programIds: string[]): Promise<UpgradeAlert[]> {
    const alerts: UpgradeAlert[] = [];

    for (const programId of programIds) {
      const accountInfo = await rpc.getAccountInfo(address(programId)).send();
      if (!accountInfo.value?.executable) continue;

      const current: ProgramDeployment = {
        programId,
        authority: accountInfo.value.owner,
        lastDeploySlot: Number(accountInfo.value.slot),
        dataHash: this.hashData(accountInfo.value.data),
        observedAt: new Date(),
      };

      const previous = this.knownPrograms.get(programId);

      if (previous) {
        // Check for upgrade
        if (current.dataHash !== previous.dataHash) {
          alerts.push({
            type: 'UPGRADE',
            severity: 'warning',
            programId,
            message: `Program ${programId} was upgraded at slot ${current.lastDeploySlot}`,
            previousHash: previous.dataHash,
            currentHash: current.dataHash,
            previousSlot: previous.lastDeploySlot,
            currentSlot: current.lastDeploySlot,
          });
        }

        // Check for authority change
        if (current.authority !== previous.authority) {
          alerts.push({
            type: 'AUTHORITY_CHANGE',
            severity: 'critical',
            programId,
            message: `CRITICAL: Program ${programId} authority changed from ${previous.authority} to ${current.authority}`,
            previousAuthority: previous.authority,
            currentAuthority: current.authority,
          });
        }
      }

      this.knownPrograms.set(programId, current);
    }

    // Fire alert handlers
    for (const alert of alerts) {
      for (const handler of this.alertHandlers) {
        handler(alert);
      }
    }

    return alerts;
  }

  onAlert(handler: (alert: UpgradeAlert) => void) {
    this.alertHandlers.push(handler);
  }

  private hashData(data: Uint8Array): string {
    // Use subtle crypto for hashing in production
    return Buffer.from(data.slice(0, 32)).toString('base64');
  }
}

interface UpgradeAlert {
  type: 'UPGRADE' | 'AUTHORITY_CHANGE' | 'CLOSURE';
  severity: 'info' | 'warning' | 'critical';
  programId: string;
  message: string;
  [key: string]: any;
}
```

## On-Chain Event Monitoring (Helius Webhooks)

```typescript
// helius-webhook-monitor.ts
interface WebhookConfig {
  accountAddresses: string[];
  transactionTypes: ('ANY' | 'NFT_SALE' | 'TOKEN_MINT' | 'PROGRAM_CALL')[];
  webhookURL: string;
  authHeader?: string;
}

class HeliusWebhookMonitor {
  private apiKey: string;
  private baseUrl = 'https://api.helius.xyz/v0';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createWebhook(config: WebhookConfig): Promise<string> {
    const response = await fetch(`${this.baseUrl}/webhooks?api-key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        // Enhanced API types for program monitoring
        accountInclude: config.accountAddresses,
        accountExclude: [],
        accountRequired: [],
      }),
    });

    const data = await response.json();
    return data.webhookID;
  }

  async handleWebhook(payload: HeliusWebhookPayload) {
    for (const event of payload) {
      // Extract compute units consumed
      const cuConsumed = event.meta?.computeUnitsConsumed;

      // Extract errors
      const error = event.meta?.err;

      // Log with correlation
      structuredLog('on-chain-event', {
        signature: event.signature,
        slot: event.slot,
        timestamp: event.timestamp,
        type: event.type,
        source: event.source,
        fee: event.fee,
        cuConsumed,
        error,
        programIds: event.transaction?.message?.accountKeys?.filter(
          (_: any, i: number) => event.transaction?.message?.isProgramSigner?.[i]
        ),
      });
    }
  }
}

interface HeliusWebhookPayload {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  meta: {
    computeUnitsConsumed: number;
    err: any;
  };
  transaction: any;
}
```

## Fee Market Analysis

```typescript
// fee-market-analyzer.ts
class FeeMarketAnalyzer {
  async analyzePriorityFees(rpc: any): Promise<FeeRecommendation> {
    // Get recent priority fee estimates
    const recentFees = await rpc.getRecentPriorityFeeEstimate({
      recommended: true,
      // Or specify accounts for targeted fees
    }).send();

    // Get fee history for trend analysis
    const feeHistory = await rpc.getRecentPerformanceSamples(10).send();

    const recommendations = this.calculateTiers(recentFees, feeHistory);

    return {
      timestamp: new Date(),
      networkCongestion: this.assessCongestion(feeHistory),
      recommendations,
      trend: this.calculateTrend(feeHistory),
    };
  }

  private calculateTiers(recentFees: any, history: any[]): FeeTier[] {
    const baseFee = recentFees.priorityFeeEstimate ?? 5000;

    return [
      {
        name: 'eco',
        description: 'Economy — may take longer, cheapest',
        microLamports: Math.round(baseFee * 0.5),
        expectedConfirmation: '1-4 slots (~1.6s)',
      },
      {
        name: 'standard',
        description: 'Standard — balanced cost and speed',
        microLamports: Math.round(baseFee * 1.0),
        expectedConfirmation: '1-2 slots (~0.8s)',
      },
      {
        name: 'fast',
        description: 'Fast — high priority, reliable',
        microLamports: Math.round(baseFee * 2.0),
        expectedConfirmation: 'next slot (~0.4s)',
      },
      {
        name: 'urgent',
        description: 'Urgent — maximum priority',
        microLamports: Math.round(baseFee * 5.0),
        expectedConfirmation: 'inclusion guaranteed',
      },
    ];
  }

  private assessCongestion(history: any[]): 'low' | 'medium' | 'high' | 'extreme' {
    const avgTPS = history.reduce((sum, h) => sum + h.numTransactions, 0) / history.length;
    if (avgTPS < 1000) return 'low';
    if (avgTPS < 3000) return 'medium';
    if (avgTPS < 6000) return 'high';
    return 'extreme';
  }

  private calculateTrend(history: any[]): 'rising' | 'stable' | 'falling' {
    if (history.length < 2) return 'stable';
    const first = history[0].numTransactions;
    const last = history[history.length - 1].numTransactions;
    const change = (last - first) / first;

    if (change > 0.2) return 'rising';
    if (change < -0.2) return 'falling';
    return 'stable';
  }
}

interface FeeRecommendation {
  timestamp: Date;
  networkCongestion: 'low' | 'medium' | 'high' | 'extreme';
  recommendations: FeeTier[];
  trend: 'rising' | 'stable' | 'falling';
}

interface FeeTier {
  name: string;
  description: string;
  microLamports: number;
  expectedConfirmation: string;
}
```

## Compute Unit Budget Alert Rules

```yaml
# alert-rules-cu.yml
groups:
  - name: solana_program_alerts
    rules:
      - alert: HighCUUsage
        expr: solana_cu_p99 / solana_cu_limit > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Program {{ $labels.instruction }} approaching CU limit"
          description: "P99 CU usage is {{ $value | humanizePercentage }} of the 1.4M limit"

      - alert: CriticalCUUsage
        expr: solana_cu_p99 / solana_cu_limit > 0.95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Program {{ $labels.instruction }} critically close to CU limit"
          description: "P99 CU usage is {{ $value | humanizePercentage }} — transactions may fail"

      - alert: TransactionFailureRate
        expr: |
          (
            sum(rate(solana_tx_failed[5m])) by (instruction)
            /
            sum(rate(solana_tx_total[5m])) by (instruction)
          ) > 0.05
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High failure rate for {{ $labels.instruction }}"
          description: "Failure rate is {{ $value | humanizePercentage }} over 5 minutes"

      - alert: ProgramUpgraded
        expr: changes(solana_program_data_hash[1h]) > 0
        labels:
          severity: warning
        annotations:
          summary: "Program {{ $labels.program_id }} was upgraded"
          description: "Program data hash changed at {{ $value }}"

      - alert: ProgramAuthorityChanged
        expr: changes(solana_program_authority[1h]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "CRITICAL: Program {{ $labels.program_id }} authority changed"
          description: "This may indicate a security compromise"
```

## IDL Version Tracking

```typescript
// idl-version-tracker.ts
class IDLVersionTracker {
  private versions: Map<string, { hash: string; timestamp: Date }> = new Map();

  async trackIDL(programId: string, idl: any) {
    const hash = this.hashIDL(idl);
    const previous = this.versions.get(programId);

    if (previous && previous.hash !== hash) {
      // IDL changed — check for breaking changes
      const breakingChanges = this.detectBreakingChanges(/* previous IDL */, idl);

      return {
        type: 'IDL_CHANGE',
        programId,
        previousHash: previous.hash,
        currentHash: hash,
        breakingChanges,
        timestamp: new Date(),
      };
    }

    this.versions.set(programId, { hash, timestamp: new Date() });
    return null;
  }

  private hashIDL(idl: any): string {
    const canonical = JSON.stringify(idl, Object.keys(idl).sort());
    // Use crypto hash in production
    return Buffer.from(canonical).toString('base64').slice(0, 16);
  }

  private detectBreakingChanges(oldIdl: any, newIdl: any): string[] {
    const changes: string[] = [];

    // Check for removed instructions
    const oldInstructions = new Set(oldIdl.instructions.map((i: any) => i.name));
    const newInstructions = new Set(newIdl.instructions.map((i: any) => i.name));

    for (const ix of oldInstructions) {
      if (!newInstructions.has(ix)) {
        changes.push(`Instruction '${ix}' was removed`);
      }
    }

    // Check for changed account requirements
    for (const ix of newIdl.instructions) {
      const oldIx = oldIdl.instructions.find((i: any) => i.name === ix.name);
      if (!oldIx) {
        changes.push(`New instruction '${ix.name}' added`);
        continue;
      }

      // Check account changes
      for (const acc of ix.accounts) {
        const oldAcc = oldIx.accounts.find((a: any) => a.name === acc.name);
        if (oldAcc && oldAcc.isMut !== acc.isMut) {
          changes.push(`Account '${acc.name}' in '${ix.name}' mutability changed`);
        }
        if (oldAcc && oldAcc.isSigner !== acc.isSigner) {
          changes.push(`Account '${acc.name}' in '${ix.name}' signer requirement changed`);
        }
      }
    }

    return changes;
  }
}
```


