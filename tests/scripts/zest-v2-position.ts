/**
 * Zest v2 Position Test
 *
 * Tests getUserPosition and getUserSupplies via the ZestProtocolService.
 * Uses managed wallet.
 *
 * Run: npx tsx tests/zest-v2-position.test.ts [asset]
 * Default: sBTC
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
  const asset = process.argv[2] || "sBTC";

  console.log("=== Zest v2 Position Test ===");
  console.log(`Asset: ${asset}`);

  const account = await getAccountFromWallet();
  console.log(`Wallet: ${account.address}`);

  const zest = getZestProtocolService("mainnet");

  // Test getUserPosition
  console.log(`\n--- getUserPosition(${asset}) ---`);
  const position = await zest.getUserPosition(asset, account.address);
  if (position) {
    console.log(`  Supplied (shares): ${position.suppliedShares}`);
    console.log(`  Borrowed: ${position.borrowed}`);
    console.log(`  Health Factor: ${position.healthFactor}`);
  } else {
    console.log("  No position found");
  }

  // Test getUserSupplies
  console.log(`\n--- getUserSupplies() ---`);
  const supplies = await zest.getUserSupplies(account.address);
  if (supplies) {
    console.log(JSON.stringify(supplies, null, 2));
  } else {
    console.log("  No supplies data");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
