# Deployment evidence notes

These files record **historical Testnet observations**. Do not rewrite old
timestamps, hashes or source digests to make them look current. Testnet resets
and ledger storage expiry can invalidate the observations independently of this
repository.

## License metadata change (27 November 2026)

The workspace `LICENSE`, `NOTICE`, `package.json` and both crate `Cargo.toml`
files were changed from MIT to Apache-2.0. Only license/metadata text changed;
no Rust source, dependency version, toolchain or build setting changed.

- `build-inputs.json` keeps the source digests of the files as they were when
  the recorded deployment was built. Those `sourceSha256` values no longer match
  the current `Cargo.toml` files because of the license field edit.
- A fresh pinned release rebuild (`rust 1.91.0`, target `wasm32v1-none`,
  `soroban-sdk 27.0.6`) produced the same executable hashes recorded in
  `testnet.json`:
  - `accordbridge_escrow.wasm` → `0d17ac8fb6495f2258d1707f72157b25f0fa7a4912a2c1691364b302267f86b9`
  - `accordbridge_test_token.wasm` → `47d4cdec1486c27f4826bd49764a09dd5eec1d7a5083be43820bca18905f45a3`

The executable identity used by the backend's pinned-code checks is therefore
unchanged. This note does not extend the lifetime or availability of the
original deployment, and it is not a claim about hosted wallet acceptance.

Any future change to contract source, dependencies or build inputs requires a
new build, new hashes, a new deployment and new validation evidence rather than
reusing these records.
