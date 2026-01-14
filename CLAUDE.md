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
- `src/services/defi.service.ts` - ALEX DEX (via alex-sdk) and Zest Protocol integrations
- `src/endpoints/registry.ts` - Known x402 endpoint registry from both API sources
- `src/services/bns.service.ts` - BNS name resolution (supports both V1 and V2)
- `src/services/hiro-api.ts` - Hiro API client + BNS V2 API client
- `src/config/contracts.ts` - Contract addresses and Zest asset configuration (LP tokens, oracles, decimals)
- `src/services/scaffold.service.ts` - x402 endpoint project scaffolding for Cloudflare Workers

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

### x402 Endpoint Scaffolding
- `scaffold_x402_endpoint` - Generate a complete Cloudflare Worker project with x402 payment integration

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `outputDir` | Yes | Absolute path to output directory |
| `projectName` | Yes | Project name (lowercase, hyphens) |
| `endpoints` | Yes | Array of endpoint configs |
| `recipientAddress` | Yes | Stacks address to receive payments |
| `network` | No | "mainnet" or "testnet" (default: testnet) |
| `facilitatorUrl` | No | Custom facilitator URL |

**Endpoint Config:**
```typescript
{
  path: "/api/premium",       // Endpoint path
  method: "GET" | "POST",     // HTTP method
  description: "...",         // For docs
  amount: "0.001",            // Payment amount
  tokenType: "STX" | "sBTC" | "USDCx"
}
```

**Generated Project Structure:**
```
{projectName}/
├── src/
│   ├── index.ts              # Hono app with routes
│   └── x402-middleware.ts    # Payment verification
├── wrangler.jsonc            # Cloudflare config
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

**Example:**
```
scaffold_x402_endpoint({
  outputDir: "/Users/me/projects",
  projectName: "my-paid-api",
  endpoints: [{
    path: "/api/joke",
    method: "GET",
    description: "Generate a joke",
    amount: "0.001",
    tokenType: "STX"
  }],
  recipientAddress: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  network: "testnet"
})
```

### x402 AI Endpoint Scaffolding (OpenRouter)
- `scaffold_x402_ai_endpoint` - Generate x402 endpoint project with OpenRouter AI integration

**AI Types:**
| Type | Description |
|------|-------------|
| `chat` | General chat/Q&A endpoint |
| `completion` | Text completion/continuation |
| `summarize` | Summarize provided text |
| `translate` | Translate text to target language |
| `custom` | Custom system prompt |

**AI Endpoint Config:**
```typescript
{
  path: "/api/chat",
  description: "Chat with AI",
  amount: "0.01",
  tokenType: "STX" | "sBTC" | "USDCx",
  aiType: "chat" | "completion" | "summarize" | "translate" | "custom",
  model?: "anthropic/claude-3-haiku",  // Optional, uses defaultModel
  systemPrompt?: "You are..."          // Optional, for custom prompts
}
```

**Example:**
```
scaffold_x402_ai_endpoint({
  outputDir: "/Users/me/projects",
  projectName: "my-ai-api",
  endpoints: [{
    path: "/api/chat",
    description: "Chat with AI",
    amount: "0.01",
    tokenType: "STX",
    aiType: "chat"
  }, {
    path: "/api/summarize",
    description: "Summarize text",
    amount: "0.005",
    tokenType: "STX",
    aiType: "summarize"
  }],
  recipientAddress: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  defaultModel: "anthropic/claude-3-haiku"
})
```

**Popular OpenRouter Models:**
- `anthropic/claude-sonnet-4.5` - Best overall, 1M context
- `anthropic/claude-3.5-haiku` - Fast and affordable
- `openai/gpt-4o-mini` - Fast and cheap
- `google/gemini-2.5-flash` - 1M context, fast
- `x-ai/grok-4` - xAI flagship, real-time knowledge
- `deepseek/deepseek-r1` - Excellent reasoning
- `meta-llama/llama-3.3-70b-instruct` - Best open source value

### OpenRouter Integration (AI Features)

Tools for implementing AI features using OpenRouter in any project:

- `openrouter_integration_guide` - Get code examples and patterns for integrating OpenRouter
- `openrouter_models` - List available models with capabilities

**Usage:** When implementing AI features:
1. Call `openrouter_integration_guide` to get code examples for the target environment
2. If documentation is incomplete or outdated, search the web for latest OpenRouter docs
3. Use the returned code templates to implement the feature

**Example Workflow:**
1. User: "Add AI chat to my Cloudflare Worker"
2. Claude calls `openrouter_integration_guide` with `environment: "cloudflare-worker"`
3. If needed, Claude searches web for latest OpenRouter API docs
4. Claude implements the feature using the templates

### DeFi - ALEX DEX (Mainnet Only)

Uses the official `alex-sdk` for swap operations. The SDK handles:
- Token resolution (symbols like "STX", "ALEX" → Currency enum)
- Route optimization
- STX wrapping/unwrapping
- Post conditions

Tools:
- `alex_list_pools` - **Start here!** Discover all available trading pools
- `alex_get_swap_quote` - Get expected output for a token swap (uses `sdk.getAmountTo()`)
- `alex_swap` - Execute a token swap (uses `sdk.runSwap()`)
- `alex_get_pool_info` - Get liquidity pool reserves and details

**Token symbols supported:** STX, WSTX, ALEX, or any token name from `fetchSwappableCurrency()`

### DeFi - Zest Protocol (Mainnet Only)

Uses the `pool-borrow-v2-3` contract with proper function signatures. Asset configuration in `src/config/contracts.ts` includes LP tokens and oracles for all 10 supported assets.

**Supported Assets:**
| Symbol | Token | Decimals |
|--------|-------|----------|
| sBTC | SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token | 8 |
| aeUSDC | SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc | 6 |
| stSTX | SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token | 6 |
| wSTX | SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx | 6 |
| USDH | SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1 | 8 |
| sUSDT | SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt | 6 |
| USDA | SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token | 6 |
| DIKO | SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token | 6 |
| ALEX | SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex | 8 |
| stSTX-BTC | SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2 | 6 |

**Contract Function Signatures:**
- `supply(lp, pool-reserve, asset, amount, owner)`
- `withdraw(pool-reserve, asset, lp, oracle, assets-list, amount, owner)`
- `borrow(pool-reserve, oracle, asset, lp, assets-list, amount, fee-calc, rate-mode, owner)`
- `repay(asset, amount, on-behalf-of, payer)`

Tools:
- `zest_list_assets` - **Start here!** Lists all supported assets with metadata
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
| "Swap 0.1 STX for ALEX" | `alex_swap` with tokenX="STX", tokenY="ALEX" (SDK handles resolution) |
| "How much ALEX for 10 STX?" | `alex_get_swap_quote` with simple symbols |
| "Supply 1000 stSTX to Zest" | `zest_supply` with asset="stSTX" |
| "Borrow 100 aeUSDC from Zest" | `zest_borrow` with asset="aeUSDC" |
| "Check my Zest position" | `zest_get_position` for supplied/borrowed |
| "Tell me a dad joke" | `execute_x402_endpoint` with url="https://stx402.com/api/ai/dad-joke" |
| "Create a paid API endpoint for jokes" | `scaffold_x402_endpoint` with endpoint config |
| "Create an AI chatbot API that charges per request" | `scaffold_x402_ai_endpoint` with chat aiType |

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
- `nuggets/github.md` - GitHub API, Actions, and Pages workflows

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
- `runbook/aibtc-shared-logger.md` - Shared logging utilities for AIBTC services
- `runbook/daily-summary.md` - Daily summary generation workflow
- `runbook/setup-github-pat.md` - GitHub Personal Access Token setup
- `runbook/setup-sprout-cron.md` - Sprout documentation cron job setup
- `runbook/sprout-docs-inline.md` - Sprout documentation system overview
- `runbook/sprout-docs-github-pages.md` - Documentation site deployment with GitHub Pages
- `runbook/updating-claude-knowledge.md` - Knowledge base maintenance and sanitization guidelines
