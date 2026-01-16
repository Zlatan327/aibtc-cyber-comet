import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  scaffoldProject,
  scaffoldAIProject,
  type EndpointConfig,
  type AIEndpointConfig,
} from "../services/scaffold.service.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerScaffoldTools(server: McpServer): void {
  server.registerTool(
    "scaffold_x402_endpoint",
    {
      description: `Generate a complete Cloudflare Worker project with x402 payment integration.

Creates a ready-to-deploy Hono.js application that accepts payments in STX, sBTC, or USDCx.

## Output Files

- src/index.ts - Hono app with x402-protected endpoints
- src/x402-middleware.ts - Payment verification middleware
- wrangler.jsonc - Cloudflare Worker configuration
- package.json - Dependencies and scripts
- tsconfig.json - TypeScript configuration
- .env.example - Environment variable template
- .gitignore - Standard ignores
- README.md - Documentation

## After Generation

1. cd into the project directory
2. Run: npm install
3. Copy .env.example to .env and add Cloudflare credentials
4. Set recipient address as secret: wrangler secret put RECIPIENT_ADDRESS
5. Run: npm run dev (local development)
6. Run: npm run deploy (deploy to Cloudflare)

## Payment Flow

The generated endpoints implement the x402 payment protocol:
1. Client requests endpoint without payment → receives 402 with payment requirements
2. Client signs transaction (does NOT broadcast)
3. Client retries with X-PAYMENT header containing signed tx
4. Server settles payment via facilitator and returns response`,
      inputSchema: {
        outputDir: z.string().describe("Absolute path to output directory (must exist)"),
        projectName: z
          .string()
          .regex(/^[a-z][a-z0-9-]*$/, "Project name must be lowercase with hyphens only")
          .describe("Project name (lowercase, hyphens allowed, e.g., 'my-x402-api')"),
        endpoints: z
          .array(
            z.object({
              path: z
                .string()
                .startsWith("/")
                .describe("Endpoint path (e.g., '/api/premium')"),
              method: z.enum(["GET", "POST"]).describe("HTTP method"),
              description: z.string().describe("Endpoint description for documentation"),
              amount: z
                .string()
                .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
                .describe("Payment amount (e.g., '0.001' STX or '0.0001' sBTC)"),
              tokenType: z.enum(["STX", "sBTC", "USDCx"]).describe("Payment token type"),
            })
          )
          .min(1)
          .describe("Array of endpoint configurations"),
        recipientAddress: z
          .string()
          .regex(/^S[PT][A-Z0-9]+$/, "Must be a valid Stacks address")
          .describe("Stacks address to receive payments"),
        network: z
          .enum(["mainnet", "testnet"])
          .optional()
          .default("testnet")
          .describe("Network for payments (default: testnet)"),
        facilitatorUrl: z
          .string()
          .url()
          .optional()
          .describe(
            "Custom facilitator URL (default: https://facilitator.x402stacks.xyz)"
          ),
      },
    },
    async ({ outputDir, projectName, endpoints, recipientAddress, network, facilitatorUrl }) => {
      try {
        const result = await scaffoldProject({
          outputDir,
          projectName,
          endpoints: endpoints as EndpointConfig[],
          recipientAddress,
          network: network || "testnet",
          facilitatorUrl: facilitatorUrl || "https://facilitator.x402stacks.xyz",
        });

        return createJsonResponse({
          success: true,
          message: `Project scaffolded successfully at ${result.projectPath}`,
          projectPath: result.projectPath,
          filesCreated: result.filesCreated,
          nextSteps: result.nextSteps,
          endpoints: endpoints.map((ep) => ({
            path: ep.path,
            method: ep.method,
            cost: `${ep.amount} ${ep.tokenType}`,
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // AI-powered x402 endpoint scaffolding with OpenRouter
  server.registerTool(
    "scaffold_x402_ai_endpoint",
    {
      description: `Generate a complete Cloudflare Worker project with x402 payment + OpenRouter AI integration.

Creates a ready-to-deploy Hono.js application that:
- Accepts payments in STX, sBTC, or USDCx
- Calls OpenRouter AI models (Claude, GPT-4, Llama, etc.)
- Returns AI-generated responses after payment

## AI Types

- **chat**: General chat/Q&A endpoint
- **completion**: Text completion/continuation
- **summarize**: Summarize provided text
- **translate**: Translate text to target language
- **custom**: Custom system prompt

## Output Files

- src/index.ts - Hono app with x402-protected AI endpoints
- src/x402-middleware.ts - Payment verification middleware
- src/openrouter.ts - OpenRouter API client
- wrangler.jsonc - Cloudflare Worker configuration
- package.json, tsconfig.json, .env.example, README.md

## After Generation

1. cd into the project directory
2. npm install
3. Set secrets: wrangler secret put RECIPIENT_ADDRESS
4. Set secrets: wrangler secret put OPENROUTER_API_KEY
5. For local dev: create .dev.vars with both secrets
6. npm run dev`,
      inputSchema: {
        outputDir: z.string().describe("Absolute path to output directory (must exist)"),
        projectName: z
          .string()
          .regex(/^[a-z][a-z0-9-]*$/, "Project name must be lowercase with hyphens only")
          .describe("Project name (lowercase, hyphens allowed, e.g., 'my-ai-api')"),
        endpoints: z
          .array(
            z.object({
              path: z
                .string()
                .startsWith("/")
                .describe("Endpoint path (e.g., '/api/chat')"),
              description: z.string().describe("Endpoint description for documentation"),
              amount: z
                .string()
                .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
                .describe("Payment amount (e.g., '0.01' STX)"),
              tokenType: z.enum(["STX", "sBTC", "USDCx"]).describe("Payment token type"),
              aiType: z
                .enum(["chat", "completion", "summarize", "translate", "custom"])
                .describe("Type of AI operation"),
              model: z
                .string()
                .optional()
                .describe("OpenRouter model (e.g., 'anthropic/claude-3-haiku')"),
              systemPrompt: z
                .string()
                .optional()
                .describe("Custom system prompt (for 'custom' aiType or to override default)"),
            })
          )
          .min(1)
          .describe("Array of AI endpoint configurations"),
        recipientAddress: z
          .string()
          .regex(/^S[PT][A-Z0-9]+$/, "Must be a valid Stacks address")
          .describe("Stacks address to receive payments"),
        network: z
          .enum(["mainnet", "testnet"])
          .optional()
          .default("testnet")
          .describe("Network for payments (default: testnet)"),
        facilitatorUrl: z
          .string()
          .url()
          .optional()
          .describe("Custom facilitator URL (default: https://facilitator.x402stacks.xyz)"),
        defaultModel: z
          .string()
          .optional()
          .default("anthropic/claude-3-haiku")
          .describe("Default OpenRouter model for all endpoints (default: anthropic/claude-3-haiku)"),
      },
    },
    async ({
      outputDir,
      projectName,
      endpoints,
      recipientAddress,
      network,
      facilitatorUrl,
      defaultModel,
    }) => {
      try {
        const result = await scaffoldAIProject({
          outputDir,
          projectName,
          endpoints: endpoints as AIEndpointConfig[],
          recipientAddress,
          network: network || "testnet",
          facilitatorUrl: facilitatorUrl || "https://facilitator.x402stacks.xyz",
          defaultModel: defaultModel || "anthropic/claude-3-haiku",
        });

        return createJsonResponse({
          success: true,
          message: `AI project scaffolded successfully at ${result.projectPath}`,
          projectPath: result.projectPath,
          filesCreated: result.filesCreated,
          nextSteps: result.nextSteps,
          endpoints: endpoints.map((ep) => ({
            path: ep.path,
            aiType: ep.aiType,
            model: ep.model || defaultModel || "anthropic/claude-3-haiku",
            cost: `${ep.amount} ${ep.tokenType}`,
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
