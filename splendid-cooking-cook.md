# stx402-agent Feature Enhancement Plan

## Overview

Add comprehensive Stacks blockchain tools including sBTC, USDCx, DeFi protocols, NFTs, stacking, and BNS domains while improving code organization. Current security model (mnemonic in env vars, local signing) is maintained as Claude runs on user's PC.

---

## Part 1: New Folder Structure

```
stx402-agent/
├── src/
│   ├── index.ts                    # MCP server entry point (simplified)
│   │
│   ├── config/
│   │   ├── index.ts                # Configuration exports
│   │   ├── networks.ts             # Network configurations
│   │   └── contracts.ts            # Known contract addresses (sBTC, USDCx, etc.)
│   │
│   ├── tools/                      # MCP Tool definitions (organized by category)
│   │   ├── index.ts                # Tool registry - registers all tools
│   │   ├── wallet.tools.ts         # get_wallet_info, get_stx_balance
│   │   ├── transfer.tools.ts       # transfer_stx, prepare_stx_transfer
│   │   ├── contract.tools.ts       # call_contract, deploy_contract, read_contract
│   │   ├── sbtc.tools.ts           # sBTC operations
│   │   ├── tokens.tools.ts         # USDCx, SIP-010 token operations
│   │   ├── nft.tools.ts            # SIP-009 NFT operations
│   │   ├── defi.tools.ts           # DEX swaps, liquidity, lending
│   │   ├── stacking.tools.ts       # PoX/Stacking operations
│   │   ├── bns.tools.ts            # BNS domain operations
│   │   ├── query.tools.ts          # Read-only blockchain queries
│   │   └── endpoint.tools.ts       # x402 endpoint discovery/execution
│   │
│   ├── services/                   # Core business logic
│   │   ├── hiro-api.ts             # Centralized Hiro Stacks API client
│   │   ├── sbtc.service.ts         # sBTC protocol interactions
│   │   ├── tokens.service.ts       # SIP-010 token operations
│   │   ├── nft.service.ts          # SIP-009 NFT operations
│   │   ├── defi.service.ts         # DEX aggregator (ALEX, Velar, Bitflow)
│   │   ├── stacking.service.ts     # PoX stacking operations
│   │   ├── bns.service.ts          # BNS domain operations
│   │   └── x402.service.ts         # x402 payment handling (current api.ts)
│   │
│   ├── transactions/               # Transaction building
│   │   ├── builder.ts              # Transaction builders
│   │   ├── post-conditions.ts      # Post-condition helpers
│   │   └── clarity-values.ts       # Clarity value encoding (from wallet.ts)
│   │
│   ├── endpoints/                  # x402 endpoint registry
│   │   ├── index.ts                # Endpoint search/filter (from endpoints.ts)
│   │   └── registry.ts             # Known endpoints data
│   │
│   └── utils/
│       ├── validation.ts           # Input validation schemas
│       ├── formatting.ts           # Response formatting helpers
│       └── errors.ts               # Error handling utilities
│
├── dist/                           # Compiled JavaScript
├── package.json
├── tsconfig.json
├── CLAUDE.md
├── README.md
└── .env.example
```

---

## Part 2: New Tools to Add (55+ Tools)

### sBTC Operations (5 tools)

| Tool                         | Description                          | Endpoint/Contract        |
| ---------------------------- | ------------------------------------ | ------------------------ |
| `sbtc_get_balance`           | Get sBTC balance for address         | Hiro API + sBTC contract |
| `sbtc_transfer`              | Transfer sBTC to recipient           | sBTC token contract      |
| `sbtc_get_deposit_info`      | Get BTC deposit address/instructions | sBTC bridge API          |
| `sbtc_get_withdrawal_status` | Check withdrawal operation status    | sBTC bridge API          |
| `sbtc_get_peg_info`          | Get current peg ratio and TVL        | sBTC stats API           |

### USDCx & Token Operations (8 tools)

| Tool                     | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `get_token_balance`      | Get any SIP-010 token balance (USDCx, ALEX, etc.)   |
| `transfer_token`         | Transfer any SIP-010 token                          |
| `get_token_info`         | Get token metadata (name, symbol, decimals, supply) |
| `get_token_holders`      | List top token holders                              |
| `approve_token_spending` | Approve contract to spend tokens                    |
| `get_token_allowance`    | Check spending allowance                            |
| `list_user_tokens`       | List all tokens owned by address                    |
| `get_token_price`        | Get token price from DEX/oracle                     |

### NFT Operations (8 tools)

| Tool                   | Description                         |
| ---------------------- | ----------------------------------- |
| `get_nft_holdings`     | List NFTs owned by address          |
| `get_nft_metadata`     | Get NFT metadata (SIP-016)          |
| `transfer_nft`         | Transfer NFT to recipient           |
| `get_nft_owner`        | Get current NFT owner               |
| `get_collection_info`  | Get NFT collection details          |
| `list_collection_nfts` | List all NFTs in collection         |
| `get_nft_history`      | Get NFT transfer history            |
| `mint_nft`             | Mint new NFT (if contract supports) |

### DeFi Operations (12 tools)

| Tool                  | Description                        | Protocols            |
| --------------------- | ---------------------------------- | -------------------- |
| `get_swap_quote`      | Get best swap route across DEXs    | ALEX, Velar, Bitflow |
| `execute_swap`        | Execute token swap                 | ALEX, Velar, Bitflow |
| `get_pool_info`       | Get liquidity pool details         | All DEXs             |
| `get_pools_list`      | List available pools               | All DEXs             |
| `add_liquidity`       | Add liquidity to pool              | ALEX, Velar          |
| `remove_liquidity`    | Remove liquidity from pool         | ALEX, Velar          |
| `get_lending_markets` | List lending opportunities         | Zest, Arkadiko       |
| `deposit_to_lending`  | Supply tokens to lending pool      | Zest, Arkadiko       |
| `borrow_from_lending` | Borrow against collateral          | Zest, Arkadiko       |
| `repay_loan`          | Repay borrowed amount              | Zest, Arkadiko       |
| `get_vault_info`      | Get vault/CDP details              | Arkadiko             |
| `get_defi_positions`  | Get all DeFi positions for address | All protocols        |

### Stacking/PoX Operations (6 tools)

| Tool                     | Description                  |
| ------------------------ | ---------------------------- |
| `get_pox_info`           | Get current PoX cycle info   |
| `get_stacking_status`    | Check if address is stacking |
| `get_stacking_rewards`   | Get accumulated BTC rewards  |
| `stack_stx`              | Lock STX for stacking        |
| `extend_stacking`        | Extend stacking period       |
| `get_stacking_pool_info` | Get stacking pool details    |

### BNS Domain Operations (6 tools)

| Tool                     | Description                        |
| ------------------------ | ---------------------------------- |
| `lookup_bns_name`        | Resolve .btc domain to address     |
| `reverse_bns_lookup`     | Get .btc domain for address        |
| `get_bns_info`           | Get domain details (expiry, owner) |
| `list_user_domains`      | List domains owned by address      |
| `check_bns_availability` | Check if domain is available       |
| `get_bns_price`          | Get registration price for domain  |

### Blockchain Query Operations (10 tools)

| Tool                       | Description                              |
| -------------------------- | ---------------------------------------- |
| `get_account_info`         | Get account nonce, balance, etc.         |
| `get_account_transactions` | List account transaction history         |
| `get_block_info`           | Get block details                        |
| `get_mempool_info`         | Get pending transactions                 |
| `estimate_transaction_fee` | Estimate STX cost for tx                 |
| `call_read_only_function`  | Call contract read function (no signing) |
| `get_contract_info`        | Get contract ABI and source              |
| `get_contract_events`      | Get contract event history               |
| `search_transactions`      | Search transactions by criteria          |
| `get_network_status`       | Get network health status                |

---

## Part 3: Key Contract Addresses

### Mainnet Contracts

```typescript
export const MAINNET_CONTRACTS = {
  // sBTC
  SBTC_TOKEN: "SM3VDXK3WZZSA84XXBKKCMXWSE1BE6Y1B9MWXXC1.sbtc-token",
  SBTC_REGISTRY: "SM3VDXK3WZZSA84XXBKKCMXWSE1BE6Y1B9MWXXC1.sbtc-registry",

  // Stablecoins
  USDCX: "SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.usdcx-token",
  USDA: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token",

  // DEXs
  ALEX_ROUTER: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.alex-amm-swap-v1-1",
  VELAR_ROUTER: "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.velar-router",

  // Lending
  ZEST_POOL: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow",
  ARKADIKO_VAULT:
    "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-vaults-v1-1",

  // BNS
  BNS_CONTRACT: "SP000000000000000000002Q6VF78.bns",
};

export const TESTNET_CONTRACTS = {
  // Testnet equivalents
  SBTC_TOKEN: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
  // ... etc
};
```

---

## Part 4: Implementation Steps

### Step 1: Create Folder Structure

1. Create all new directories
2. Move `endpoints.ts` → `src/endpoints/registry.ts`
3. Split `wallet.ts` → `src/services/hiro-api.ts` + `src/transactions/`
4. Move `api.ts` → `src/services/x402.service.ts`
5. Create `src/config/contracts.ts` with known addresses

### Step 2: Create Hiro API Service

```typescript
// src/services/hiro-api.ts
export class HiroApiService {
  constructor(private network: Network) {}

  // Account
  async getAccountInfo(address: string): Promise<AccountInfo>;
  async getAccountTransactions(
    address: string,
    options?: TxQueryOptions
  ): Promise<Transaction[]>;
  async getStxBalance(address: string): Promise<Balance>;

  // Tokens
  async getTokenBalance(address: string, contractId: string): Promise<string>;
  async getTokenMetadata(contractId: string): Promise<TokenMetadata>;
  async getTokenHolders(contractId: string): Promise<TokenHolder[]>;

  // NFTs
  async getNftHoldings(address: string): Promise<NftHolding[]>;
  async getNftMetadata(
    contractId: string,
    tokenId: number
  ): Promise<NftMetadata>;
  async getNftOwner(contractId: string, tokenId: number): Promise<string>;

  // Contracts
  async getContractInfo(contractId: string): Promise<ContractInfo>;
  async callReadOnly(
    contractId: string,
    fn: string,
    args: ClarityValue[]
  ): Promise<ClarityValue>;
  async getContractEvents(contractId: string): Promise<ContractEvent[]>;

  // Blocks & Transactions
  async getBlockInfo(heightOrHash: string | number): Promise<Block>;
  async getTransactionStatus(txid: string): Promise<TxStatus>;
  async getMempoolTxs(address?: string): Promise<MempoolTx[]>;
  async estimateFee(txSize: number): Promise<number>;

  // Stacking
  async getPoxInfo(): Promise<PoxInfo>;
  async getStackingStatus(address: string): Promise<StackingStatus>;
}
```

### Step 3: Create Token Service

```typescript
// src/services/tokens.service.ts
export class TokenService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  async getBalance(
    tokenContract: string,
    address?: string
  ): Promise<TokenBalance>;
  async transfer(
    tokenContract: string,
    recipient: string,
    amount: bigint
  ): Promise<TxResult>;
  async approve(
    tokenContract: string,
    spender: string,
    amount: bigint
  ): Promise<TxResult>;
  async getAllowance(
    tokenContract: string,
    owner: string,
    spender: string
  ): Promise<bigint>;
}
```

### Step 4: Create sBTC Service

```typescript
// src/services/sbtc.service.ts
export class SbtcService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  async getBalance(address?: string): Promise<SbtcBalance>;
  async transfer(recipient: string, amount: bigint): Promise<TxResult>;
  async getDepositInfo(): Promise<DepositInfo>;
  async getWithdrawalStatus(opId: string): Promise<WithdrawalStatus>;
  async getPegInfo(): Promise<PegInfo>;
}
```

### Step 5: Create NFT Service

```typescript
// src/services/nft.service.ts
export class NftService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  async getHoldings(address?: string): Promise<NftHolding[]>;
  async getMetadata(contractId: string, tokenId: number): Promise<NftMetadata>;
  async transfer(
    contractId: string,
    tokenId: number,
    recipient: string
  ): Promise<TxResult>;
  async getOwner(contractId: string, tokenId: number): Promise<string>;
  async getCollectionInfo(contractId: string): Promise<CollectionInfo>;
}
```

### Step 6: Create DeFi Service

```typescript
// src/services/defi.service.ts
export class DefiService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  // Swaps (aggregates ALEX, Velar, Bitflow)
  async getSwapQuote(
    tokenIn: string,
    tokenOut: string,
    amount: bigint
  ): Promise<SwapQuote[]>;
  async executeSwap(quote: SwapQuote): Promise<TxResult>;

  // Liquidity
  async getPoolInfo(poolId: string): Promise<PoolInfo>;
  async addLiquidity(
    poolId: string,
    amounts: [bigint, bigint]
  ): Promise<TxResult>;
  async removeLiquidity(poolId: string, lpAmount: bigint): Promise<TxResult>;

  // Lending (Zest, Arkadiko)
  async getLendingMarkets(): Promise<LendingMarket[]>;
  async deposit(marketId: string, amount: bigint): Promise<TxResult>;
  async borrow(marketId: string, amount: bigint): Promise<TxResult>;
  async repay(marketId: string, amount: bigint): Promise<TxResult>;
}
```

### Step 7: Create Stacking Service

```typescript
// src/services/stacking.service.ts
export class StackingService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  async getPoxInfo(): Promise<PoxInfo>;
  async getStackingStatus(address?: string): Promise<StackingStatus>;
  async getRewards(address?: string): Promise<StackingRewards>;
  async stack(amount: bigint, cycles: number): Promise<TxResult>;
  async extendStacking(additionalCycles: number): Promise<TxResult>;
}
```

### Step 8: Create BNS Service

```typescript
// src/services/bns.service.ts
export class BnsService {
  constructor(private hiro: HiroApiService, private account: Account) {}

  async lookupName(name: string): Promise<BnsLookup>;
  async reverseLookup(address: string): Promise<string | null>;
  async getNameInfo(name: string): Promise<BnsInfo>;
  async checkAvailability(name: string): Promise<boolean>;
  async getPrice(name: string): Promise<bigint>;
  async getUserDomains(address?: string): Promise<string[]>;
}
```

### Step 9: Create All Tool Files

- Move existing tools from `index.ts` to respective tool files
- Add new tools using the services

### Step 10: Update Main Entry Point

```typescript
// src/index.ts (simplified)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer({ name: "stx402-agent", version: "2.0.0" });

registerAllTools(server);

// ... startup code
```

### Step 11: Update Documentation

- Update CLAUDE.md with all new tools
- Update README.md with new features
- Update .env.example

---

## Part 5: Files to Create/Modify

### New Files (25+)

```
src/config/index.ts
src/config/networks.ts
src/config/contracts.ts
src/tools/index.ts
src/tools/wallet.tools.ts
src/tools/transfer.tools.ts
src/tools/contract.tools.ts
src/tools/sbtc.tools.ts
src/tools/tokens.tools.ts
src/tools/nft.tools.ts
src/tools/defi.tools.ts
src/tools/stacking.tools.ts
src/tools/bns.tools.ts
src/tools/query.tools.ts
src/tools/endpoint.tools.ts
src/services/hiro-api.ts
src/services/sbtc.service.ts
src/services/tokens.service.ts
src/services/nft.service.ts
src/services/defi.service.ts
src/services/stacking.service.ts
src/services/bns.service.ts
src/services/x402.service.ts
src/transactions/builder.ts
src/transactions/post-conditions.ts
src/transactions/clarity-values.ts
src/endpoints/index.ts
src/endpoints/registry.ts
src/utils/validation.ts
src/utils/formatting.ts
src/utils/errors.ts
```

### Modified Files

```
src/index.ts          - Simplified, imports tools from registry
package.json          - Update version to 2.0.0
CLAUDE.md             - Add all new tools
README.md             - Add new features, updated setup
.env.example          - Update with any new config
```

### Deleted/Moved Files

```
src/wallet.ts         → Split into services/hiro-api.ts + transactions/
src/api.ts            → src/services/x402.service.ts
src/endpoints.ts      → src/endpoints/registry.ts
```

---

## Part 6: Verification Plan

### Unit Testing

- [ ] Test all Hiro API service methods
- [ ] Test token transfer transactions
- [ ] Test NFT operations
- [ ] Test DeFi quote generation
- [ ] Test BNS lookups

### Integration Testing

- [ ] Test sBTC balance queries on mainnet
- [ ] Test USDCx transfers on testnet
- [ ] Test NFT holdings queries
- [ ] Test DEX swap quotes
- [ ] Test stacking status queries
- [ ] Test x402 payments still work

### End-to-End Testing

- [ ] Run MCP server with Claude Code
- [ ] Test all 55+ tools via Claude
- [ ] Verify response formatting
- [ ] Test error handling

---

## Summary

This plan adds **55+ new tools** to stx402-agent covering:

1. **sBTC** - Balance, transfer, deposit info, withdrawal status
2. **Tokens** - SIP-010 operations for USDCx and any token
3. **NFTs** - SIP-009 holdings, transfers, metadata
4. **DeFi** - Swaps, liquidity, lending across ALEX/Velar/Zest/Arkadiko
5. **Stacking** - PoX info, stacking status, rewards
6. **BNS** - Domain lookups, registration status

The codebase is reorganized into a clean folder structure with:

- `/tools` - MCP tool definitions by category
- `/services` - Business logic services
- `/transactions` - Transaction building utilities
- `/config` - Network and contract configurations

Current security model (mnemonic in env vars) is maintained since Claude runs locally on user's PC.
