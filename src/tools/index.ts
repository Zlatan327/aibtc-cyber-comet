import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerWalletTools } from "./wallet.tools.js";
import { registerWalletManagementTools } from "./wallet-management.tools.js";
import { registerTransferTools } from "./transfer.tools.js";
import { registerContractTools } from "./contract.tools.js";
import { registerSbtcTools } from "./sbtc.tools.js";
import { registerTokenTools } from "./tokens.tools.js";
import { registerNftTools } from "./nft.tools.js";
import { registerStackingTools } from "./stacking.tools.js";
import { registerBnsTools } from "./bns.tools.js";
import { registerQueryTools } from "./query.tools.js";
import { registerEndpointTools } from "./endpoint.tools.js";
import { registerDefiTools } from "./defi.tools.js";

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(server: McpServer): void {
  // Wallet & Balance
  registerWalletTools(server);

  // Wallet Management (create, import, unlock, lock, etc.)
  registerWalletManagementTools(server);

  // Transfers
  registerTransferTools(server);

  // Smart Contracts
  registerContractTools(server);

  // sBTC
  registerSbtcTools(server);

  // Tokens (SIP-010)
  registerTokenTools(server);

  // NFTs (SIP-009)
  registerNftTools(server);

  // Stacking / PoX
  registerStackingTools(server);

  // BNS Domains
  registerBnsTools(server);

  // Blockchain Queries
  registerQueryTools(server);

  // x402 Endpoints
  registerEndpointTools(server);

  // DeFi (ALEX DEX, Zest Protocol)
  registerDefiTools(server);
}
