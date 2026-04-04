import { getWalletManager } from "./src/services/wallet-manager.js";

async function main() {
    console.log("Generating secure wallet natively...");
    
    // Use the aibtcdev wallet manager directly
    const wm = getWalletManager();
    const result = await wm.createWallet("myagent", "aibtc-secure-password123", "mainnet");
    
    console.log("\n====== YOUR WALLET DETAILS ======");
    console.log("Name: myagent");
    console.log("Password: aibtc-secure-password123");
    console.log("Network: mainnet");
    console.log("---------------------------------");
    console.log("BTC Address (Native SegWit):", result.btcAddress);
    console.log("BTC Address (Taproot):", result.taprootAddress);
    console.log("STX Address:", result.address);
    console.log("---------------------------------");
    console.log("Mnemonic Phrase (KEEP THIS SECRET):");
    console.log(result.mnemonic);
    console.log("=================================\n");
    
    process.exit(0);
}

main().catch(error => {
    console.error("Failed to generate wallet:", error);
    process.exit(1);
});
