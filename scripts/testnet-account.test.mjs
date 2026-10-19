import assert from "node:assert/strict";
import test from "node:test";
import * as S from "@stellar/stellar-sdk";
import { ensureAccount } from "./testnet-account.mjs";

const address = S.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const key = S.xdr.LedgerKey.account(
  new S.xdr.LedgerKeyAccount({
    accountId: S.Keypair.fromPublicKey(address).xdrPublicKey(),
  }),
);
const entry = new S.xdr.AccountEntry({
  accountId: S.Keypair.fromPublicKey(address).xdrPublicKey(),
  balance: 100n,
  seqNum: 1n,
  numSubEntries: 0,
  inflationDest: null,
  flags: 0,
  homeDomain: "",
  thresholds: Buffer.alloc(4),
  signers: [],
  ext: S.xdr.AccountEntryExt.v0(),
});
const existing = {
  key: key.toXdr("base64"),
  xdr: S.xdr.LedgerEntryData.account(entry).toXdr("base64"),
  lastModifiedLedgerSeq: 1,
};
const reply = (entries) => ({
  status: 200,
  data: { jsonrpc: "2.0", id: 1, result: { entries, latestLedger: 100 } },
});
const server = (post) => ({
  serverURL: new URL("https://soroban-testnet.stellar.org"),
  httpClient: { post },
});

test("existing account never calls Friendbot; only explicit missing result permits one call", async () => {
  let funding = 0;
  for (const entries of [[existing], []]) {
    await ensureAccount(
      server(async (_url, request, config) => {
        assert.equal(config.timeout, 15000);
        assert.equal(request.method, "getLedgerEntries");
        assert.deepEqual(request.params.keys, [key.toXdr("base64")]);
        return reply(entries);
      }),
      address,
      {
        fetchImpl: async (url, options) => {
          funding++;
          assert.equal(url, `https://friendbot.stellar.org?addr=${address}`);
          assert.ok(options.signal instanceof AbortSignal);
          assert.equal(options.redirect, "error");
          return new Response("{}");
        },
      },
    );
    assert.equal(funding, entries.length ? 0 : 1);
  }
});

test("transport, rate limits, timeouts and malformed RPC data never fund or expose raw errors", async () => {
  for (const post of [
    async () => {
      throw new Error("synthetic-secret timeout");
    },
    async () => {
      throw { status: 429, body: "synthetic-secret" };
    },
    async () => ({ status: 429, data: { error: "synthetic-secret" } }),
    async () => ({
      status: 200,
      data: { jsonrpc: "2.0", id: 1, error: { message: "synthetic-secret" } },
    }),
    ...[
      undefined,
      {},
      { latestLedger: 1 },
      { entries: [] },
      { latestLedger: 1, entries: null },
      { latestLedger: "1", entries: [] },
    ].map((result) => async () => ({
      status: 200,
      data: { jsonrpc: "2.0", id: 1, result },
    })),
    async () => reply([{ key: existing.key, xdr: "malformed" }]),
    async () => reply([{ ...existing, key: "wrong-key" }]),
    async () => reply([existing, existing]),
    async () => ({ ...reply([]), data: { ...reply([]).data, id: 2 } }),
  ]) {
    await assert.rejects(
      ensureAccount(server(post), address, {
        fetchImpl: () => {
          assert.fail("Unexpected funding");
        },
      }),
      (error) => {
        assert.match(error.message, /Account lookup failed/);
        assert.ok(!error.message.includes("synthetic-secret"));
        return true;
      },
    );
  }
});

test("Friendbot HTTP failure, transport failure and timeout remain uncertain and are not retried", async () => {
  for (const kind of ["http", "transport", "timeout"]) {
    let calls = 0;
    // Keep the test event loop alive while AbortSignal's unref'ed timer fires.
    const keepAlive = setInterval(() => {}, 1000);
    try {
      await assert.rejects(
        ensureAccount(
          server(async () => reply([])),
          address,
          {
            timeoutMs: 10,
            fetchImpl: async (_url, { signal }) => {
              calls++;
              if (kind === "http")
                return new Response("synthetic-secret", { status: 429 });
              if (kind === "transport") throw new Error("synthetic-secret");
              await new Promise((_, reject) =>
                signal.addEventListener("abort", () => reject(signal.reason), {
                  once: true,
                }),
              );
            },
          },
        ),
        /Friendbot funding was not confirmed/,
      );
      assert.equal(calls, 1);
    } finally {
      clearInterval(keepAlive);
    }
  }
});
