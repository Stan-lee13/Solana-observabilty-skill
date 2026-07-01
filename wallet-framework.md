# Wallet Framework — Observability Skill

Canonical reference for wallet-grade security standards as they apply to the Observability skill.
Cross-references: `skill/wallet-observability.md`, `skill/security-observability.md`

---

## Wallet Role × Monitoring Responsibility

| Wallet Role | Owner | Storage | Monitoring Signal |
|---|---|---|---|
| Treasury | Protocol DAO | Squads 3-of-5 | `solana_treasury_balance_sol`, authority-change alerts |
| Fee Payer | Automated cranker | AWS KMS hot wallet | `solana_fee_payer_balance_sol`, burn-rate alerts |
| Mint Authority | Protocol team | Squads 3-of-5 | `solana_authority_mismatch{account="mint"}` |
| Oracle Submitter | Automated oracle | AWS KMS | `solana_oracle_feed_age_seconds` |
| Operator Wallet | Node operator | Hardware recommended | `solana_node_stake_balance_sol` |

---

## Password Derivation Standard (Argon2id)

All operator wallets using password-encrypted keystores must use Argon2id. Monitoring validates this.

```typescript
import argon2 from 'argon2';

// Correct: Argon2id for password-protected keystore encryption
async function deriveEncryptionKey(password: string, salt: Buffer): Promise<Buffer> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,   // 64MB — GPU brute-force resistant
    timeCost: 3,
    parallelism: 4,
    salt,
    hashLength: 32,
    raw: true,
  }) as unknown as Buffer;
}

// NEVER use: bcrypt (72-char limit), PBKDF2 (no memory hardness),
// SHA256 directly (trivially brute-forced), scrypt (acceptable but Argon2id preferred)
```

**Monitoring:** `solana_keystore_algo_valid{node_id}` — see `skill/wallet-observability.md`

---

## HD Wallet Gap Limit Discovery

When restoring from seed, always scan beyond the BIP44 gap limit (20 empty accounts) to prevent fund loss.

```typescript
const GAP_LIMIT = 20;

async function discoverAllFundedAccounts(mnemonic: string, connection: Connection) {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const funded = [];
  let empty = 0, i = 0;

  while (empty < GAP_LIMIT) {
    const { key } = derivePath(`m/44'/501'/${i}'/0'`, seed.toString('hex'));
    const kp = Keypair.fromSeed(key);
    const balance = await connection.getBalance(kp.publicKey);
    if (balance > 0) { funded.push({ i, kp, balance }); empty = 0; }
    else { empty++; }
    i++;
  }
  return funded;
}
```

**Monitoring:** `solana_hd_gap_max_funded_index` — see `skill/wallet-observability.md`

---

## A1-A8 Threat Model — Observability Scope

| Code | Threat | Observability Signal | Runbook |
|---|---|---|---|
| A1 | RPC MITM / manipulation | `solana_rpc_healthy`, slot lag | `runbooks/rpc-degradation.md` |
| A2 | Clipboard hijack (address swap) | Wallet error spike + user reports | `runbooks/wallet-error-spike.md` |
| A4 | Supply chain (npm compromise) | Dependency audit alerts | External: Snyk/Socket.dev |
| A5 | Oracle key compromise | `solana_oracle_feed_age_seconds` spike | `runbooks/wallet-drain-detected.md` |
| A6 | Sybil / rogue node | DePIN node fleet metrics | Cross-skill: depin-builder-skill |
| A7 | Governance attack | Authority change + proposal alerts | `runbooks/program-upgrade-detected.md` |
| A8 | Address poisoning | Wallet error spike | `runbooks/wallet-error-spike.md` |

---

## Cross-Skill P0 Escalation

```
Any A1/A4/A5/A7 alert detected
  → Emit: OBSERVABILITY → INCIDENT_RESPONSE signal
  → Load: solana-incident-response-skill (primary handler)
  → Notify: Protocol Lead via PagerDuty
  → Pause: program if active exploit confirmed
```
