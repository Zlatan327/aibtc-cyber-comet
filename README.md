# stx402-agent

An MCP (Model Context Protocol) server that enables Claude to interact with the Stacks blockchain and x402 paid API endpoints.

## Features

- **50+ Tools** - Comprehensive Stacks blockchain operations
- **sBTC Support** - Native Bitcoin on Stacks operations
- **Token Operations** - SIP-010 fungible token transfers and queries
- **NFT Support** - SIP-009 NFT holdings, transfers, and metadata
- **DeFi Integration** - Swap quotes, liquidity pools, lending markets
- **Stacking/PoX** - Stacking status, rewards, and delegation
- **BNS Domains** - .btc domain lookups and management
- **x402 Payments** - Automatic payment handling for paid APIs
- **Direct Transactions** - Transfer STX, call contracts, deploy smart contracts

## Quick Start

### Option 1: Using npx (Recommended)

```bash
claude mcp add stx402 npx stx402-agent -e CLIENT_MNEMONIC="your 24 word mnemonic" -e NETWORK=testnet
```

### Option 2: Global Install

```bash
npm install -g stx402-agent
claude mcp add stx402 stx402-agent -e CLIENT_MNEMONIC="your 24 word mnemonic" -e NETWORK=testnet
```

### Option 3: Manual Configuration

Add to your Claude Code settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "stx402": {
      "command": "npx",
      "args": ["stx402-agent"],
      "env": {
        "CLIENT_MNEMONIC": "your twenty four word stacks wallet mnemonic phrase goes here",
        "NETWORK": "testnet",
        "API_URL": "https://x402.biwas.xyz"
      }
    }
  }
}
```

## Available Tools (53 total)

### Wallet & Balance
| Tool | Description |
|------|-------------|
| `get_wallet_info` | Get wallet address, network, and API URL |
| `get_stx_balance` | Get STX balance for any address |

### STX Transfers
| Tool | Description |
|------|-------------|
| `transfer_stx` | Transfer STX tokens to a recipient |
| `broadcast_transaction` | Broadcast a pre-signed transaction |

### sBTC Operations
| Tool | Description |
|------|-------------|
| `sbtc_get_balance` | Get sBTC balance for an address |
| `sbtc_transfer` | Transfer sBTC to a recipient |
| `sbtc_get_deposit_info` | Get BTC deposit address/instructions |
| `sbtc_get_peg_info` | Get current peg ratio and TVL |
| `sbtc_get_withdrawal_status` | Check withdrawal operation status |

### Token Operations (SIP-010)
| Tool | Description |
|------|-------------|
| `get_token_balance` | Get balance of any SIP-010 token |
| `transfer_token` | Transfer any SIP-010 token |
| `get_token_info` | Get token metadata (name, symbol, decimals) |
| `list_user_tokens` | List all tokens owned by an address |
| `get_token_holders` | Get top holders of a token |

### NFT Operations (SIP-009)
| Tool | Description |
|------|-------------|
| `get_nft_holdings` | List NFTs owned by an address |
| `get_nft_metadata` | Get NFT metadata |
| `transfer_nft` | Transfer NFT to a recipient |
| `get_nft_owner` | Get current NFT owner |
| `get_collection_info` | Get NFT collection details |
| `get_nft_history` | Get NFT transfer history |

### DeFi Operations
| Tool | Description |
|------|-------------|
| `get_swap_quote` | Get best swap route across DEXs |
| `execute_swap` | Execute a token swap |
| `get_pool_info` | Get liquidity pool details |
| `get_pools_list` | List available liquidity pools |
| `add_liquidity` | Add liquidity to a pool |
| `remove_liquidity` | Remove liquidity from a pool |
| `get_lending_markets` | List lending opportunities |
| `get_defi_positions` | Get all DeFi positions for an address |

### Stacking / PoX
| Tool | Description |
|------|-------------|
| `get_pox_info` | Get current PoX cycle info |
| `get_stacking_status` | Check if address is stacking |
| `get_stacking_rewards` | Get accumulated BTC rewards |
| `stack_stx` | Lock STX for stacking |
| `extend_stacking` | Extend stacking period |
| `get_stacking_pool_info` | Get stacking pool details |

### BNS Domains (V1 + V2)
| Tool | Description |
|------|-------------|
| `lookup_bns_name` | Resolve .btc domain to address (supports BNS V2) |
| `reverse_bns_lookup` | Get .btc domain for an address |
| `get_bns_info` | Get domain details (expiry, owner) |
| `check_bns_availability` | Check if domain is available (checks both V1 and V2) |
| `get_bns_price` | Get registration price for domain |
| `list_user_domains` | List domains owned by an address |

> **Note:** BNS tools now support both BNS V1 (legacy) and BNS V2 (current) naming systems. Most `.btc` names are registered through BNS V2 at `api.bnsv2.com`.

### Smart Contracts
| Tool | Description |
|------|-------------|
| `call_contract` | Call a smart contract function |
| `deploy_contract` | Deploy a Clarity smart contract |
| `get_transaction_status` | Check transaction status by txid |
| `call_read_only_function` | Call contract read function (no signing) |

### Blockchain Queries
| Tool | Description |
|------|-------------|
| `get_account_info` | Get account nonce, balance, etc. |
| `get_account_transactions` | List account transaction history |
| `get_block_info` | Get block details |
| `get_mempool_info` | Get pending transactions |
| `get_contract_info` | Get contract ABI and source |
| `get_contract_events` | Get contract event history |
| `get_network_status` | Get network health status |

### x402 API Endpoints
| Tool | Description |
|------|-------------|
| `list_x402_endpoints` | Discover available x402 endpoints |
| `execute_x402_endpoint` | Execute any x402 endpoint with auto-payment |

## Usage Examples

**Check balances:**
> "What's my STX balance?"
> "How much sBTC do I have?"
> "Show my USDCx balance"

**Transfer tokens:**
> "Send 2 STX to ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
> "Transfer 0.001 sBTC to muneeb.btc"

**DeFi operations:**
> "Get a swap quote for 100 STX to sBTC"
> "What are the best lending rates?"
> "Show my DeFi positions"

**NFTs:**
> "What NFTs do I own?"
> "Show metadata for this NFT collection"

**BNS domains:**
> "What address is satoshi.btc?"
> "Is myname.btc available?"
> "What domains do I own?"

**Stacking:**
> "Am I currently stacking?"
> "What's the current PoX cycle?"
> "How much rewards have I earned?"

**x402 endpoints:**
> "Get trending liquidity pools"
> "Tell me a dad joke"
> "Summarize this article: ..."

## Supported Tokens

Well-known tokens can be referenced by symbol:
- **sBTC** - Native Bitcoin on Stacks
- **USDCx** - USD Coin on Stacks
- **ALEX** - ALEX DEX token
- **DIKO** - Arkadiko governance token

Or use any SIP-010 token by contract ID: `SP2X...::token-name`

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `CLIENT_MNEMONIC` | Your 24-word Stacks wallet mnemonic | (required) |
| `NETWORK` | `mainnet` or `testnet` | `testnet` |
| `API_URL` | Default x402 API base URL | `https://x402.biwas.xyz` |

## Architecture

```
Claude → stx402-agent MCP Server
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
Hiro Stacks API    x402 Endpoints
    ↓                   ↓
Stacks Blockchain  Paid API Services
```

## Security Notes

- Your mnemonic is stored locally and never transmitted
- Transactions are signed locally before broadcast
- Only use wallets with funds you're willing to spend
- Consider using a dedicated wallet for x402 interactions

## Development

```bash
git clone https://github.com/biwasxyz/stx402-agent.git
cd stx402-agent
npm install
npm run build
npm run dev       # Run with tsx (development)
```

## License

MIT
