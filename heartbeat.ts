/**
 * AIBTC Heartbeat Daemon
 *
 * Stateless heartbeat that derives Bitcoin keys directly from CLIENT_MNEMONIC.
 * This works on ephemeral cloud containers (Render, Railway, etc.) that have no
 * persistent filesystem — no wallet keystore required.
 *
 * Runs every 5 minutes and signs a BIP-322 check-in with your BTC identity.
 */
import "dotenv/config";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { deriveBitcoinKeyPair } from "./src/utils/bitcoin.js";
import { bip322Sign } from "./src/utils/bip322.js";

const MNEMONIC = process.env.CLIENT_MNEMONIC?.trim();
const NETWORK = (process.env.NETWORK as "mainnet" | "testnet") || "mainnet";

if (!MNEMONIC) {
  console.error("❌ [heartbeat] CLIENT_MNEMONIC environment variable is not set. Exiting.");
  process.exit(1);
}

// Derive Bitcoin key pair once at startup (stateless, no keystore needed)
const { address: btcAddress, privateKey: btcPrivateKey, publicKeyBytes: btcPublicKey } =
  deriveBitcoinKeyPair(MNEMONIC, NETWORK);

console.log(`[heartbeat] Derived BTC address: ${btcAddress}`);

async function checkIn() {
  try {
    const timestamp = new Date().toISOString();
    const message = `AIBTC Check-In | ${timestamp}`;

    // Sign with BIP-322 (P2WPKH)
    const scriptPubKey = p2wpkh(btcPublicKey, BTC_MAINNET).script;
    const signature = bip322Sign(message, btcPrivateKey, scriptPubKey);

    const payload = {
      signature,
      timestamp,
      btcAddress,
    };

    console.log(`[heartbeat] Sending check-in at ${timestamp}...`);

    const res = await fetch("https://aibtc.com/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ [heartbeat] Check-in successful! Total: ${data.checkIn?.checkInCount ?? "?"}`);
    } else {
      console.error(`❌ [heartbeat] Check-in rejected (${res.status}): ${data.error ?? JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error("[heartbeat] Error during check-in:", err);
  }
}

async function main() {
  console.log("Starting AIBTC Heartbeat Daemon...");

  // Initial check-in on startup
  await checkIn();

  // Recurring check-in every 5 minutes
  setInterval(checkIn, 5 * 60 * 1000);
}

main().catch(console.error);
