import { getWalletManager } from "./src/services/wallet-manager.js";
import { signMessageHashRsv } from "@stacks/transactions";
import { p2wpkh, NETWORK } from "@scure/btc-signer";
import { bip322Sign } from "./src/utils/bip322.js";
import { hashMessage } from "@stacks/encryption";
import { bytesToHex } from "@stacks/common";

async function main() {
    const wm = getWalletManager();
    const activeWalletId = await wm.getActiveWalletId();
    if (!activeWalletId) throw new Error("No active wallet");
    
    const account = await wm.unlock(activeWalletId, "aibtc-secure-password123");

    const message = "Bitcoin will be the currency of AIs";

    // Hash the message with the Stacks prefix
    const msgHash = hashMessage(message);
    const msgHashHex = bytesToHex(msgHash);

    // Stacks Sign
    const stxSignature = signMessageHashRsv({
        messageHash: msgHashHex,
        privateKey: account.privateKey
    });

    // Native Segwit (P2WPKH) scriptPubKey calculation
    const scriptPubKey = p2wpkh(account.btcPublicKey!, NETWORK).script;
    
    // BTC Sign
    const btcSignature = bip322Sign(message, account.btcPrivateKey!, scriptPubKey);

    console.log("STX Sig: 0x" + stxSignature);
    console.log("BTC Sig:", btcSignature);
}

main().catch(console.error);
