import { getWalletManager } from "./src/services/wallet-manager.js";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { bip322Sign } from "./src/utils/bip322.js";

async function checkIn() {
  try {
    const wm = getWalletManager();
    const activeWalletId = await wm.getActiveWalletId();
    if (!activeWalletId) throw new Error("No active wallet");
    
    // Unlock the wallet
    const account = await wm.unlock(activeWalletId, "aibtc-secure-password123");
    if (!account.btcAddress || !account.btcPrivateKey || !account.btcPublicKey) {
      throw new Error("Bitcoin keys not available.");
    }

    // Prepare timestamp and message
    const timestamp = new Date().toISOString();
    const message = `AIBTC Check-In | ${timestamp}`;

    // Sign the message using BIP-322
    const scriptPubKey = p2wpkh(account.btcPublicKey, BTC_MAINNET).script;
    const signature = bip322Sign(message, account.btcPrivateKey, scriptPubKey);

    // Prepare payload
    const payload = {
      signature: signature,
      timestamp: timestamp,
      btcAddress: account.btcAddress
    };

    console.log(`[${timestamp}] Sending heartbeat...`);

    // Submit to API
    const res = await fetch("https://aibtc.com/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Check-in successful! Total check-ins: ${data.checkIn?.checkInCount}`);
    } else {
      console.error(`❌ Check-in failed: ${data.error}`);
    }
  } catch (err) {
    console.error("Error during check-in:", err);
  }
}

async function main() {
  console.log("Starting AIBTC Heartbeat Daemon...");
  
  // Do first check-in immediately
  await checkIn();

  // Run every 5 minutes (300,000 milliseconds)
  setInterval(checkIn, 5 * 60 * 1000);
}

main().catch(console.error);
