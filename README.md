# AccordBridge Contracts

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
npm ci
npm run testnet:setup
npm run testnet:smoke
```

Setup obtains free test XLM from Friendbot, uploads both WASMs and deploys the test token. Smoke deploys an escrow, mints tokens, obtains both approvals, funds, attempts unauthorized release, then releases to the freelancer. These commands broadcast only testnet transactions. They create synthetic fixture keys in ignored `.local/testnet-fixtures.json` with restrictive permissions. Never use real wallets or commit this file. Runtime backend/frontend need no fixture private keys. Public IDs, executable hashes and transaction hashes are written to `deployments/`. Testnet resets/storage expiry can invalidate old evidence.

The workspace integration resides in the sibling backend/frontend. The backend copies public deployment values into its configuration and verifies code/terms/balance on reconciliation. It supports the first milestone only; testnet transaction evidence is in its `docs/evidence/testnet-api.json`.

## Documents

- [Testnet decision and limits](docs/TESTNET-DECISION.md)
- [Provider evaluation](docs/PROVIDER-EVALUATION.md)
- [Validation matrix](docs/VALIDATION.md)
- [Public deployment](deployments/testnet.json)
- [Funding/release evidence](deployments/smoke-testnet.json)
- [Canonical product rules](https://github.com/accordbridge-labs/accordbridge-backend/blob/main/docs/PRODUCT.md)

No upstream contract implementation was copied. Licensed under the [MIT License](LICENSE). Dependencies retain their own licenses and notices. Production dependency decisions remain pending.

The escrow tests also exercise unauthorized calls after funding, outsider acceptance, repeated refund votes, both refund vote orders, terminal-state replay, and balance conservation. These are local Soroban host tests, not an audit or new deployment evidence.
