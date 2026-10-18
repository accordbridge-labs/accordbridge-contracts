# Escrow interface and authority

Source: [escrow/src/lib.rs](../escrow/src/lib.rs). This is an integration guide for
the current Testnet prototype, not an audit or a production payment specification.
Both participant addresses, token address, amount and terms hash are frozen at
construction. The constructor rejects non-Testnet networks, identical participants
and non-positive amounts.

| Entry point | Authorization | Preconditions and result |
| --- | --- | --- |
| `state()` | Read-only | Returns stored terms, approval/refund flags and numeric status. |
| `accept(party, terms)` | Named participant's wallet | Status 0, matching hash and party equal to client/freelancer; records that party's approval. |
| `fund()` | Client wallet | Status 0 and both approvals; transfers the fixed amount from client to escrow, status 1. |
| `release()` | Client wallet | Status 1; transfers the fixed amount to the original freelancer, status 2. |
| `request_refund(party)` | Named participant's wallet | Status 1 and recognized participant; records a vote. Both votes transfer the fixed amount to the original client, status 3. |

```text
0: awaiting funding ── both approvals + client fund ──> 1: funded
                                                        ├─ client release ──> 2: released
                                                        └─ both refund votes ─> 3: refunded
```

There is no transition out of status 2 or 3. One refund vote neither moves tokens
nor freezes the client's release authority. Repeated votes before settlement do
not count as the other participant's vote. Token transfers and state updates are
part of one contract invocation; a failed invocation must not be presented as a
successful payment by an integrator.

## App controls are not contract controls

The backend gates app-managed release on work approval, but the contract does not
read PostgreSQL, delivery notes, revision history or review deadlines. A client
can invoke `release()` directly while status is 1. There is no admin withdrawal,
resolver authority, dispute freeze, timed release, fee, split payout or amendment.
Do not describe app review rules as on-chain guarantees.

The backend prepares transactions and checks the expected executable, frozen terms
and balance during reconciliation. Freighter signs on the participant's behalf.
Never put wallet secrets in API requests, documentation or public test fixtures.

## Storage and failure handling

State uses instance storage; writes request TTL extension with threshold 100,000
and target 500,000 ledgers. `state()` itself does not extend TTL. This is not an
implemented archival-restoration workflow: see [existing restoration work](https://github.com/accordbridge-labs/accordbridge-contracts/issues/6).

Current guards use assertions/panics rather than a stable typed public error enum.
An unknown submission outcome is not proof of failure: reconcile the existing
transaction and state before preparing another action. The backend's
[Testnet guide](https://github.com/accordbridge-labs/accordbridge-backend/blob/main/docs/TESTNET.md)
documents application intent/recovery limits.

## Test token and verification

[ABUSD](../test-token/src/lib.rs) is a permissionless faucet token with seven
decimals and no monetary value. It is neither USDC nor a full production SEP-41
implementation. Keep amount arithmetic integral at token precision.

Run `cargo test --locked --workspace` for local contract behavior and
`cargo fmt --all -- --check` for formatting. CI verifies a pinned, reproducible
WASM build. [Deployment records](../deployments/) describe historical Testnet
transactions; they do not guarantee current availability after resets or expiry.
