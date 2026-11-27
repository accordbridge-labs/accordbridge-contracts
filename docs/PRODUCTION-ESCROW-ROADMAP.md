# Production escrow roadmap — future work, not a current capability

**Status: planning document only.** Nothing in this file is implemented, audited,
deployed, or part of the current Drips Wave submission. The repositories contain
an **experimental Stellar Testnet prototype** that uses valueless ABUSD faucet
tokens. It is not a payment service, and no real funds should ever be sent to it.

This roadmap records what would have to be true before real-value escrow could
be considered. It exists so that the prototype's limits are explicit rather than
implied, and so that future work can be reviewed against concrete prerequisites.
It does not promise a timeline, a provider, an audit, or mainnet readiness.

## What the prototype already does

- Each escrow freezes client, freelancer, asset, amount and agreement hash.
- Both participants approve the frozen terms on-chain; the client then funds the
  first milestone with valueless ABUSD.
- Release pays only the immutable freelancer recipient, once, and requires
  client authorization. A full refund needs both votes and pays only the client.
- The backend prepares unsigned transactions; participants sign in Freighter;
  the backend submits and reconciles results against contract state and balances.
- No administrator, resolver, upgrade or arbitrary withdrawal entry point exists.

These behaviors are testnet evidence only. They are not a dispute process, not a
fee or split-settlement implementation, and not an audit of any production
system. See [TESTNET-DECISION.md](TESTNET-DECISION.md),
[CONTRACT-INTERFACE.md](CONTRACT-INTERFACE.md) and
[VALIDATION.md](VALIDATION.md) for the current contract's exact authority model
and limitations.

## Prerequisites before any real-value escrow

### 1. Settle the authority and policy model

Tracked in issue [#2](https://github.com/accordbridge-labs/accordbridge-contracts/issues/2)
and the backend [POLICY](https://github.com/accordbridge-labs/accordbridge-backend/blob/main/docs/POLICY.md).

- Define which rules are contract-enforced and which are organizational policy.
- Decide whether a resolver exists, who appoints them, their powers, and how
  their unavailability or appeal is handled before irreversible payout.
- Define timeouts, fee schedule, partial/split settlement, amendments, key-loss
  recovery, and residual-token handling.
- Specify every scenario in the validation matrix, including unauthorized
  actions, duplicates, payout/dispute races and insufficient ledger history.

Today the application's work approval does **not** constrain the contract: the
client can call release directly. That must be an explicit, reviewed decision,
not an accident.

### 2. Build, review and audit the exact production artifact

Tracked in issue [#1](https://github.com/accordbridge-labs/accordbridge-contracts/issues/1)
and [PROVIDER-EVALUATION.md](PROVIDER-EVALUATION.md).

- Link the exact deployed executable hash to reviewed source, pinned toolchain
  and lockfile, as the current deployment records do for the testnet prototype.
- Obtain an independent audit covering that exact hash and the integration, not
  a version-unmatched upstream audit or a branch name.
- Run a meaningful test suite against that version; record any disabled or
  outdated upstream tests accurately.
- Establish a vulnerability-reporting channel and a triage/severity policy.
- Never describe a clean advisory scan or a mocked test as an audit. See
  [DEPENDENCY-ADVISORIES.md](DEPENDENCY-ADVISORIES.md).

### 3. Choose the real asset and mainnet deployment path

- Select and document the token, its issuer, decimals, transfer semantics and
  fees. ABUSD has no value and does not implement a complete SEP-41 surface.
- Deploy on mainnet with pinned hashes and public, reproducible build inputs.
- Re-run authorization, settlement and token-accounting tests against the new
  artifact; any contract change requires new hashes, deployment and validation.
- Update backend configuration and reconciliation for the new network and asset,
  with independent verification of terms, code, balance and destination.

### 4. Operational readiness

- Long-term ledger-entry lifetimes, archival restoration and testnet/mainnet
  reset procedures. See issue
  [#6](https://github.com/accordbridge-labs/accordbridge-contracts/issues/6).
- Bounded, idempotent reconciliation of unresolved intents with safe restart and
  RPC-outage behavior. See backend issue
  [#9](https://github.com/accordbridge-labs/accordbridge-backend/issues/9).
- Monitoring, alerting, incident-response ownership and response targets.
- Secure handling of operator secrets, database credentials and deployment keys;
  never commit recovery phrases or signed envelopes to evidence.
- Backup and restore rehearsals, and a documented cutover/rollback plan.

### 5. Legal, compliance and user-facing terms

- Know-your-customer/anti-money-laundering obligations for the relevant
  jurisdictions, custody terms, fee disclosure and tax treatment.
- Written client/freelancer agreement on authority, dispute handling and appeal.
- Clear user-facing explanations of what is contract-enforced versus policy.
- Privacy review: keep private project files and personal data off public chains.

### 6. Evidence discipline for the next program submission

- Keep historical Testnet deployment records; do not rewrite timestamps or
  hashes to look current. See [deployment notes](../deployments/README.md).
- Distinguish local, mocked, hosted, Testnet and mainnet evidence in every
  report. A hosted wallet acceptance run with real funds must never be inferred
  from automated browser tests.
- Cite only merged changes, actual CI runs and observed transactions. Never
  invent activity, users, audits or hackathon history.

## Relationship to the current submission

This document is **future work**. The current repositories remain a Testnet
prototype, and the Wave appeal should present them that way. Adding this roadmap
does not make the application mainnet-ready, change any contract hash, or create
a funded escrow service. It simply makes the gap between a testnet experiment
and a real payment system explicit and reviewable.
