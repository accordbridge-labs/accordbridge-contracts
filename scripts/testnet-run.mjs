import { beginEvidence } from "./run-evidence.mjs";
import * as S from "@stellar/stellar-sdk";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { ensureAccount, configureTimeout } from "./testnet-account.mjs";

export async function runTestnet(mode, inputs, options = {}) {
  const server = (options.createServer ?? ((url) => new S.rpc.Server(url)))(
    "https://soroban-testnet.stellar.org",
  );
  configureTimeout(server);
  const network = await server.getNetwork();
  if (network.passphrase !== S.Networks.TESTNET)
    throw new Error("Testnet required");
  const evidence = (options.beginEvidence ?? beginEvidence)(mode);
  try {
    const manifest = await executeTestnet(mode, inputs, { ...options, server });
    evidence.complete(manifest);
    console.log("Public run evidence and latest manifest recorded.");
  } catch (error) {
    try {
      evidence.fail();
    } catch {
      /* Keep the original failure; started record remains. */
    }
    throw error;
  }
}

async function executeTestnet(
  mode,
  inputs,
  { server, fs = { mkdirSync, existsSync, readFileSync, writeFileSync } } = {},
) {
  const { mkdirSync, existsSync, readFileSync, writeFileSync } = fs;

  const RPC = "https://soroban-testnet.stellar.org";
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  mkdirSync("deployments", { recursive: true });
  const path = ".local/testnet-fixtures.json";
  if (!existsSync(path))
    writeFileSync(
      path,
      JSON.stringify(
        Object.fromEntries(
          ["deployer", "client", "freelancer", "outsider"].map((name) => [
            name,
            S.Keypair.random().secret(),
          ]),
        ),
      ),
      { mode: 0o600, flag: "wx" },
    );
  const keys = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(path, "utf8"))).map(
      ([name, secret]) => [name, S.Keypair.fromSecret(secret)],
    ),
  );
  async function send(key, operation) {
    const source = await server.getAccount(key.publicKey());
    const raw = new S.TransactionBuilder(source, {
      fee: S.BASE_FEE,
      networkPassphrase: S.Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(120)
      .build();
    const tx = await server.prepareTransaction(raw);
    tx.sign(key);
    const submission = await server.sendTransaction(tx);
    if (submission.status === "ERROR")
      throw new Error("Testnet transaction rejected");
    const hash = Buffer.from(tx.hash()).toString("hex");
    console.log(`Submitted ${hash}`);
    for (let i = 0; i < 45; i++) {
      const result = await server.getTransaction(hash);
      if (result.status === "SUCCESS") return result;
      if (result.status === "FAILED")
        throw Object.assign(new Error(`Testnet transaction failed: ${hash}`), {
          ledgerFailed: true,
          hash,
        });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      `Transaction still unknown; inspect before retrying: ${hash}`,
    );
  }
  const addr = (value) => S.Address.fromString(value).toScVal();
  const invoke = (id, method, ...args) =>
    new S.Contract(id).call(method, ...args);
  async function state(id, source = keys.client.publicKey()) {
    const tx = new S.TransactionBuilder(await server.getAccount(source), {
      fee: S.BASE_FEE,
      networkPassphrase: S.Networks.TESTNET,
    })
      .addOperation(invoke(id, "state"))
      .setTimeout(60)
      .build();
    const result = await server.simulateTransaction(tx);
    if (!S.rpc.Api.isSimulationSuccess(result))
      throw new Error("State query failed");
    return S.scValToNative(result.result.retval);
  }
  if (mode === "setup") {
    await ensureAccount(server, keys.deployer.publicKey());
    const { escrowWasm, tokenWasm } = inputs;
    const escrowHash = createHash("sha256").update(escrowWasm).digest("hex");
    const tokenHash = createHash("sha256").update(tokenWasm).digest("hex");
    const escrowUpload = await send(
      keys.deployer,
      S.Operation.uploadContractWasm({ wasm: escrowWasm }),
    );
    const tokenUpload = await send(
      keys.deployer,
      S.Operation.uploadContractWasm({ wasm: tokenWasm }),
    );
    const deployed = await send(
      keys.deployer,
      S.Operation.createCustomContract({
        address: S.Address.fromString(keys.deployer.publicKey()),
        wasmHash: Buffer.from(tokenHash, "hex"),
        salt: randomBytes(32),
        constructorArgs: [],
      }),
    );
    const tokenContract = S.scValToNative(deployed.returnValue);
    const manifest = {
      network: "testnet",
      networkPassphrase: S.Networks.TESTNET,
      rpc: RPC,
      escrowWasmHash: escrowHash,
      tokenWasmHash: tokenHash,
      tokenContract,
      tokenSymbol: "ABUSD",
      tokenDecimals: 7,
      tokenHasMonetaryValue: false,
      uploadedAt: new Date().toISOString(),
      transactions: {
        escrowUpload: escrowUpload.txHash,
        tokenUpload: tokenUpload.txHash,
        tokenDeployment: deployed.txHash,
      },
    };

    console.log(
      "Testnet setup confirmed. Private fixture keys remain in ignored .local/.",
    );
    return manifest;
  } else if (mode === "smoke") {
    const { manifest } = inputs;
    for (const name of ["client", "freelancer", "outsider"])
      await ensureAccount(server, keys[name].publicKey());
    const terms = randomBytes(32);
    const deployed = await send(
      keys.client,
      S.Operation.createCustomContract({
        address: S.Address.fromString(keys.client.publicKey()),
        wasmHash: Buffer.from(manifest.escrowWasmHash, "hex"),
        salt: randomBytes(32),
        constructorArgs: [
          addr(keys.client.publicKey()),
          addr(keys.freelancer.publicKey()),
          addr(manifest.tokenContract),
          S.nativeToScVal(1500000000n, { type: "i128" }),
          S.nativeToScVal(terms),
        ],
      }),
    );
    const escrow = S.scValToNative(deployed.returnValue);
    const hashes = { deployment: deployed.txHash };
    hashes.faucet = (
      await send(
        keys.client,
        invoke(manifest.tokenContract, "faucet", addr(keys.client.publicKey())),
      )
    ).txHash;
    hashes.clientAcceptance = (
      await send(
        keys.client,
        invoke(
          escrow,
          "accept",
          addr(keys.client.publicKey()),
          S.nativeToScVal(terms),
        ),
      )
    ).txHash;
    hashes.freelancerAcceptance = (
      await send(
        keys.freelancer,
        invoke(
          escrow,
          "accept",
          addr(keys.freelancer.publicKey()),
          S.nativeToScVal(terms),
        ),
      )
    ).txHash;
    hashes.funding = (await send(keys.client, invoke(escrow, "fund"))).txHash;
    if ((await state(escrow)).status !== 1)
      throw new Error("Funding did not reconcile");
    // An outsider's source-account signature does not satisfy the client's authorization.
    let rejected = false;
    try {
      await send(keys.outsider, invoke(escrow, "release"));
    } catch (error) {
      if (!error.ledgerFailed) throw error;
      rejected = true;
      hashes.unauthorizedRelease = error.hash;
    }
    if (!rejected || (await state(escrow)).status !== 1)
      throw new Error("Unauthorized release was not blocked");
    hashes.release = (
      await send(keys.client, invoke(escrow, "release"))
    ).txHash;
    if ((await state(escrow)).status !== 2)
      throw new Error("Release did not reconcile");
    return {
      network: "testnet",
      escrow,
      escrowWasmHash: manifest.escrowWasmHash,
      tokenWasmHash: manifest.tokenWasmHash,
      tokenContract: manifest.tokenContract,
      client: keys.client.publicKey(),
      freelancer: keys.freelancer.publicKey(),
      termsHash: terms.toString("hex"),
      amountBaseUnits: "1500000000",
      unauthorizedReleaseRejected: true,
      finalStatus: "released",
      transactions: hashes,
      checkedAt: new Date().toISOString(),
    };
  } else {
    throw new Error("Use setup or smoke");
  }
}
