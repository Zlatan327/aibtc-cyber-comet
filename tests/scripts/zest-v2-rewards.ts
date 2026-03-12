/**
 * Zest v2 Rewards/Yield Check
 *
 * In Zest v2, rewards are embedded in the zToken exchange rate.
 * There's no separate claim - yield accrues automatically as the
 * zToken becomes worth more underlying over time.
 *
 * This test shows:
 * - Current zToken balances (vault shares)
 * - What those shares are worth in underlying (includes accrued yield)
 * - Current interest rates and utilization per vault
 * - Full position data (collateral, debt, health factor)
 *
 * Run: npx tsx tests/zest-v2-rewards.test.ts [address]
 * Uses CLIENT_MNEMONIC wallet if no address provided.
 */

import { principalCV, uintCV, cvToJSON, hexToCV, cvToHex } from "@stacks/transactions";
import { ZEST_ASSETS, ZEST_V2_DEPLOYER } from "../src/config/contracts.js";

const API = process.env.API_URL || "https://api.mainnet.hiro.so";

async function callReadOnly(
  contract: string,
  fn: string,
  args: any[] = [],
  sender: string
): Promise<any> {
  const [addr, name] = contract.split(".");
  const url = `${API}/v2/contracts/call-read/${addr}/${name}/${fn}`;
  const body = {
    sender,
    arguments: args.map((a: any) => cvToHex(a)),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatAmount(amount: string | bigint, decimals: number): string {
  const val = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = val / divisor;
  const frac = val % divisor;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

async function main() {
  // Get address from arg, env wallet, or default
  let address = process.argv[2];
  if (!address) {
    try {
      const { getAccount } = await import("../src/services/x402.service.js");
      const account = await getAccount();
      address = account.address;
    } catch {
      console.error("No address provided and no wallet available.");
      console.error("Usage: npx tsx tests/zest-v2-rewards.test.ts <stacks-address>");
      process.exit(1);
    }
  }

  console.log("=== Zest v2 Yield / Rewards Check ===");
  console.log(`Address: ${address}`);
  console.log(`\nNote: In v2, yield accrues via zToken exchange rate.`);
  console.log(`No separate claim needed - withdraw to realize gains.\n`);

  // Check each vault
  console.log("--- Per-Vault Status ---\n");
  console.log(
    "Asset".padEnd(10) +
    "zBalance".padEnd(18) +
    "Underlying".padEnd(18) +
    "Yield".padEnd(12) +
    "Rate".padEnd(10) +
    "Util"
  );
  console.log("-".repeat(78));

  for (const [symbol, config] of Object.entries(ZEST_ASSETS)) {
    try {
      // Get zToken balance
      const balResult = await callReadOnly(config.vault, "get-balance", [principalCV(address)], address);
      const balDecoded = cvToJSON(hexToCV(balResult.result));
      const zBalance = BigInt(balDecoded?.value?.value ?? balDecoded?.value ?? "0");

      // Get underlying value of those shares
      let underlying = 0n;
      if (zBalance > 0n) {
        const convResult = await callReadOnly(config.vault, "convert-to-assets", [uintCV(zBalance)], address);
        const convDecoded = cvToJSON(hexToCV(convResult.result));
        underlying = BigInt(convDecoded?.value?.value ?? convDecoded?.value ?? "0");
      }

      // Yield = underlying - zBalance (since shares were minted 1:~1 at deposit time)
      // This is approximate - actual yield depends on when the deposit was made
      const yield_ = underlying > zBalance ? underlying - zBalance : 0n;

      // Get interest rate
      const rateResult = await callReadOnly(config.vault, "get-interest-rate", [], address);
      const rateDecoded = cvToJSON(hexToCV(rateResult.result));
      const rate = rateDecoded?.value?.value ?? rateDecoded?.value ?? "0";

      // Get utilization
      const utilResult = await callReadOnly(config.vault, "get-utilization", [], address);
      const utilDecoded = cvToJSON(hexToCV(utilResult.result));
      const util = utilDecoded?.value?.value ?? utilDecoded?.value ?? "0";

      const zBalStr = zBalance > 0n ? formatAmount(zBalance, config.decimals) : "0";
      const underStr = underlying > 0n ? formatAmount(underlying, config.decimals) : "0";
      const yieldStr = yield_ > 0n ? `+${formatAmount(yield_, config.decimals)}` : "-";

      console.log(
        symbol.padEnd(10) +
        zBalStr.padEnd(18) +
        underStr.padEnd(18) +
        yieldStr.padEnd(12) +
        rate.toString().padEnd(10) +
        util.toString()
      );
    } catch (e: any) {
      console.log(`${symbol.padEnd(10)}ERROR: ${e.message}`);
    }
  }

  // Get full position from data helper
  console.log("\n--- Full Position (Data Helper) ---\n");
  try {
    const dataContract = `${ZEST_V2_DEPLOYER}.v0-1-data`;
    const result = await callReadOnly(dataContract, "get-user-position", [principalCV(address)], address);
    const decoded = cvToJSON(hexToCV(result.result));

    if (decoded?.success === false) {
      console.log("No active position on Zest v2.");
    } else if (decoded?.value) {
      console.log(JSON.stringify(decoded.value, null, 2));
    } else {
      console.log("Could not parse position data");
      console.log(JSON.stringify(decoded, null, 2));
    }
  } catch (e: any) {
    console.log(`Error fetching position: ${e.message}`);
  }

  // Show exchange rates for reference
  console.log("\n--- Exchange Rates (1e8 units) ---\n");
  for (const [symbol, config] of Object.entries(ZEST_ASSETS)) {
    try {
      const toShares = await callReadOnly(config.vault, "convert-to-shares", [uintCV(100000000n)], address);
      const toAssets = await callReadOnly(config.vault, "convert-to-assets", [uintCV(100000000n)], address);
      const shares = cvToJSON(hexToCV(toShares.result))?.value?.value ?? cvToJSON(hexToCV(toShares.result))?.value;
      const assets = cvToJSON(hexToCV(toAssets.result))?.value?.value ?? cvToJSON(hexToCV(toAssets.result))?.value;
      console.log(`${symbol}: 1e8 underlying = ${shares} shares | 1e8 shares = ${assets} underlying`);
    } catch {
      // skip
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
