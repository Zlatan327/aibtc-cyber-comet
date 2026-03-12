/**
 * Zest v2 Withdraw Test
 *
 * Tests collateral-remove-redeem via the ZestProtocolService.
 * Uses managed wallet.
 *
 * Run: npx tsx tests/zest-v2-withdraw.test.ts [amount-shares] [asset]
 * Default: 999 shares sBTC
 */

import "dotenv/config";
import { getZestProtocolService } from "../src/services/defi.service.js";
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
  const amountShares = BigInt(process.argv[2] || "999");
  const asset = process.argv[3] || "sBTC";

  console.log("=== Zest v2 Withdraw Test ===");
  console.log(`Asset: ${asset}`);
  console.log(`Amount (shares): ${amountShares}`);

  const account = await getAccountFromWallet();
  console.log(`Wallet: ${account.address}`);

  const balanceBefore = await getSbtcBalance(account.address, "mainnet");
  console.log(`\nsBTC balance before: ${balanceBefore} sats`);

  const zest = getZestProtocolService("mainnet");

  console.log(`\nWithdrawing ${amountShares} shares from Zest v2...`);
  try {
    const result = await zest.withdraw(account, asset, amountShares);
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
