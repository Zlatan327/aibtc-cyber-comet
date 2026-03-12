/**
 * Zest v2 Borrow Test
 *
 * Tests borrow via the ZestProtocolService.
 * Uses managed wallet. User must have existing collateral to borrow against.
 *
 * Run: npx tsx tests/zest-v2-borrow.test.ts [amount] [asset]
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

  console.log("=== Zest v2 Borrow Test ===");
  console.log(`Asset: ${asset}`);
  console.log(`Amount: ${amount}`);

  const account = await getAccountFromWallet();
  console.log(`Wallet: ${account.address}`);

  const zest = getZestProtocolService("mainnet");
  const position = await zest.getUserPosition(asset, account.address);
  console.log(`\nPosition before: ${JSON.stringify(position)}`);

  if (!position || position.suppliedShares === "0") {
    console.error("\nWARNING: No collateral detected. Borrow will likely fail.");
    console.error("Supply collateral first: npx tsx tests/zest-v2-supply.test.ts <amount>");
  }

  console.log(`\nBorrowing ${amount} of ${asset} from Zest v2...`);
  try {
    const result = await zest.borrow(account, asset, amount);
    console.log(`\nSUCCESS!`);
    console.log(`TxID: ${result.txid}`);
    console.log(`Explorer: https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`);
    process.exit(0);
  } catch (error: any) {
    console.error(`\nFAILED: ${error.message}`);
    if (error.message.includes("health")) {
      console.error("Health factor too low - need more collateral");
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
