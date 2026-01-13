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
| x402.biwas.xyz | https://x402.biwas.xyz | DeFi analytics, market data, wallet analysis |
| stx402.com | https://stx402.com | AI services, cryptography, storage, utilities, agent registry |

## Build Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript to dist/
npm run dev       # Run in development mode with tsx
npm start         # Run compiled server
```

## Code Principles

**CRITICAL: Follow these principles when writing code in this repository:**

1. **No Dummy Implementations** - Never write placeholder/stub code that returns fake data. If a feature can't be fully implemented, don't implement it at all. Remove the feature rather than shipping non-functional code.

2. **No Defensive Programming with Fallback Dummies** - Do not catch errors and return default/dummy values. If an operation fails, let it fail. Don't hide failures behind fake success responses.

3. **Real Implementation or Nothing** - Every function must do real work. If you can't make a real API call, contract call, or data fetch, don't write the function.

4. **Delete Over Stub** - When removing functionality, delete it completely. Don't leave behind commented code, stub methods, or "TODO" implementations.

5. **Errors Should Surface** - Let errors propagate to the user. Don't swallow exceptions or return fallback values that mask failures.

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
- `src/services/wallet-manager.ts` - Managed wallet creation, encryption, and session management
- `src/services/defi.service.ts` - ALEX DEX and Zest Protocol integrations
- `src/endpoints/registry.ts` - Known x402 endpoint registry from both API sources
- `src/services/bns.service.ts` - BNS name resolution (supports both V1 and V2)
- `src/services/hiro-api.ts` - Hiro API client + BNS V2 API client
- `src/config/contracts.ts` - Contract addresses for sBTC, ALEX, Zest, and other protocols

### BNS V1 vs V2

The agent supports both BNS naming systems:

| System | API | Usage |
|--------|-----|-------|
| BNS V1 | `api.hiro.so/v1/names/{name}` | Legacy names (older registrations) |
| BNS V2 | `api.bnsv2.com/names/{name}` | Current system (most .btc names) |

BNS tools automatically check V2 first for `.btc` names, falling back to V1 for legacy support.

### x402 Payment Flow

1. Client makes request to x402 endpoint
2. Endpoint returns HTTP 402 with payment requirements
3. `withPaymentInterceptor` from x402-stacks intercepts the 402
4. Interceptor signs and broadcasts payment transaction
5. Request is retried with payment proof
6. Endpoint returns actual response

## Configuration

Set environment variables in `.env`:
- `CLIENT_MNEMONIC` - 24-word Stacks wallet mnemonic (optional - can use managed wallets instead)
- `NETWORK` - "mainnet" or "testnet" (default: testnet)
- `API_URL` - Default x402 API base URL (default: https://x402.biwas.xyz)

### Wallet Storage

Managed wallets are stored encrypted in `~/.stx402/`:
```
~/.stx402/
├── wallets.json       # Wallet index (metadata only)
├── config.json        # Active wallet, settings
└── wallets/
    └── [wallet-id]/
        └── keystore.json  # Encrypted mnemonic (AES-256-GCM)
```

## Adding to Claude Code

Add to your Claude Code MCP settings:
```json
{
  "mcpServers": {
    "stx402": {
      "command": "node",
      "args": ["/path/to/stx402-agent/dist/index.js"],
      "env": {
        "NETWORK": "testnet"
      }
    }
  }
}
```

**Note:** `CLIENT_MNEMONIC` is optional. Users can either:
1. **Managed wallets (recommended)**: Use `wallet_create` or `wallet_import` to generate/import wallets with password protection
2. **Environment mnemonic**: Set `CLIENT_MNEMONIC` in env (for power users)

## Available Tools

### Endpoint Discovery
- `list_x402_endpoints` - List all available x402 endpoints with search/filter by source, category, or keyword. **Use this first** to discover what actions are available.

### Wallet & Balance
- `get_wallet_info` - Get configured wallet address, network, and API URL
- `get_stx_balance` - Get STX balance for any address

### Wallet Management
- `wallet_create` - Generate a new wallet with BIP39 mnemonic (encrypted locally)
- `wallet_import` - Import an existing wallet from mnemonic
- `wallet_unlock` - Unlock a wallet for transactions (requires password)
- `wallet_lock` - Lock the wallet (clear from memory)
- `wallet_list` - List all available wallets
- `wallet_switch` - Switch active wallet
- `wallet_delete` - Permanently delete a wallet
- `wallet_export` - Export mnemonic (with security warning)
- `wallet_status` - Get current wallet/session status

### Direct Stacks Transactions
- `transfer_stx` - Transfer STX tokens to a recipient (signs and broadcasts)
- `call_contract` - Call a smart contract function (signs and broadcasts)
- `deploy_contract` - Deploy a Clarity smart contract
- `get_transaction_status` - Check transaction status by txid
- `broadcast_transaction` - Broadcast a pre-signed transaction

### x402 API Endpoints
- `execute_x402_endpoint` - Execute ANY x402 endpoint URL with automatic payment handling. Can use full URL or path+apiUrl.

### DeFi - ALEX DEX (Mainnet Only)
- `alex_list_pools` - **Start here!** Discover all available trading pools
- `alex_get_swap_quote` - Get expected output for a token swap
- `alex_swap` - Execute a token swap on ALEX AMM
- `alex_get_pool_info` - Get liquidity pool reserves and details

### DeFi - Zest Protocol (Mainnet Only)
- `zest_list_assets` - **Start here!** Lists all supported assets dynamically from the contract
- `zest_get_position` - Get user's lending position (supplied/borrowed amounts)
- `zest_supply` - Supply assets to earn interest
- `zest_withdraw` - Withdraw supplied assets
- `zest_borrow` - Borrow assets against collateral
- `zest_repay` - Repay borrowed assets

All Zest tools accept asset symbols (e.g., 'stSTX', 'aeUSDC') or full contract IDs.

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
| "What pools can I trade on ALEX?" | `alex_list_pools` to discover available pairs |
| "Swap 100 wSTX for sUSDT" | `alex_swap` with tokenX=wSTX, tokenY=sUSDT |
| "How much sUSDT for 10 wSTX?" | `alex_get_swap_quote` for pricing |
| "Supply 1000 stSTX to Zest" | `zest_supply` to earn lending interest |
| "Check my Zest position" | `zest_get_position` for supplied/borrowed |
| "Tell me a dad joke" | `execute_x402_endpoint` with url="https://stx402.com/api/ai/dad-joke" |

### Endpoint Categories

**x402.biwas.xyz:**
- News & Research, Security, Wallet Analysis
- Market Data, Pools, Tokens

**stx402.com:**
- AI Services (jokes, summarize, translate, TTS, image generation)
- Stacks Blockchain (address conversion, tx decode, contract info)
- Cryptography (SHA256, HMAC, etc.)
- Storage (KV, SQL, Paste)
- Utilities (QR codes, signature verification)
- Registry, Links, Counters, Job Queue, Memory
- Agent Registry & Reputation

---

## Knowledge Base References

Use the local knowledge base for Stacks/Clarity and protocol guidance: `/Users/biwas/claudex402/claude-knowledge`

### Quick Reference (Nuggets)
Fast lookups for common facts and gotchas:

- `nuggets/stacks.md` - Tenero API, SIWS, SIP-018 signing standards quick reference
- `nuggets/clarity.md` - Core principles, gotchas, error handling, testing commands
- `nuggets/cloudflare.md` - Worker deployment best practices (prefer CI/CD over direct deploy)
- `nuggets/node.md` - Node.js and TypeScript tooling tips
- `nuggets/github.md` - GitHub API, Actions, and Pages workflows
- `nuggets/git.md` - Git workflow tips and commands

### Deep Reference (Context)
Comprehensive documentation for detailed guidance:

- `context/clarity-reference.md` - Complete Clarity language reference
- `context/siws-guide.md` and `context/sip-siws.md` - SIWS auth flows and implementation
- `context/sip-018.md` - Signed Structured Data standard for on-chain verification
- `context/tenero-api.md` and `downloads/2025-01-06-tenero-openapi-spec.json` - Market data APIs

### Patterns & Best Practices
Reusable code patterns and architectural guidance:

- `patterns/clarity-patterns.md` - Comprehensive Clarity code patterns (public functions, events, error handling, bit flags, multi-send, whitelisting, DAO proposals, fixed-point math, treasury patterns)
- `patterns/clarity-testing.md` - Testing tooling and patterns for Clarity contracts
- `patterns/skill-organization.md` - Three-layer pattern (SKILL → RUNBOOK → HELPERS) for maintainable workflows

### Architectural Decisions
Design principles and workflow patterns:

- `decisions/0002-clarity-design-principles.md` - Contract design rules, security patterns, Clarity 4 features
- `decisions/0001-workflow-component-design.md` - Development workflow component patterns (OODA loop, planning flows, composable workflows)

### Runbooks
Step-by-step operational guides:

- `runbook/clarity-development.md` - Clarity dev workflows and checklists
- `runbook/cloudflare-scaffold.md` - Cloudflare Worker setup, wrangler config, credentials, deployment patterns
- `runbook/cloudflare-shared-logger.md` - Shared logging utilities for Cloudflare Workers
- `runbook/setup-github-pat.md` - GitHub Personal Access Token setup
- `runbook/setup-sprout-cron.md` - Sprout documentation cron job setup
- `runbook/sprout-docs.md` - Sprout documentation system overview
- `runbook/sprout-docs-github-pages.md` - Documentation site deployment with GitHub Pages
- `runbook/updating-claude-knowledge.md` - Knowledge base maintenance and sanitization guidelines
