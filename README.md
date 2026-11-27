# AccordBridge Contracts

[![Contract checks](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/contracts.yml/badge.svg?branch=main)](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/contracts.yml)
[![Dependency advisories](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/dependency-advisories.yml/badge.svg?branch=main)](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/dependency-advisories.yml)

## Contents

- [Scope of work](#scope-of-work)
- [What it does](#what-it-does)
- [Design rules](#design-rules)
- [Build and test](#build-and-test)
- [Verification status](#verification-status)
- [Testnet deployment and smoke test](#testnet-deployment-and-smoke-test)
- [Before mainnet](#before-mainnet)
- [Documents](#documents)
- [Contribute](https://github.com/accordbridge-labs/.github/blob/main/docs/START-HERE.md)

**Status: experimental Stellar testnet implementation.** Rust/Soroban escrow and a valueless ABUSD faucet token are deployed and exercised on testnet. No audit, mainnet deployment or real-money integration exists. The production escrow provider remains undecided. See [Before mainnet](#before-mainnet) for the gates that would have to change.

## Scope of work

This repository owns on-chain custody and authorization only. The frontend
prompts wallets; the backend prepares transactions and reconciles results.
Neither the application's approval workflow nor this contract is a dispute
service.

| Crate / artifact | Purpose | Boundary |
| --- | --- | --- |
| `escrow` | First-milestone testnet escrow: frozen terms, participant approvals, client funding, single release, mutual refund. | No resolver, admin withdrawal, timeout, fee, split, amendment or upgrade path. |
| `test-token` | ABUSD faucet proving seven-decimal token accounting on Testnet. | Valueless; not USDC and not a complete SEP-41 implementation. |
| `scripts/testnet.mjs` | Preflight, deployment and smoke tooling with public evidence records. | Broadcasts only Testnet transactions; never uses real wallets. |
| `deployments/` | Timestamped public hashes, IDs and transaction records. | Historical observations; resets and storage expiry can invalidate them. |

No upstream contract implementation was copied. Each new version needs its own
build, hashes, deployment and validation rather than reusing this evidence.

## What it does

Each escrow freezes two participant addresses, token, positive amount and a terms hash. Both wallets must accept that hash before the client funds. The client may release once, only to the original freelancer. Two participant refund votes return funds once, only to the original client. One refund vote does not freeze release. No admin or resolver can withdraw. There is no dispute process, timeout release, fee, split, amendment or recovery authority.

Both contracts reject networks other than Stellar Testnet. ABUSD is permissionlessly minted in 1,000-token faucet calls, has seven decimals and **no monetary value**. It implements only the token methods used by this experiment; it is not a complete production SEP-41 implementation or USDC.

## Design rules

These properties are enforced in the contracts and pinned by tests.

| Rule | Where it lives | How it is pinned |
| --- | --- | --- |
| Money math errors rather than saturates. | Checked arithmetic in both contracts. | `faucet_overflow_preserves_balance_at_the_boundary` and `destination_overflow_rolls_back_sender_debit`. |
| Authorization is checked before a state change. | Participant `require_auth` and immutable recipients. | Tests for outsider acceptance, funded-state authorization and unauthorized release after funding. |
| A terminal escrow stays terminal. | Release/refund transitions cannot be replayed. | `happy_path_and_no_double_release`, `refund_is_terminal_in_either_vote_order`, terminal-state replay tests. |
| One refund vote never pays or freezes release. | Refund votes are recorded separately from settlement. | `outsider_cannot_accept_and_duplicate_refund_vote_does_not_settle`. |
| Balances conserve exactly. | Transfers commit atomically with state. | 8 escrow and 5 token host tests include boundary and rollback cases. |
| The artifact is reproducible. | Pinned Rust 1.91.0, `soroban-sdk` 27.0.6, `Cargo.lock`, target `wasm32v1-none`. | CI rebuilds and compares WASM hashes; see [CI artifacts](docs/CI-WASM-ARTIFACTS.md). |
| Ledger entries expire. | Writes extend instance TTL; read-only views do not. | Documented limitation; restoration procedure is open in [#6](https://github.com/accordbridge-labs/accordbridge-contracts/issues/6). |

## Build and test

Pinned versions: Rust 1.91.0, soroban-sdk 27.0.6, JavaScript stellar-sdk 17.2.1; Node 22.12+.

```sh
rustup show
cargo test --locked
cargo build --locked --release --target wasm32v1-none
```

These checks do not deploy contracts or submit transactions. CI also checks
formatting and verifies that a fresh release rebuild produces matching WASM hashes.
See [CI and downloadable artifacts](docs/CI-WASM-ARTIFACTS.md).

## Verification status

| Check | Result on `main` (27 Nov 2026) | What it establishes |
| --- | --- | --- |
| `cargo test --locked --workspace` | 8 escrow + 5 token tests passed | Authorization, settlement, refund ordering, term replay and token arithmetic boundaries. |
| `npm test` | 14 passed | Offline CLI preflight and test-token/fixture tooling regressions; no network writes. |
| `cargo fmt --all -- --check` | Passed | Formatting gate. |
| Pinned release WASM rebuild | Hashes match `deployments/testnet.json` | `0d17ac8f…` escrow and `47d4cdec…` token are byte-identical to the recorded Testnet artifacts. |
| `npm audit --json` | 0 advisories | JavaScript tooling lockfile scan. |
| `cargo audit` | 0 unwaived vulnerabilities | One reviewed, expiring exception: `RUSTSEC-2026-0387` via pinned soroban-sdk; see [DEPENDENCY-ADVISORIES.md](docs/DEPENDENCY-ADVISORIES.md). |
| [App CI](https://github.com/accordbridge-labs/accordbridge-contracts/actions/runs/46078221051) · [Advisory CI](https://github.com/accordbridge-labs/accordbridge-contracts/actions/runs/46078220997) | Passed | Post-merge checks on the Apache-2.0 commits. |
| Hosted two-wallet Freighter acceptance | **NOT RUN** | No real wallet flow has been verified; automated suites do not drive Freighter. |

These are local and CI checks on the pinned source. They are not an audit, not
proof of mainnet readiness, and not evidence that old Testnet deployments remain
available. License metadata changed after the recorded deployment; the WASM
hashes did not change, as explained in [deployment notes](deployments/README.md).

### Testnet deployment and smoke test

The following commands create keys and broadcast transactions. Run only when you
intend to create Testnet fixtures, not as a prerequisite for a documentation change.

```sh
npm ci
npm run testnet:setup
npm run testnet:smoke
```

Setup obtains free test XLM from Friendbot, uploads both WASMs and deploys the test token. Smoke deploys an escrow, mints tokens, obtains both approvals, funds, attempts unauthorized release, then releases to the freelancer. These commands broadcast only testnet transactions. They create synthetic fixture keys in ignored `.local/testnet-fixtures.json` with restrictive permissions. Never use real wallets or commit this file. Runtime backend/frontend need no fixture private keys. Public IDs, executable hashes and transaction hashes are written to `deployments/`. Testnet resets/storage expiry can invalidate old evidence.

The workspace integration resides in the sibling backend/frontend. The backend copies public deployment values into its configuration and verifies code/terms/balance on reconciliation. It supports the first milestone only; testnet transaction evidence is in its `docs/evidence/testnet-api.json`.

## Before mainnet

Hard gates, every one requiring a human decision. None is complete:

- [ ] Settled authority, resolver, timeout, fee, split, amendment and recovery model ([#2](https://github.com/accordbridge-labs/accordbridge-contracts/issues/2)).
- [ ] External audit of the exact deployed executable hash, plus a reporting channel.
- [ ] Real asset, mainnet deployment, and new pinned hashes with fresh validation ([#1](https://github.com/accordbridge-labs/accordbridge-contracts/issues/1)).
- [ ] Storage restoration and long-term TTL procedures ([#6](https://github.com/accordbridge-labs/accordbridge-contracts/issues/6)).
- [ ] Monitoring, incident response, tested backups and an operational runbook.
- [ ] Legal/compliance decisions and written dispute policy.
- [ ] Fresh hosted wallet evidence with real assets — never inferred from mocked tests.

The full rationale is in the
[production escrow roadmap](docs/PRODUCTION-ESCROW-ROADMAP.md). This is future
work; the current contracts remain a valueless Testnet experiment.

## Documents

- [Contract interface, authorization and settlement states](docs/CONTRACT-INTERFACE.md)

- [Testnet decision and limits](docs/TESTNET-DECISION.md)
- [Production escrow roadmap — future work, not a current capability](docs/PRODUCTION-ESCROW-ROADMAP.md)
- [Provider evaluation](docs/PROVIDER-EVALUATION.md)
- [Validation matrix](docs/VALIDATION.md)
- [Dependency advisories, Rust exception and triage](docs/DEPENDENCY-ADVISORIES.md)
- [Public deployment](deployments/testnet.json)
- [Funding/release evidence](deployments/smoke-testnet.json)
- [Canonical product rules](https://github.com/accordbridge-labs/accordbridge-backend/blob/main/docs/PRODUCT.md)

No upstream contract implementation was copied. Licensed under the [Apache License 2.0](LICENSE) with the attribution notices in [NOTICE](NOTICE). Dependencies retain their own licenses and notices. Production dependency decisions remain pending.

The escrow tests also exercise unauthorized calls after funding, outsider acceptance, repeated refund votes, both refund vote orders, terminal-state replay, and balance conservation. These are local Soroban host tests, not an audit or new deployment evidence.

### Fixture CLI preflight and account funding

`node scripts/testnet.mjs --help` prints usage successfully without reading fixture inputs, contacting RPC, generating keys or writing files. Missing commands, unknown commands and extra arguments fail with usage. `setup` first reads both release WASM files and checks their WASM headers; `smoke` first validates the existing public Testnet manifest (network, fixed RPC, hashes, token identity and valueless ABUSD configuration). Fix missing/invalid inputs before retrying. The actual runner is loaded only after these checks, then verifies the RPC network passphrase before creating fixture directories or keys. These checks do not attest that a deployment is correct or current.

Fixture funding uses a raw [`getLedgerEntries`](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries) account lookup. Pinned SDK 17.2.1's `getAccountEntry()` catches every lookup error as “Account not found,” and its ledger parser normalizes omitted entries to an empty list. Neither is sufficient proof of absence. Only a successful, validated response with an explicit empty entries array and a valid ledger number permits one Friendbot request. Existing entries must decode to the requested account. Transport errors, rate limits, malformed responses and timeouts stop without funding. The fixed Testnet RPC and Friendbot endpoints have 15-second request deadlines; there is no mainnet fallback. Friendbot errors are sanitized and considered unconfirmed: check the public account before retrying. No automatic funding or transaction retry is added.

Run `npm ci --ignore-scripts && npm test` for offline mocked CLI/account regressions. CI runs this separately from the Rust contract checks, without invoking setup/smoke, using fixture secrets, or broadcasting transactions. These tests are not live-wallet or Testnet deployment validation.

### Public run history

Setup and smoke create `deployments/runs/<timestamp>-<uuid>.started.json` before
chain activity. On success they append a separate `.completed.json` containing
only the public manifest, source Git revision, dirty-worktree flag, and WASM
SHA-256 hashes. Smoke records both WASM hashes from its validated setup manifest.
A dirty flag means the commit alone does not reproduce the working tree; use a
clean committed tree for reproducible deployment evidence.

Records use exclusive creation and are never overwritten. An interrupted run
may have only a started record; a caught failure adds `.incomplete.json` without
SDK errors, secret keys, or signed envelopes. Incomplete runs can have on-chain
effects: inspect public chain state before retrying. No automatic retry occurs.

After a stage succeeds and its completed record is written, the corresponding
`deployments/testnet.json` or `deployments/smoke-testnet.json` latest manifest is
atomically replaced, retaining existing consumer fields. Failed writes leave the
previous latest manifest intact. A completed record plus an incomplete record
means the chain stage completed but publishing the latest evidence failed; the
completed record is available for inspection. Concurrent successful runs each
retain their own records; the last atomic replacement becomes latest.

Offline checks: `npm test` and `cargo test --locked --offline --workspace`.
No deployment is needed to test evidence persistence.
