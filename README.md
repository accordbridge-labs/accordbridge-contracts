# AccordBridge Contracts

[![Contract checks](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/contracts.yml/badge.svg?branch=main)](https://github.com/accordbridge-labs/accordbridge-contracts/actions/workflows/contracts.yml)

[Contract behavior](#what-it-does) · [Authorization reference](docs/CONTRACT-INTERFACE.md) · [Local checks](#build-and-test) · [Testnet scripts](#testnet-deployment-and-smoke-test) · [Contribute](https://github.com/accordbridge-labs/.github/blob/main/docs/START-HERE.md)

**Status: experimental Stellar testnet implementation.** Rust/Soroban escrow and a valueless ABUSD faucet token are deployed and exercised on testnet. No audit, mainnet deployment or real-money integration exists. The production escrow provider remains undecided.

## What it does

Each escrow freezes two participant addresses, token, positive amount and a terms hash. Both wallets must accept that hash before the client funds. The client may release once, only to the original freelancer. Two participant refund votes return funds once, only to the original client. One refund vote does not freeze release. No admin or resolver can withdraw. There is no dispute process, timeout release, fee, split, amendment or recovery authority.

Both contracts reject networks other than Stellar Testnet. ABUSD is permissionlessly minted in 1,000-token faucet calls, has seven decimals and **no monetary value**. It implements only the token methods used by this experiment; it is not a complete production SEP-41 implementation or USDC.

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

## Documents

- [Contract interface, authorization and settlement states](docs/CONTRACT-INTERFACE.md)

- [Testnet decision and limits](docs/TESTNET-DECISION.md)
- [Provider evaluation](docs/PROVIDER-EVALUATION.md)
- [Validation matrix](docs/VALIDATION.md)
- [Public deployment](deployments/testnet.json)
- [Funding/release evidence](deployments/smoke-testnet.json)
- [Canonical product rules](https://github.com/accordbridge-labs/accordbridge-backend/blob/main/docs/PRODUCT.md)

No upstream contract implementation was copied. Licensed under the [MIT License](LICENSE). Dependencies retain their own licenses and notices. Production dependency decisions remain pending.

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
