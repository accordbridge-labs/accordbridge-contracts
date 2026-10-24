import * as filesystem from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

export function sourceIdentity() {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!/^[a-f0-9]{40,64}$/.test(revision))
    throw new Error("Invalid source revision");
  const dirty =
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim() !== "";
  return { revision, dirty };
}

// Explicitly project public fields; never serialize SDK results, errors, or keys.
export function publicManifest(mode, value) {
  const fields =
    mode === "setup"
      ? [
          "network",
          "networkPassphrase",
          "rpc",
          "escrowWasmHash",
          "tokenWasmHash",
          "tokenContract",
          "tokenSymbol",
          "tokenDecimals",
          "tokenHasMonetaryValue",
          "uploadedAt",
        ]
      : [
          "network",
          "escrow",
          "escrowWasmHash",
          "tokenWasmHash",
          "tokenContract",
          "client",
          "freelancer",
          "termsHash",
          "amountBaseUnits",
          "unauthorizedReleaseRejected",
          "finalStatus",
          "checkedAt",
        ];
  const result = Object.fromEntries(
    fields.map((field) => [field, value[field]]),
  );
  const hashes =
    mode === "setup"
      ? ["escrowUpload", "tokenUpload", "tokenDeployment"]
      : [
          "deployment",
          "faucet",
          "clientAcceptance",
          "freelancerAcceptance",
          "funding",
          "unauthorizedRelease",
          "release",
        ];
  result.transactions = Object.fromEntries(
    hashes.map((name) => {
      const hash = value.transactions?.[name];
      if (!/^[a-f0-9]{64}$/.test(hash ?? ""))
        throw new Error("Invalid public transaction hash");
      return [name, hash];
    }),
  );
  return result;
}

export function beginEvidence(
  mode,
  {
    directory = "deployments",
    fs = filesystem,
    source = sourceIdentity(),
    now = () => new Date().toISOString(),
    uuid = randomUUID,
  } = {},
) {
  if (!["setup", "smoke"].includes(mode))
    throw new Error("Invalid evidence stage");
  const startedAt = now();
  const runId = `${startedAt.replaceAll(":", "-")}-${uuid()}`;
  const runs = join(directory, "runs");
  fs.mkdirSync(runs, { recursive: true });
  const metadata = {
    runId,
    mode,
    startedAt,
    sourceRevision: source.revision,
    sourceDirty: source.dirty,
  };
  const writeRecord = (status, extra = {}) =>
    fs.writeFileSync(
      join(runs, `${runId}.${status}.json`),
      JSON.stringify({ ...metadata, status, ...extra }, null, 2) + "\n",
      { flag: "wx" },
    );
  writeRecord("started"); // Fail before any chain operations if evidence cannot be started.
  return {
    complete(value) {
      const manifest = {
        ...publicManifest(mode, value),
        ...metadata,
        completedAt: now(),
      };
      writeRecord("completed", { manifest });
      const latest = join(
        directory,
        mode === "setup" ? "testnet.json" : "smoke-testnet.json",
      );
      const temporary = join(directory, `.${runId}.tmp`);
      try {
        fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", {
          flag: "wx",
        });
        fs.renameSync(temporary, latest);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
    fail() {
      // No error text or envelope is persisted. On-chain effects may have occurred.
      writeRecord("incomplete", {
        stoppedAt: now(),
        outcome: "Inspect public chain state before retrying",
      });
    },
  };
}
