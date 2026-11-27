# Dependency advisories: scope and triage

This repository runs a separate [dependency advisory workflow](../.github/workflows/dependency-advisories.yml)
that reads `package-lock.json` and `Cargo.lock` only. It does not run
`testnet:setup`, `testnet:smoke`, Friendbot, wallet signing, contract builds or
deployments. It has `contents: read` only and receives no secrets, including on
untrusted pull requests.

## What the checks do

1. JavaScript: pin `npm@10.9.9`, install with `--ignore-scripts`, run
   `npm audit --json`, and classify the result with
   `scripts/check-audit-json.mjs` rather than relying on the command exit code.
2. Rust: install pinned `cargo-audit@0.22.0` and run `cargo audit` against
   `Cargo.lock` using the reviewed exception file `.cargo/audit.toml`.

Outcomes:

| Outcome | Meaning | CI result |
| --- | --- | --- |
| `PASS` | No critical/high npm advisories; Rust has no unwaived vulnerabilities | Success |
| Critical/high advisory or Rust vulnerability | Patch or documented, time-bounded exception required | Failure |
| `ADVISORY DATABASE UNAVAILABLE` | Registry/advisory-network failure — **not** a clean scan | Failure (infrastructure) |

`cargo audit` warnings (for example `unmaintained` or `unsound` notices) are
printed but do not fail the job; they must still be triaged in an issue. A
scheduled run (weekly) catches advisories published after a PR was merged.
A clean scan is **not** a security audit, a contract audit, or a mainnet
readiness claim. See [CONTRACT-INTERFACE.md](CONTRACT-INTERFACE.md) and
[TESTNET-DECISION.md](TESTNET-DECISION.md) for the contract's authority limits.

## Reviewed exception currently in force

`RUSTSEC-2026-0387` (timing variability in `crypto-bigint` 0.5.5) is recorded in
`.cargo/audit.toml`. It is reached through the pinned `soroban-sdk` 27.0.6 host
dependency; the suggested fix requires `crypto-bigint >= 0.7.6`, which is not
available in that pinned SDK line. The affected crate belongs to the local/test
host dependency tree, not the pinned on-chain WASM, and this experiment holds
only valueless ABUSD with no real keys or funds.

- Recorded: 2026-11-27 by the maintainer.
- Expires: 2026-12-27. Re-evaluate on the next `soroban-sdk` bump or earlier if
  a compatible patched release becomes available.
- Do not treat this exception as applying to any future deployment with real
  value, and do not copy the ignore into another repository.

## Triage rules

1. Reproduce locally (`npm audit --json`, `cargo audit`) and record scanner
   version, advisory ID, affected version, dependency path, and actual exposure.
2. Prefer a compatible patched upgrade. For JS, update `package.json` and the
   lockfile together. For Rust, do not hand-edit `Cargo.lock` past the pinned
   SDK/toolchain: a change to on-chain dependencies requires a new build,
   hash, deployment and validation record.
3. Re-run `npm test`, `cargo fmt --all -- --check`,
   `cargo test --locked --workspace` and the pinned WASM reproducibility check
   after any dependency change.
4. Exceptions must name the advisory, reason, reviewer and expiry date, and be
   linked from an issue and PR. Silent or indefinite ignores are not allowed.
5. The advisory job receives no secrets and performs no Testnet writes; never
   add smoke/setup steps to it.

See the [organization contribution terms](https://github.com/accordbridge-labs/.github/blob/main/CONTRIBUTING.md)
for the rule that mocked or advisory-only checks must not be presented as live
Testnet evidence.
