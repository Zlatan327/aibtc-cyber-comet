# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

stx402-agent is an MCP (Model Context Protocol) server that enables Claude to:
1. **Discover and execute x402 API endpoints** - Paid API calls for DeFi analytics, AI services, market data
2. **Execute Stacks blockchain transactions** - Transfer STX, call smart contracts, deploy contracts

The plugin automatically handles x402 payment challenges when accessing paid endpoints.

## API Sources

The agent supports two x402 API sources:

| Source | URL | Endpoints |
|--------|-----|-----------|
| x402.biwas.xyz | https://x402.biwas.xyz | DeFi analytics, market data, wallet analysis, Zest/ALEX protocols |
| stx402.com | https://stx402.com | AI services, cryptography, storage, utilities, agent registry |

## Build Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript to dist/
npm run dev       # Run in development mode with tsx
npm start         # Run compiled server
```

## Architecture

```
Claude Code
    ↓ (MCP stdio transport)
stx402-agent MCP Server (src/index.ts)
    ↓
┌─────────────────────────────────────────────────────────┐
│  x402 Endpoints                          Stacks TX      │
│  (via api.ts)                         (via wallet.ts)   │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │x402.biwas.xyz│  │ stx402.com  │                       │
│  └─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
   x402 API Server     x402 API Server     Stacks Blockchain
```

### Key Files

- `src/index.ts` - MCP server with all tool definitions
- `src/api.ts` - Axios client with x402-stacks payment interceptor (supports multiple API sources)
- `src/wallet.ts` - Wallet operations and transaction signing using @stacks/transactions
- `src/endpoints.ts` - Known x402 endpoint registry from both API sources

### x402 Payment Flow

1. Client makes request to x402 endpoint
2. Endpoint returns HTTP 402 with payment requirements
3. `withPaymentInterceptor` from x402-stacks intercepts the 402
4. Interceptor signs and broadcasts payment transaction
5. Request is retried with payment proof
6. Endpoint returns actual response

## Configuration

Set environment variables in `.env`:
- `CLIENT_MNEMONIC` - 24-word Stacks wallet mnemonic (required)
- `NETWORK` - "mainnet" or "testnet" (default: testnet)
- `API_URL` - Default x402 API base URL (default: https://x402.biwas.xyz)

## Adding to Claude Code

Add to your Claude Code MCP settings:
```json
{
  "mcpServers": {
    "stx402": {
      "command": "node",
      "args": ["/path/to/stx402-agent/dist/index.js"],
      "env": {
        "CLIENT_MNEMONIC": "your mnemonic here",
        "NETWORK": "testnet"
      }
    }
  }
}
```

## Available Tools

### Endpoint Discovery
- `list_x402_endpoints` - List all available x402 endpoints with search/filter by source, category, or keyword. **Use this first** to discover what actions are available.

### Wallet & Balance
- `get_wallet_info` - Get configured wallet address, network, and API URL
- `get_stx_balance` - Get STX balance for any address

### Direct Stacks Transactions
- `transfer_stx` - Transfer STX tokens to a recipient (signs and broadcasts)
- `call_contract` - Call a smart contract function (signs and broadcasts)
- `deploy_contract` - Deploy a Clarity smart contract
- `get_transaction_status` - Check transaction status by txid
- `broadcast_transaction` - Broadcast a pre-signed transaction

### x402 API Endpoints
- `execute_x402_endpoint` - Execute ANY x402 endpoint URL with automatic payment handling. Can use full URL or path+apiUrl.

## Agent Behavior Guidelines

When a user asks for something:

1. **For "transfer X STX to Y"** → Use `transfer_stx` directly
2. **For known x402 endpoints** → Use `list_x402_endpoints` to find relevant endpoint, then `execute_x402_endpoint`
3. **For any x402 URL** → Use `execute_x402_endpoint` with full `url` parameter - works with ANY x402-compatible endpoint
4. **For unknown actions** → Ask user for the x402 endpoint URL or check if it's a direct blockchain action

### Example User Requests

| Request | Action |
|---------|--------|
| "Send 2 STX to ST1..." | `transfer_stx` with amount "2000000" |
| "What are trending pools?" | `execute_x402_endpoint` with path="/api/pools/trending" |
| "Call https://example.com/api/data" | `execute_x402_endpoint` with url="https://example.com/api/data" |
| "Tell me a dad joke" | `execute_x402_endpoint` with url="https://stx402.com/api/ai/dad-joke" |
| "Use this endpoint: https://myapi.com/paid" | `execute_x402_endpoint` with url="https://myapi.com/paid" |

### Endpoint Categories

**x402.biwas.xyz:**
- News & Research, Security, Wallet Analysis
- ALEX DEX, Zest Protocol, DeFi
- Market Data, Pools, Tokens

**stx402.com:**
- AI Services (jokes, summarize, translate, TTS, image generation)
- Stacks Blockchain (address conversion, tx decode, contract info)
- Cryptography (SHA256, HMAC, etc.)
- Storage (KV, SQL, Paste)
- Utilities (QR codes, signature verification)
- Registry, Links, Counters, Job Queue, Memory
- Agent Registry & Reputation
