# Application Observability for Solana

Frontend error tracking, wallet UX monitoring, user journey analytics, and client-side performance for Solana dApps.

## Wallet Connection Monitoring

### Wallet Adapter Error Classification

```typescript
// wallet-error-tracker.ts
import type { WalletError } from '@solana/wallet-adapter-base';

enum WalletErrorCategory {
  USER_REJECTED = 'user_rejected',
  TIMEOUT = 'timeout',
  NETWORK_ERROR = 'network_error',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  SIMULATION_FAILED = 'simulation_failed',
  NONCE_INVALID = 'nonce_invalid',
  BLOCKHASH_NOT_FOUND = 'blockhash_not_found',
  ALREADY_PROCESSED = 'already_processed',
  UNKNOWN = 'unknown',
}

interface ClassifiedError {
  originalError: string;
  category: WalletErrorCategory;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  userMessage: string;
  shouldRetry: boolean;
  retryDelayMs: number;
  context: {
    walletName: string;
    rpcEndpoint: string;
    transactionType?: string;
    timestamp: Date;
  };
}

class WalletErrorClassifier {
  private errorCounts: Map<WalletErrorCategory, number> = new Map();
  private readonly ERROR_THRESHOLD = 10;  // Alert if same error > 10 times in 5 min

  classify(error: WalletError, context: { walletName: string; rpcEndpoint: string; transactionType?: string }): ClassifiedError {
    const message = error.message?.toLowerCase() ?? '';
    const errorName = error.name?.toLowerCase() ?? '';

    let category = WalletErrorCategory.UNKNOWN;
    let severity: ClassifiedError['severity'] = 'error';
    let userMessage = 'An unexpected error occurred. Please try again.';
    let shouldRetry = true;
    let retryDelayMs = 1000;

    // Classification rules
    if (message.includes('rejected') || message.includes('declined') || message.includes('cancelled')) {
      category = WalletErrorCategory.USER_REJECTED;
      severity = 'info';
      userMessage = 'Transaction was cancelled.';
      shouldRetry = false;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      category = WalletErrorCategory.TIMEOUT;
      severity = 'warning';
      userMessage = 'The request timed out. Please check your connection and retry.';
      shouldRetry = true;
      retryDelayMs = 5000;
    } else if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      category = WalletErrorCategory.NETWORK_ERROR;
      severity = 'warning';
      userMessage = 'Network connection issue. Please check your internet and retry.';
      shouldRetry = true;
      retryDelayMs = 3000;
    } else if (message.includes('insufficient') || message.includes('0x1')) {
      category = WalletErrorCategory.INSUFFICIENT_FUNDS;
      severity = 'warning';
      userMessage = 'Insufficient funds for this transaction. Please add SOL to your wallet.';
      shouldRetry = false;
    } else if (message.includes('simulation') || message.includes('0x11') || message.includes('instructionerror')) {
      category = WalletErrorCategory.SIMULATION_FAILED;
      severity = 'error';
      userMessage = 'Transaction simulation failed. The operation may not be valid.';
      shouldRetry = false;
    } else if (message.includes('blockhash') || message.includes('not found')) {
      category = WalletErrorCategory.BLOCKHASH_NOT_FOUND;
      severity = 'warning';
      userMessage = 'Transaction expired. Please retry.';
      shouldRetry = true;
      retryDelayMs = 1000;
    }

    // Track error frequency
    const count = (this.errorCounts.get(category) ?? 0) + 1;
    this.errorCounts.set(category, count);

    // Check if we should alert
    if (count > this.ERROR_THRESHOLD) {
      this.fireAlert(category, count);
    }

    return {
      originalError: error.message,
      category,
      severity,
      userMessage,
      shouldRetry,
      retryDelayMs,
      context: {
        ...context,
        timestamp: new Date(),
      },
    };
  }

  getErrorRates(): { category: WalletErrorCategory; count: number; pctOfTotal: number }[] {
    const total = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    return Array.from(this.errorCounts.entries())
      .map(([category, count]) => ({
        category,
        count,
        pctOfTotal: total > 0 ? count / total : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private fireAlert(category: WalletErrorCategory, count: number) {
    // Alert implementation (see alerting.md)
  }
}
```

### User Journey Funnel

```typescript
// user-journey-tracker.ts
enum JourneyStage {
  PAGE_LOAD = 'page_load',
  WALLET_CONNECT_INIT = 'wallet_connect_init',
  WALLET_CONNECTED = 'wallet_connected',
  TRANSACTION_INIT = 'tx_init',
  TRANSACTION_SIGNED = 'tx_signed',
  TRANSACTION_SENT = 'tx_sent',
  TRANSACTION_CONFIRMED = 'tx_confirmed',
  TRANSACTION_FINALIZED = 'tx_finalized',
  ERROR = 'error',
}

interface FunnelEvent {
  stage: JourneyStage;
  sessionId: string;
  walletAddress?: string;
  walletName?: string;
  transactionType?: string;
  timestamp: Date;
  metadata: Record<string, any>;
  durationFromPreviousMs?: number;
}

class UserJourneyTracker {
  private events: FunnelEvent[] = [];
  private activeSessions: Map<string, JourneyStage> = new Map();
  private sessionStartTimes: Map<string, Date> = new Map();

  recordEvent(event: Omit<FunnelEvent, 'timestamp' | 'durationFromPreviousMs'>) {
    const timestamp = new Date();
    const previousStage = this.activeSessions.get(event.sessionId);
    const previousTime = this.sessionStartTimes.get(event.sessionId);

    const durationFromPreviousMs = previousTime
      ? timestamp.getTime() - previousTime.getTime()
      : undefined;

    const fullEvent: FunnelEvent = {
      ...event,
      timestamp,
      durationFromPreviousMs,
    };

    this.events.push(fullEvent);
    this.activeSessions.set(event.sessionId, event.stage);
    this.sessionStartTimes.set(event.sessionId, timestamp);

    // Alert on drop-offs at critical stages
    if (event.stage === JourneyStage.ERROR) {
      this.analyzeDropOff(event.sessionId, previousStage);
    }
  }

  // Calculate funnel conversion rates
  getFunnel(): { stage: JourneyStage; entered: number; dropped: number; conversionRate: number; avgTimeMs?: number }[] {
    const stages = Object.values(JourneyStage).filter(s => s !== JourneyStage.ERROR);
    const stageCounts = new Map<JourneyStage, { entered: number; times: number[] }>();

    for (const stage of stages) {
      const events = this.events.filter(e => e.stage === stage);
      stageCounts.set(stage, {
        entered: events.length,
        times: events.map(e => e.durationFromPreviousMs).filter((t): t is number => t !== undefined),
      });
    }

    return stages.map((stage, i) => {
      const data = stageCounts.get(stage)!;
      const nextStage = stages[i + 1];
      const nextData = nextStage ? stageCounts.get(nextStage) : null;

      const dropped = nextData ? Math.max(0, data.entered - nextData.entered) : 0;
      const conversionRate = nextData && data.entered > 0
        ? nextData.entered / data.entered
        : 1;

      return {
        stage,
        entered: data.entered,
        dropped,
        conversionRate,
        avgTimeMs: data.times.length > 0
          ? Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length)
          : undefined,
      };
    });
  }

  // Identify bottlenecks
  getBottlenecks(): { stage: JourneyStage; dropOffRate: number; avgWaitMs: number }[] {
    const funnel = this.getFunnel();
    return funnel
      .filter(f => f.conversionRate < 0.8)  // < 80% conversion is a bottleneck
      .map(f => ({
        stage: f.stage,
        dropOffRate: 1 - f.conversionRate,
        avgWaitMs: f.avgTimeMs ?? 0,
      }))
      .sort((a, b) => b.dropOffRate - a.dropOffRate);
  }

  private analyzeDropOff(sessionId: string, lastStage?: JourneyStage) {
    if (!lastStage) return;

    // Log drop-off for analysis
    structuredLog('journey-dropoff', {
      sessionId,
      lastSuccessfulStage: lastStage,
      timestamp: new Date(),
    });
  }
}
```

## Client-Side Performance Monitoring

### Transaction Latency Tracking (Browser)

```typescript
// client-latency-tracker.ts
interface TransactionTiming {
  signature: string;
  stages: {
    initiatedAt: number;       // performance.now()
    walletPromptAt?: number;   // Time to wallet popup
    signedAt?: number;         // User signed
    sentAt?: number;           // Sent to RPC
    preflightAt?: number;      // Simulation complete
    confirmedAt?: number;      // First confirmation
    finalizedAt?: number;      // Finalized
  };
  walletName: string;
  rpcEndpoint: string;
  transactionType: string;
  priorityFeeAdded: boolean;
  jitoBundle: boolean;
}

class ClientLatencyTracker {
  private timings: TransactionTiming[] = [];

  startTracking(signature: string, details: Omit<TransactionTiming, 'stages'>): TransactionTiming {
    const timing: TransactionTiming = {
      signature,
      ...details,
      stages: { initiatedAt: performance.now() },
    };
    this.timings.push(timing);
    return timing;
  }

  recordStage(signature: string, stage: keyof TransactionTiming['stages']) {
    const timing = this.timings.find(t => t.signature === signature);
    if (timing) {
      timing.stages[stage] = performance.now();
    }
  }

  // Get latency breakdown for analytics
  getLatencyBreakdown(signature: string): {
    walletPromptMs?: number;
    signingMs?: number;
    rpcSendMs?: number;
    confirmationMs?: number;
    totalMs?: number;
  } | null {
    const t = this.timings.find(t => t.signature === signature);
    if (!t) return null;

    const s = t.stages;
    return {
      walletPromptMs: s.walletPromptAt ? Math.round(s.walletPromptAt - s.initiatedAt) : undefined,
      signingMs: s.signedAt && s.walletPromptAt ? Math.round(s.signedAt - s.walletPromptAt) : undefined,
      rpcSendMs: s.sentAt && s.signedAt ? Math.round(s.sentAt - s.signedAt) : undefined,
      confirmationMs: s.confirmedAt && s.sentAt ? Math.round(s.confirmedAt - s.sentAt) : undefined,
      totalMs: s.confirmedAt ? Math.round(s.confirmedAt - s.initiatedAt) : undefined,
    };
  }

  // Aggregated stats for dashboard
  getStats(): {
    avgTotalConfirmationMs: number;
    p95ConfirmationMs: number;
    avgSigningTimeMs: number;
    byWallet: Record<string, { count: number; avgConfirmationMs: number }>;
    byTransactionType: Record<string, { count: number; avgConfirmationMs: number }>;
  } {
    const completed = this.timings.filter(t => t.stages.confirmedAt);
    const totalTimes = completed.map(t => t.stages.confirmedAt! - t.stages.initiatedAt).sort((a, b) => a - b);

    return {
      avgTotalConfirmationMs: this.avg(totalTimes),
      p95ConfirmationMs: this.percentile(totalTimes, 0.95),
      avgSigningTimeMs: this.avg(
        completed
          .filter(t => t.stages.signedAt && t.stages.walletPromptAt)
          .map(t => t.stages.signedAt! - t.stages.walletPromptAt!)
      ),
      byWallet: this.groupByWallet(completed),
      byTransactionType: this.groupByTxType(completed),
    };
  }

  private avg(arr: number[]): number {
    return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }

  private percentile(sorted: number[], p: number): number {
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }

  private groupByWallet(timings: TransactionTiming[]) {
    const groups: Record<string, number[]> = {};
    for (const t of timings) {
      (groups[t.walletName] ??= []).push(t.stages.confirmedAt! - t.stages.initiatedAt);
    }
    return Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, { count: v.length, avgConfirmationMs: this.avg(v) }])
    );
  }

  private groupByTxType(timings: TransactionTiming[]) {
    const groups: Record<string, number[]> = {};
    for (const t of timings) {
      (groups[t.transactionType] ??= []).push(t.stages.confirmedAt! - t.stages.initiatedAt);
    }
    return Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, { count: v.length, avgConfirmationMs: this.avg(v) }])
    );
  }
}
```

## React Integration Hook

```typescript
// useSolanaObservability.ts
import { useCallback, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

export function useSolanaObservability() {
  const { wallet, publicKey } = useWallet();
  const { connection } = useConnection();
  const journeyTracker = useRef(new UserJourneyTracker());
  const errorClassifier = useRef(new WalletErrorClassifier());
  const latencyTracker = useRef(new ClientLatencyTracker());

  // Wrap sendTransaction with observability
  const trackTransaction = useCallback(async (
    sendFn: () => Promise<string>,
    txType: string,
  ): Promise<string> => {
    const sessionId = crypto.randomUUID();
    const walletName = wallet?.adapter.name ?? 'unknown';
    const rpcEndpoint = connection.rpcEndpoint;

    // Record journey start
    journeyTracker.current.recordEvent({
      stage: JourneyStage.TRANSACTION_INIT,
      sessionId,
      walletAddress: publicKey?.toBase58(),
      walletName,
      transactionType: txType,
      metadata: { rpcEndpoint },
    });

    let signature: string;
    let timing: TransactionTiming;

    try {
      timing = latencyTracker.current.startTracking('pending', {
        signature: 'pending',
        walletName,
        rpcEndpoint,
        transactionType: txType,
        priorityFeeAdded: false,  // Set based on your TX config
        jitoBundle: false,
      });

      latencyTracker.current.recordStage('pending', 'walletPromptAt');
      signature = await sendFn();

      timing.signature = signature;
      latencyTracker.current.recordStage(signature, 'signedAt');
      latencyTracker.current.recordStage(signature, 'sentAt');

      journeyTracker.current.recordEvent({
        stage: JourneyStage.TRANSACTION_SIGNED,
        sessionId,
        walletAddress: publicKey?.toBase58(),
        walletName,
        transactionType: txType,
        metadata: { signature },
      });

      // Listen for confirmation
      connection.onSignature(signature, (result) => {
        if (result.err) {
          latencyTracker.current.recordStage(signature, 'confirmedAt');
          journeyTracker.current.recordEvent({
            stage: JourneyStage.ERROR,
            sessionId,
            walletAddress: publicKey?.toBase58(),
            walletName,
            transactionType: txType,
            metadata: { signature, error: result.err },
          });

          const error = new Error(JSON.stringify(result.err));
          const classified = errorClassifier.current.classify(error as WalletError, {
            walletName,
            rpcEndpoint,
            transactionType: txType,
          });

          reportToSentry(classified);
        } else {
          latencyTracker.current.recordStage(signature, 'confirmedAt');
          latencyTracker.current.recordStage(signature, 'finalizedAt');

          journeyTracker.current.recordEvent({
            stage: JourneyStage.TRANSACTION_CONFIRMED,
            sessionId,
            walletAddress: publicKey?.toBase58(),
            walletName,
            transactionType: txType,
            metadata: { signature, latency: latencyTracker.current.getLatencyBreakdown(signature) },
          });
        }
      });

      return signature;

    } catch (error) {
      const classified = errorClassifier.current.classify(error as WalletError, {
        walletName,
        rpcEndpoint,
        transactionType: txType,
      });

      journeyTracker.current.recordEvent({
        stage: JourneyStage.ERROR,
        sessionId,
        walletAddress: publicKey?.toBase58(),
        walletName,
        transactionType: txType,
        metadata: { error: classified },
      });

      reportToSentry(classified);
      throw error;
    }
  }, [wallet, publicKey, connection]);

  // Get real-time stats for UI
  const getStats = useCallback(() => {
    return latencyTracker.current.getStats();
  }, []);

  const getFunnel = useCallback(() => {
    return journeyTracker.current.getFunnel();
  }, []);

  const getBottlenecks = useCallback(() => {
    return journeyTracker.current.getBottlenecks();
  }, []);

  return { trackTransaction, getStats, getFunnel, getBottlenecks };
}

function reportToSentry(classifiedError: ClassifiedError) {
  // Integrate with Sentry or similar
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureException(new Error(classifiedError.originalError), {
      tags: {
        error_category: classifiedError.category,
        wallet_name: classifiedError.context.walletName,
      },
      level: classifiedError.severity,
    });
  }
}
```

## Client Error Boundary

```typescript
// SolanaErrorBoundary.tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

export class SolanaErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log to your observability pipeline
    structuredLog('react-error-boundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      wallet: (window as any).solana?.isPhantom ? 'phantom' : 'unknown',
      timestamp: new Date().toISOString(),
    });

    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="solana-error-fallback">
          <h2>Something went wrong</h2>
          <p>We've been notified and are working on a fix.</p>
          <button onClick={() => window.location.reload()}>
            Reload Application
          </button>
          <details>
            <summary>Technical details</summary>
            <pre>{this.state.error?.message}</pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// Helper for structured logging in browser
function structuredLog(event: string, data: Record<string, any>) {
  const logEntry = {
    event,
    ...data,
    session_id: getSessionId(),
    user_agent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };

  // Send to your log aggregator
  fetch('/api/logs', {
    method: 'POST',
    body: JSON.stringify(logEntry),
    keepalive: true,
  }).catch(() => {});

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Observability]', logEntry);
  }
}

function getSessionId(): string {
  let sid = sessionStorage.getItem('obs_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('obs_session_id', sid);
  }
  return sid;
}
```

## Browser Resource Timing

```typescript
// resource-observer.ts
export function observeResources() {
  // Monitor fetch/XHR performance
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0]?.toString() ?? '';
    const start = performance.now();

    try {
      const response = await originalFetch.apply(this, args);

      // Log RPC call performance
      if (url.includes('solana') || url.includes('helius') || url.includes('quiknode')) {
        structuredLog('rpc-client-timing', {
          url: url.replace(/\?.*$/, ''),  // Remove query params with keys
          method: args[1]?.method ?? 'GET',
          status: response.status,
          durationMs: Math.round(performance.now() - start),
          timestamp: new Date().toISOString(),
        });
      }

      return response;
    } catch (error) {
      structuredLog('rpc-client-error', {
        url: url.replace(/\?.*$/, ''),
        method: args[1]?.method ?? 'GET',
        error: (error as Error).message,
        durationMs: Math.round(performance.now() - start),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  };

  // Use Performance Observer for Core Web Vitals
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'web-vitals') {
          structuredLog('web-vital', {
            name: entry.name,
            value: (entry as any).value,
            rating: (entry as any).rating,  // 'good' | 'needs-improvement' | 'poor'
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    observer.observe({ entryTypes: ['web-vitals'] as any });
  }
}
```

## Sentry Integration

```typescript
// sentry-config.ts
import * as Sentry from '@sentry/react';

export function initSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Solana-specific context enrichment
    beforeSend(event) {
      // Add wallet context
      const wallet = (window as any).solana;
      if (wallet?.isPhantom) {
        event.tags = {
          ...event.tags,
          wallet: 'phantom',
          wallet_version: wallet.version,
        };
      }

      // Add network context
      const rpcUrl = localStorage.getItem('rpc-url') ?? 'default';
      event.tags = {
        ...event.tags,
        rpc_endpoint: rpcUrl,
      };

      return event;
    },

    // Classify Solana errors properly
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch') {
        const url = breadcrumb.data?.url?.toString() ?? '';
        if (url.includes('solana') || url.includes('helius')) {
          breadcrumb.category = 'rpc';
          breadcrumb.type = 'http';
        }
      }
      return breadcrumb;
    },

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
  });
}
```

## Alert Rules (Frontend)

```yaml
# alert-rules-frontend.yml
groups:
  - name: solana_frontend_alerts
    rules:
      - alert: HighWalletConnectFailure
        expr: |
          (
            sum(rate(solana_wallet_connect_failed[5m]))
            /
            sum(rate(solana_wallet_connect_total[5m]))
          ) > 0.15
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High wallet connection failure rate"
          description: "{{ $value | humanizePercentage }} of wallet connections are failing"

      - alert: SlowTransactionConfirmation
        expr: histogram_quantile(0.95, solana_tx_confirmation_duration_seconds) > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 transaction confirmation time > 30s"

      - alert: UserJourneyDropOff
        expr: |
          (
            solana_journey_stage{stage="tx_confirmed"}
            /
            solana_journey_stage{stage="tx_init"}
          ) < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Transaction completion rate below 50%"

      - alert: ClientSideErrors
        expr: increase(solana_client_errors[5m]) > 50
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Spike in client-side errors"


