/**
 * Zest v2 Repay Test
 *
 * Tests repay via the ZestProtocolService.
 * Uses managed wallet.
 *
 * Run: npx tsx tests/zest-v2-repay.test.ts [amount] [asset]
 * Default: 1000 sats of sBTC
 */

import "dotenv/config";
import { getZestProtocolService } from "../src/services/defi.service.js";
import { getWalletManager } from "../src/services/wallet-manager.js";

async function getAccountFromWallet() {
  const wm = getWalletManager();
  const wallets = await wm.listWallets();
  if (wallets.length === 0) throw new Error("No wallets found");

  const activeId = await wm.getActiveWalletId();
  if (!activeId) throw new Error("No active wallet");

  const password = process.env.WALLET_PASSWORD || "password123";
  return wm.unlock(activeId, password);
}

async function main() {
  const amount = BigInt(process.argv[2] || "1000");
  const asset = process.argv[3] || "sBTC";

  console.log("=== Zest v2 Repay Test ===");
  console.log(`Asset: ${asset}`);
  console.log(`Amount: ${amount}`);

  const account = await getAccountFromWallet();
  console.log(`Wallet: ${account.address}`);

  const zest = getZestProtocolService("mainnet");
  const position = await zest.getUserPosition(asset, account.address);
  console.log(`\nPosition before: ${JSON.stringify(position)}`);

  console.log(`\nRepaying ${amount} of ${asset}...`);
  try {
    const result = await zest.repay(account, asset, amount);
    console.log(`\nSUCCESS!`);
    console.log(`TxID: ${result.txid}`);
    console.log(`Explorer: https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`);
    process.exit(0);
  } catch (error: any) {
    console.error(`\nFAILED: ${error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
