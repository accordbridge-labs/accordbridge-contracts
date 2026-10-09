# Reproducible WASM build artifacts (Testnet only)

The `Contract WASM build and tests` GitHub Actions workflow runs without deployment credentials or signing secrets. It checks Rust formatting, runs `cargo test --locked --workspace`, and builds both Soroban contracts using the repository's pinned Rust 1.91.0, `wasm32v1-none` target and committed `Cargo.lock`. The workflow deliberately has only `contents: read` permission and runs no Friendbot, deployment, or transaction-broadcast commands.

## Artifacts and source provenance

Each successful run uploads a downloadable `accordbridge-testnet-wasm-<commit>` archive containing `accordbridge_escrow.wasm`, `accordbridge_test_token.wasm`, `SHA256SUMS`, and `BUILD-INFO.txt`. The latter records the exact source commit, toolchain, target, release profile, Soroban SDK version and input-file hashes. The workflow builds twice, clearing release target outputs between builds, then compares byte-for-byte and validates SHA-256 digests. Any mismatch fails the run. This checks repeatability on that CI host/toolchain, not cross-machine bit-for-bit determinism.

## Compare an artifact against a deployment record

1. Open the successful workflow run for the source commit, download and extract its artifact.
2. Run `sha256sum -c SHA256SUMS` in the extracted artifact directory. Verify the source commit in `BUILD-INFO.txt` matches the reviewed Git commit.
3. Compare each WASM's `sha256sum` with the corresponding executable hash or locally archived WASM evidence in `deployments/testnet.json` and `deployments/build-inputs.json`, checking **which hashing representation each field uses**. A Soroban on-chain executable/WASM hash must be checked against its actual chain specification; never treat an artifact ZIP digest, source-file digest or contract ID as interchangeable with a WASM hash.
4. If old public deployment evidence uses another source revision or old artifact hashes, report a mismatch and investigate. **Do not rewrite public deployment evidence to match new builds.** Testnet resets, TTL expiry and a code upgrade can invalidate the association.
5. To validate the current ledger deployment, independently verify the Testnet network passphrase, contract ID, live executable reference and archived/restored status using the Soroban tooling. Passing CI or equal hashes alone proves neither deployed code nor audit coverage.

This workflow does not sign, fund, deploy, or authorize transfers and does not claim mainnet readiness. Build output is experimental and unaudited.
