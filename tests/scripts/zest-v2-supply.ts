/**
 * Zest v2 Supply Test
 *
 * Tests supply-collateral-add via the ZestProtocolService.
 * Uses managed wallet (unlocked with password from WALLET_PASSWORD env or arg).
 *
 * Run: npx tsx tests/zest-v2-supply.test.ts [amount-sats] [asset]
 * Env: WALLET_PASSWORD=password123
 * Default: 1000 sats sBTC
 */

import "dotenv/config";
import { getZestProtocolService } from "../src/services/defi.service.js";
import { ZEST_ASSETS } from "../src/config/contracts.js";
import { getSbtcBalance } from "../src/utils/index.js";
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
  const amountSats = BigInt(process.argv[2] || "1000");
  const asset = process.argv[3] || "sBTC";

  console.log("=== Zest v2 Supply Test ===");
  console.log(`Asset: ${asset}`);
  console.log(`Amount: ${amountSats} sats`);

  // Unlock wallet
  const account = await getAccountFromWallet();
  console.log(`Wallet: ${account.address}`);

  // Check balance before
  const balanceBefore = await getSbtcBalance(account.address, "mainnet");
  console.log(`\nsBTC balance before: ${balanceBefore} sats`);

  if (balanceBefore < amountSats) {
    console.error(`ERROR: Insufficient balance. Have ${balanceBefore}, need ${amountSats}`);
    process.exit(1);
  }

  // Execute supply
  const zest = getZestProtocolService("mainnet");
  const assetConfig = ZEST_ASSETS[asset] || ZEST_ASSETS.sBTC;
  console.log(`Vault: ${assetConfig.vault}`);

  console.log(`\nSupplying ${amountSats} sats to Zest v2...`);
  try {
    const result = await zest.supply(account, asset, amountSats);
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
