import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginEvidence } from "./run-evidence.mjs";
import { runTestnet } from "./testnet-run.mjs";

const hash = "a".repeat(64);
const manifest = {
  network: "testnet",
  escrowWasmHash: hash,
  tokenWasmHash: hash,
  tokenContract: "public-contract",
  secret: "NEVER-PERSIST",
  envelope: "NEVER-PERSIST",
  transactions: {
    escrowUpload: hash,
    tokenUpload: hash,
    tokenDeployment: hash,
    signedEnvelope: "NEVER-PERSIST",
  },
};
function fixture(t) {
  const directory = fs.mkdtempSync(join(tmpdir(), "accordbridge-evidence-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    source: { revision: "b".repeat(40), dirty: false },
    now: () => "2026-10-21T10:00:00.000Z",
  };
}
test("repeated runs preserve immutable history, hashes, revision and compatible latest", (t) => {
  const options = fixture(t);
  beginEvidence("setup", options).complete(manifest);
  const first = fs.readFileSync(
    join(options.directory, "testnet.json"),
    "utf8",
  );
  beginEvidence("setup", options).complete(manifest);
  const files = fs.readdirSync(join(options.directory, "runs"));
  assert.equal(files.length, 4);
  const latest = JSON.parse(
    fs.readFileSync(join(options.directory, "testnet.json"), "utf8"),
  );
  assert.notEqual(latest.runId, JSON.parse(first).runId);
  assert.equal(latest.sourceRevision, options.source.revision);
  assert.equal(latest.escrowWasmHash, hash);
  assert.equal(latest.tokenWasmHash, hash);
  for (const file of files)
    assert.equal(
      fs
        .readFileSync(join(options.directory, "runs", file), "utf8")
        .includes("NEVER-PERSIST"),
      false,
    );
  assert.equal(JSON.stringify(latest).includes("NEVER-PERSIST"), false);
});
test("colliding record identity is rejected without overwriting history", (t) => {
  const options = { ...fixture(t), uuid: () => "same" };
  beginEvidence("setup", options).complete(manifest);
  const before = fs.readFileSync(
    join(options.directory, "testnet.json"),
    "utf8",
  );
  assert.throws(() => beginEvidence("setup", options), { code: "EEXIST" });
  assert.equal(
    fs.readFileSync(join(options.directory, "testnet.json"), "utf8"),
    before,
  );
});
for (const stage of ["record", "temporary", "rename"]) {
  test(`failed ${stage} write preserves latest and never overwrites existing records`, (t) => {
    const options = fixture(t);
    beginEvidence("setup", options).complete(manifest);
    const latest = join(options.directory, "testnet.json");
    const before = fs.readFileSync(latest, "utf8");
    const faulty = {
      ...fs,
      writeFileSync(path, ...args) {
        if (
          (stage === "record" && path.endsWith(".completed.json")) ||
          (stage === "temporary" && path.endsWith(".tmp"))
        )
          throw new Error("disk failure");
        return fs.writeFileSync(path, ...args);
      },
      renameSync(...args) {
        if (stage === "rename") throw new Error("disk failure");
        return fs.renameSync(...args);
      },
    };
    const run = beginEvidence("setup", { ...options, fs: faulty });
    assert.throws(() => run.complete(manifest));
    run.fail();
    assert.equal(fs.readFileSync(latest, "utf8"), before);
    assert.equal(
      fs.readdirSync(options.directory).some((file) => file.endsWith(".tmp")),
      false,
    );
  });
}
test("failed stage leaves only started/incomplete and does not advance latest", async (t) => {
  const options = fixture(t);
  await assert.rejects(
    runTestnet(
      "setup",
      {},
      {
        beginEvidence: (mode) => beginEvidence(mode, options),
        createServer: () => ({
          httpClient: { defaults: {} },
          getNetwork: async () => ({
            passphrase: "Test SDF Network ; September 2015",
          }),
        }),
        fs: {
          mkdirSync() {
            throw new Error("synthetic private fixture write failure");
          },
        },
      },
    ),
  );
  const files = fs.readdirSync(join(options.directory, "runs"));
  assert.equal(files.length, 2);
  assert.ok(files.some((file) => file.endsWith(".incomplete.json")));
  assert.equal(fs.existsSync(join(options.directory, "testnet.json")), false);
});
test("smoke updates only its own latest and includes both build hashes", (t) => {
  const options = fixture(t);
  beginEvidence("setup", options).complete(manifest);
  const before = fs.readFileSync(
    join(options.directory, "testnet.json"),
    "utf8",
  );
  beginEvidence("smoke", options).complete({
    ...manifest,
    finalStatus: "released",
    transactions: Object.fromEntries(
      [
        "deployment",
        "faucet",
        "clientAcceptance",
        "freelancerAcceptance",
        "funding",
        "unauthorizedRelease",
        "release",
      ].map((key) => [key, hash]),
    ),
  });
  const smoke = JSON.parse(
    fs.readFileSync(join(options.directory, "smoke-testnet.json"), "utf8"),
  );
  assert.equal(smoke.tokenWasmHash, hash);
  assert.equal(smoke.finalStatus, "released");
  assert.equal(
    fs.readFileSync(join(options.directory, "testnet.json"), "utf8"),
    before,
  );
});
