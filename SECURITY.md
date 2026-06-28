# Security Policy

## Scope

This repository contains AI skill prompts, production observability guidance, and a local monitoring stack for Solana protocols. Security-sensitive areas include alert metadata, logging/tracing examples, deploy manifests, webhook handling, RPC URLs, and dashboard/public status guidance.

## Reporting Vulnerabilities

Report vulnerabilities privately to the repository maintainer or project security contact. Do not open public issues for:

- leaked API keys or RPC URLs
- wallet-drain UX vulnerabilities
- unsafe logging of secrets
- broken authority monitoring guidance
- exploit-enabling runbook details
- dashboard exposure of private infrastructure

Include:

- affected file and line
- impact and exploitability
- reproduction steps
- recommended fix if known

## Secret Handling Rules

Never commit:

- private keys, keypairs, seed phrases, mnemonics
- RPC URLs containing API keys
- PagerDuty, Slack, Discord, Helius, QuickNode, or Grafana tokens
- production wallet addresses tied to private operations
- unredacted Authorization headers

Use environment variables or secret managers for deploy examples.

## Disclosure and Fix Expectations

P0 security issues should be triaged immediately. P1 issues should receive maintainer response within 2 business days. Documentation-only safety issues should still be fixed before release if they could cause unsafe generated code.
