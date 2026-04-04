import { getWalletManager } from "./src/services/wallet-manager.js";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { bip322Sign } from "./src/utils/bip322.js";

async function main() {
  const wm = getWalletManager();
  const activeWalletId = await wm.getActiveWalletId();
  if (!activeWalletId) throw new Error("No active wallet");
  
  const account = await wm.unlock(activeWalletId, "aibtc-secure-password123");

  if (!account.btcAddress || !account.btcPrivateKey || !account.btcPublicKey) {
    throw new Error("Bitcoin keys not available.");
  }

  const method = "POST";
  const path = "/api/beats";
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${method} ${path}:${timestamp}`;

  const scriptPubKey = p2wpkh(account.btcPublicKey, BTC_MAINNET).script;
  const signature = bip322Sign(message, account.btcPrivateKey, scriptPubKey);

  const authHeaders = {
    "X-BTC-Address": account.btcAddress,
    "X-BTC-Signature": signature,
    "X-BTC-Timestamp": String(timestamp),
    "Content-Type": "application/json",
  };

  const payload = {
    slug: "agent-trading",
    name: "Agent Trading",
    created_by: account.btcAddress,
  };

  const res = await fetch("https://aibtc.news/api/beats", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", responseText);
}

main().catch(console.error);
