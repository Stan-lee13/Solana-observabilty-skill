# Runbook: Wallet Error Spike

**Alert:** `WalletErrorSpike` | **Severity:** P2 subset users; P1 if claim/mint affected
**Target resolution:** P1 < 30 min; P2 < 2 hours | **Owner:** Frontend SRE

---

## When this fires
- Wallet adapter error rate > 5% for 5+ minutes
- Specific error type spiking: reject, timeout, disconnect
- Users reporting: "wallet won't connect", "tx rejected", "stuck pending"

---

## Immediate actions (do this first)

```bash
# Check error breakdown by type in your analytics/Sentry
# Filter: last 1 hour, source = wallet-adapter
# Group by: error.name, wallet_name
# If concentrated in one wallet type → Step A (provider issue)
# If spread across all wallets → Step B (network/RPC issue)
```

---

## Diagnosis steps

| Error | Root cause | User action | Dev action |
|---|---|---|---|
| `WalletNotReadyError` | Extension not installed | Install wallet | Add install prompt + detect |
| `WalletConnectionError` | User cancelled | Try again | Better UX — don't auto-retry |
| `WalletSignTransactionError` | User rejected or sim failed | Check tx details | Log simulation result |
| `WalletSendTransactionError` | Network rejected tx | N/A | Add preflight sim — Step B |
| `WalletTimeoutError` | Wallet frozen | Refresh wallet | Add timeout handling — Step C |

---

## Remediation

### Step A — Wallet-provider specific issue
```bash
# Check provider status pages
# Phantom: https://status.phantom.app
# Backpack: https://twitter.com/xNFT_Backpack (no status page)
# Solflare: https://status.solflare.com
# If provider is down: post user advisory, wait for recovery
```

### Step B — Add preflight simulation to catch send errors
```typescript
const sim = await connection.simulateTransaction(tx, {
  sigVerify: false,
  replaceRecentBlockhash: true,
});
if (sim.value.err) {
  const errMsg = sim.value.logs?.find(l => l.includes('Error')) ?? 'Unknown error';
  throw new WalletSendTransactionError(`Transaction would fail: ${errMsg}`);
}
// Only call wallet.sendTransaction if simulation passes
const sig = await wallet.sendTransaction(tx, connection);
```

### Step C — Timeout handling
```typescript
const TIMEOUT_MS = 30_000;
const signWithTimeout = (tx: Transaction) =>
  Promise.race([
    wallet.signTransaction(tx),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Wallet signing timed out — please retry')), TIMEOUT_MS)
    ),
  ]);
```

---

## Escalation
- > 10% of users affected → post status update in Discord + status page
- Mint or claim flow broken → P1 — pull frontend dev on-call
- Funds at risk → `runbooks/wallet-drain-detected.md`

---

## Post-incident
- [ ] Error distribution by wallet type documented
- [ ] Preflight simulation added to all affected tx flows
- [ ] User-facing error messages improved with clear recovery steps
- [ ] Alert threshold reviewed: P1 if mint/claim affected
