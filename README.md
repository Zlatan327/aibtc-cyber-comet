# stx402-agent

An MCP (Model Context Protocol) server that enables Claude Code to interact with x402 endpoints and execute Stacks blockchain transactions using your wallet.

## Features

- **x402 Endpoint Discovery** - List and search available paid API endpoints
- **Automatic Payments** - Handles x402 payment challenges automatically
- **Direct Transactions** - Transfer STX, call contracts, deploy smart contracts
- **Multi-Source Support** - Access endpoints from x402.biwas.xyz and stx402.com

## What is x402?

x402 endpoints return HTTP 402 (Payment Required) responses that include payment details. This plugin intercepts those responses, automatically signs and broadcasts the required payment using your Stacks wallet, then retries the request with proof of payment.

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

After adding, restart Claude Code for the MCP server to load.

## Usage Examples

**Discover available endpoints:**
> "What x402 endpoints are available?"
> "Show me AI service endpoints"
> "List free market data endpoints"

**Check your wallet:**
> "What's my wallet address?"
> "What's my STX balance?"

**Transfer STX:**
> "Send 2 STX to ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"

**Execute x402 endpoints:**
> "Get trending liquidity pools"
> "Analyze my wallet behavior"
> "Tell me a dad joke" (uses stx402.com)
> "Summarize this article: ..."

**Smart contract interactions:**
> "Call the transfer function on this contract..."
> "Deploy this Clarity contract..."

## Available Tools

### Endpoint Discovery
| Tool | Description |
|------|-------------|
| `list_x402_endpoints` | Discover available x402 endpoints with search/filter |

### Wallet & Balance
| Tool | Description |
|------|-------------|
| `get_wallet_info` | Get wallet address, network, and API URL |
| `get_stx_balance` | Get STX balance for any address |

### Direct Stacks Transactions
| Tool | Description |
|------|-------------|
| `transfer_stx` | Transfer STX tokens to a recipient |
| `call_contract` | Call a smart contract function |
| `deploy_contract` | Deploy a Clarity smart contract |
| `get_transaction_status` | Check transaction status by txid |
| `broadcast_transaction` | Broadcast a pre-signed transaction |

### x402 API Endpoints
| Tool | Description |
|------|-------------|
| `execute_x402_endpoint` | Execute any x402 endpoint with auto-payment |

## API Sources

The agent supports endpoints from two x402 API sources:

### x402.biwas.xyz (Default)
- **DeFi Analytics**: Portfolio analysis, strategy builder
- **Market Data**: Stats, gainers, losers, whale trades
- **Wallet Analysis**: Classification, trading behavior, P&L
- **ALEX DEX**: Swap optimizer, pool risk, arbitrage scanner
- **Zest Protocol**: Liquidation risk, yield optimizer, position health
- **Tokens & Pools**: Trending pools, token details, OHLCV data

### stx402.com
- **AI Services**: Summarize, translate, TTS, image generation, dad jokes
- **Stacks Blockchain**: Address conversion, tx decode, contract info
- **Cryptography**: SHA256, SHA512, Keccak256, HMAC
- **Storage**: Key-value, SQL database, paste service
- **Utilities**: QR codes, signature verification
- **Infrastructure**: Locks, job queues, counters
- **Agent Registry**: ERC-8004 agent registry and reputation

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `CLIENT_MNEMONIC` | Your 24-word Stacks wallet mnemonic | (required) |
| `NETWORK` | `mainnet` or `testnet` | `testnet` |
| `API_URL` | Default x402 API base URL | `https://x402.biwas.xyz` |

## How It Works

```
You → Claude Code → stx402-agent MCP Server
                           ↓
              ┌────────────┴────────────┐
              ↓                         ↓
       x402 Endpoints            Stacks Transactions
              ↓                         ↓
       HTTP 402 Payment          Sign & Broadcast
       Auto-handling             via Hiro API
              ↓                         ↓
       x402.biwas.xyz            Stacks Blockchain
       stx402.com
```

## Security Notes

- Your mnemonic is stored in the Claude Code configuration and passed as an environment variable
- The mnemonic never leaves your local machine
- Only use wallets with funds you're willing to spend on x402 payments
- Consider using a dedicated wallet for x402 interactions
- Transactions are signed locally before broadcast

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
