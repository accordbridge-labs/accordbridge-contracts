import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as S from "@stellar/stellar-sdk";

export const RPC = "https://soroban-testnet.stellar.org";
export const USAGE =
  "Usage: node scripts/testnet.mjs <setup|smoke>\n       node scripts/testnet.mjs --help\nsetup requires built escrow/token WASM; smoke requires a valid deployments/testnet.json. Testnet only.";

export function prerequisites(mode, read = readFileSync) {
  if (mode === "setup") {
    const inputs = {};
    for (const [name, file] of Object.entries({
      escrowWasm: "target/wasm32v1-none/release/accordbridge_escrow.wasm",
      tokenWasm: "target/wasm32v1-none/release/accordbridge_test_token.wasm",
    })) {
      try {
        inputs[name] = read(file);
      } catch {
        throw new Error(
          `Missing or unreadable WASM input: ${file}. Build the workspace first.`,
        );
      }
      if (
        inputs[name].length < 8 ||
        !inputs[name]
          .subarray(0, 8)
          .equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
      )
        throw new Error(
          `Invalid WASM input: ${file}. Build the workspace first.`,
        );
    }
    return inputs;
  }
  let manifest;
  try {
    manifest = JSON.parse(read("deployments/testnet.json", "utf8"));
  } catch {
    throw new Error(
      "Missing or invalid deployments/testnet.json; inspect the public setup manifest.",
    );
  }
  if (
    !manifest ||
    manifest.network !== "testnet" ||
    manifest.networkPassphrase !== S.Networks.TESTNET ||
    manifest.rpc !== RPC ||
    !/^[a-f0-9]{64}$/.test(manifest.escrowWasmHash) ||
    !/^[a-f0-9]{64}$/.test(manifest.tokenWasmHash) ||
    !S.StrKey.isValidContract(manifest.tokenContract ?? "") ||
    manifest.tokenSymbol !== "ABUSD" ||
    manifest.tokenDecimals !== 7 ||
    manifest.tokenHasMonetaryValue !== false
  )
    throw new Error(
      "Invalid Testnet manifest identity, WASM hashes or valueless ABUSD configuration.",
    );
  return { manifest };
}

export async function runCli(
  args,
  {
    read = readFileSync,
    loadRunner = () => import("./testnet-run.mjs"),
    log = console.log,
  } = {},
) {
  if (args.length === 1 && args[0] === "--help") {
    log(USAGE);
    return;
  }
  if (args.length !== 1 || !["setup", "smoke"].includes(args[0]))
    throw new Error(USAGE);
  const mode = args[0];
  const inputs = prerequisites(mode, read);
  const { runTestnet } = await loadRunner();
  await runTestnet(mode, inputs);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    // Only our validation/account messages are safe to print. SDK errors can contain envelopes.
    const safe =
      error instanceof Error &&
      (error.message === USAGE ||
        /^(Missing or (unreadable WASM input|invalid deployments\/testnet.json)|Invalid (WASM input|Testnet manifest)|Testnet required|Account lookup |Friendbot )/.test(
          error.message,
        ));
    console.error(
      safe
        ? error.message
        : "Testnet command failed. Inspect public chain state before retrying; no automatic retry was attempted.",
    );
    process.exitCode = 1;
  }
}
