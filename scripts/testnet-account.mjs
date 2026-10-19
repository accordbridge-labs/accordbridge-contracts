import * as S from "@stellar/stellar-sdk";

export const REQUEST_TIMEOUT_MS = 15000;
export function configureTimeout(server) {
  // SDK 17.2.1 ignores Server's timeout option; set its HTTP client's default explicitly.
  server.httpClient.defaults.timeout = REQUEST_TIMEOUT_MS;
}

export async function ensureAccount(
  server,
  address,
  { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const key = S.xdr.LedgerKey.account(
    new S.xdr.LedgerKeyAccount({
      accountId: S.Keypair.fromPublicKey(address).xdrPublicKey(),
    }),
  );
  let result;
  try {
    // getAccount() catches transport/parse failures and rethrows "Account not found".
    // Use the public HTTP client to validate the raw result: the SDK parser also
    // normalizes missing entries to [], which must not count as confirmed absence.
    const response = await server.httpClient.post(
      server.serverURL.toString(),
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getLedgerEntries",
        params: { keys: [key.toXdr("base64")] },
      },
      { timeout: timeoutMs },
    );
    if (
      response.status !== 200 ||
      response.data?.error ||
      response.data?.jsonrpc !== "2.0" ||
      response.data?.id !== 1
    )
      throw new Error();
    result = response.data.result;
    if (
      !Number.isSafeInteger(result?.latestLedger) ||
      result.latestLedger <= 0 ||
      !Array.isArray(result.entries) ||
      result.entries.length > 1
    )
      throw new Error();
    if (result.entries.length === 1) {
      const entry = result.entries[0];
      if (entry.key !== key.toXdr("base64")) throw new Error();
      const value = S.xdr.LedgerEntryData.fromXdr(entry.xdr, "base64");
      if (
        value.type !== "account" ||
        S.StrKey.encodeEd25519PublicKey(
          value.value.accountId.ed25519.toBytes(),
        ) !== address
      )
        throw new Error();
      return;
    }
  } catch {
    throw new Error(
      "Account lookup failed or returned invalid data; no Friendbot request was made. Check Testnet RPC availability before retrying.",
    );
  }
  try {
    const response = await fetchImpl(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      },
    );
    // Do not log the response or carry an unconsumed body/connection forward.
    await response.body?.cancel();
    if (!response.ok) throw new Error();
  } catch {
    throw new Error(
      "Friendbot funding was not confirmed. Check the public account before retrying; the request may have completed.",
    );
  }
}
