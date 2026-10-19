import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "@stellar/stellar-sdk";
import { runCli, USAGE } from "./testnet.mjs";
import { runTestnet } from "./testnet-run.mjs";

const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const manifest = JSON.parse(
  readFileSync(new URL("../deployments/testnet.json", import.meta.url)),
);

test("help and invalid arguments never read prerequisites or load the side-effect runner", async () => {
  const forbidden = () => {
    assert.fail("Side-effect boundary reached");
  };
  const logs = [];
  const deps = {
    read: forbidden,
    loadRunner: forbidden,
    log: (value) => logs.push(value),
  };
  await runCli(["--help"], deps);
  assert.deepEqual(logs, [USAGE]);
  for (const args of [
    [],
    ["unknown"],
    ["setup", "extra"],
    ["smoke", "--help"],
    ["--help", "setup"],
  ])
    await assert.rejects(runCli(args, deps), { message: USAGE });
});

test("actual CLI exits cleanly for help and fails invalid input without writing files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "accordbridge-cli-"));
  try {
    for (const args of [[], ["nope"], ["--help"]]) {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./testnet.mjs", import.meta.url)), ...args],
        { cwd, encoding: "utf8", timeout: 10000 },
      );
      assert.equal(result.status, args[0] === "--help" ? 0 : 1);
      assert.match(result.stdout + result.stderr, /Usage:/);
      assert.deepEqual(readdirSync(cwd), []);
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("missing WASM, invalid WASM and bad manifests stop before runner, keys or funding", async () => {
  const loadRunner = () => {
    assert.fail("Runner loaded");
  };
  await assert.rejects(
    runCli(["setup"], {
      read: () => {
        throw new Error("synthetic-secret");
      },
      loadRunner,
    }),
    /Missing or unreadable WASM/,
  );
  let reads = 0;
  await assert.rejects(
    runCli(["setup"], {
      read: () => {
        if (++reads === 1) return wasm;
        throw new Error("missing token");
      },
      loadRunner,
    }),
    /accordbridge_test_token.wasm/,
  );
  await assert.rejects(
    runCli(["setup"], { read: () => Buffer.from("not wasm"), loadRunner }),
    /Invalid WASM/,
  );
  for (const read of [
    () => {
      throw new Error();
    },
    () => "not json",
    () => "null",
  ])
    await assert.rejects(
      runCli(["smoke"], { read, loadRunner }),
      /invalid|Invalid/,
    );
  for (const override of [
    { network: "mainnet" },
    { rpc: "https://example.test" },
    { networkPassphrase: S.Networks.PUBLIC },
    { tokenHasMonetaryValue: true },
    { tokenDecimals: 6 },
    { escrowWasmHash: "invalid" },
    { tokenWasmHash: "" },
    { tokenContract: "C".repeat(56) },
  ])
    await assert.rejects(
      runCli(["smoke"], {
        read: () => JSON.stringify({ ...manifest, ...override }),
        loadRunner,
      }),
      /Invalid Testnet manifest/,
    );
});

test("valid setup/smoke pass preloaded inputs once; runner retains Testnet check before filesystem writes", async () => {
  for (const mode of ["setup", "smoke"]) {
    const calls = [];
    await runCli([mode], {
      read: () => (mode === "setup" ? wasm : JSON.stringify(manifest)),
      loadRunner: async () => ({
        runTestnet: async (...args) => calls.push(args),
      }),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], mode);
    assert.deepEqual(
      calls[0][1],
      mode === "setup" ? { escrowWasm: wasm, tokenWasm: wasm } : { manifest },
    );
    const server = {
      httpClient: { defaults: {} },
      getNetwork: async () => ({ passphrase: S.Networks.PUBLIC }),
    };
    const forbidden = () => {
      assert.fail("Filesystem side effect before Testnet check");
    };
    await assert.rejects(
      runTestnet(mode, calls[0][1], {
        createServer: () => server,
        fs: {
          mkdirSync: forbidden,
          existsSync: forbidden,
          readFileSync: forbidden,
          writeFileSync: forbidden,
        },
      }),
      /Testnet required/,
    );
    assert.equal(server.httpClient.defaults.timeout, 15000);
  }
});
