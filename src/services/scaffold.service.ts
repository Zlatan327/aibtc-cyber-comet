import fs from "fs/promises";
import path from "path";

export interface EndpointConfig {
  path: string;
  method: "GET" | "POST";
  description: string;
  amount: string;
  tokenType: "STX" | "sBTC" | "USDCx";
}

export interface AIEndpointConfig {
  path: string;
  description: string;
  amount: string;
  tokenType: "STX" | "sBTC" | "USDCx";
  aiType: "chat" | "completion" | "summarize" | "translate" | "custom";
  model?: string;
  systemPrompt?: string;
}

export interface ScaffoldConfig {
  outputDir: string;
  projectName: string;
  endpoints: EndpointConfig[];
  recipientAddress: string;
  network: "mainnet" | "testnet";
  facilitatorUrl: string;
}

export interface ScaffoldResult {
  projectPath: string;
  filesCreated: string[];
  nextSteps: string[];
}

export interface AIScaffoldConfig {
  outputDir: string;
  projectName: string;
  endpoints: AIEndpointConfig[];
  recipientAddress: string;
  network: "mainnet" | "testnet";
  facilitatorUrl: string;
  defaultModel: string;
}

// Token decimals for conversion
const TOKEN_DECIMALS: Record<string, number> = {
  STX: 6,
  sBTC: 8,
  USDCx: 6,
};

/**
 * Convert human-readable amount to smallest unit (microSTX, sats, etc.)
 */
function toSmallestUnit(amount: string, tokenType: "STX" | "sBTC" | "USDCx"): string {
  const decimals = TOKEN_DECIMALS[tokenType];
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFraction).toString();
}

/**
 * Generate Hono route code for each endpoint
 */
function generateEndpointCode(endpoints: EndpointConfig[]): string {
  return endpoints
    .map((ep) => {
      const amountSmallest = toSmallestUnit(ep.amount, ep.tokenType);
      return `
// ${ep.description}
app.${ep.method.toLowerCase()}('${ep.path}',
  x402Middleware({
    amount: '${amountSmallest}',
    address: env.RECIPIENT_ADDRESS,
    network: env.NETWORK as 'mainnet' | 'testnet',
    tokenType: '${ep.tokenType}',
    facilitatorUrl: env.FACILITATOR_URL,
  }),
  async (c) => {
    const payment = c.get('payment');
    // TODO: Add your endpoint logic here
    return c.json({
      message: '${ep.description}',
      txId: payment?.txId,
      timestamp: new Date().toISOString(),
    });
  }
);`;
    })
    .join("\n");
}

/**
 * Generate endpoint documentation for README
 */
function generateEndpointDocs(endpoints: EndpointConfig[]): string {
  return endpoints
    .map((ep) => {
      return `### ${ep.method} ${ep.path}
- **Description:** ${ep.description}
- **Cost:** ${ep.amount} ${ep.tokenType}
- **Payment Required:** Yes`;
    })
    .join("\n\n");
}

/**
 * Generate token list for README
 */
function generateTokenList(endpoints: EndpointConfig[]): string {
  const tokens = [...new Set(endpoints.map((ep) => ep.tokenType))];
  return tokens.map((t) => `- ${t}`).join("\n");
}

// =============================================================================
// FILE TEMPLATES
// =============================================================================

function getIndexTemplate(endpoints: EndpointConfig[]): string {
  const endpointCode = generateEndpointCode(endpoints);
  return `import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { x402Middleware } from './x402-middleware';

type Bindings = {
  RECIPIENT_ADDRESS: string;
  NETWORK: string;
  FACILITATOR_URL: string;
};

type Variables = {
  payment?: {
    txId: string;
    status: string;
    sender: string;
    recipient: string;
    amount: bigint;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors());

// Health check (free)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// x402-protected endpoints
app.use('*', async (c, next) => {
  // Make env available to middleware
  const env = c.env;
  (globalThis as Record<string, unknown>).__env = env;
  await next();
});

const env = {
  get RECIPIENT_ADDRESS() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.RECIPIENT_ADDRESS || '';
  },
  get NETWORK() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.NETWORK || 'testnet';
  },
  get FACILITATOR_URL() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.FACILITATOR_URL || '';
  },
};
${endpointCode}

export default app;
`;
}

function getMiddlewareTemplate(): string {
  return `import type { Context, Next } from 'hono';

export interface X402Config {
  amount: string;
  address: string;
  network: 'mainnet' | 'testnet';
  tokenType: 'STX' | 'sBTC' | 'USDCx';
  facilitatorUrl?: string;
  resource?: string;
}

interface TokenContract {
  address: string;
  name: string;
}

// Token contract addresses for payment verification
const TOKEN_CONTRACTS: Record<string, Record<string, TokenContract | null>> = {
  mainnet: {
    STX: null,
    sBTC: { address: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', name: 'sbtc-token' },
    USDCx: { address: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK', name: 'token-usdcx' },
  },
  testnet: {
    STX: null,
    sBTC: { address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', name: 'sbtc-token' },
    USDCx: null,
  },
};

interface PaymentRequirement {
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  network: string;
  nonce: string;
  expiresAt: string;
  tokenType: string;
  tokenContract?: TokenContract;
}

interface SettleRequest {
  signed_transaction: string;
  expected_recipient: string;
  min_amount: string;
  network: string;
  token_type: string;
  resource: string;
  method: string;
}

interface SettleResponse {
  success: boolean;
  tx_id?: string;
  status?: string;
  sender_address?: string;
  recipient_address?: string;
  amount?: number;
  error?: string;
}

/**
 * x402 Payment Middleware for Hono
 *
 * Handles the x402 payment flow:
 * 1. If no X-PAYMENT header, return 402 with payment requirements
 * 2. If X-PAYMENT header present, verify payment via facilitator
 * 3. On success, attach payment info and continue to handler
 */
export function x402Middleware(config: X402Config) {
  const facilitatorUrl = config.facilitatorUrl || 'https://facilitator.x402stacks.xyz';
  const tokenContract = TOKEN_CONTRACTS[config.network]?.[config.tokenType] || null;

  return async (c: Context, next: Next) => {
    const signedPayment = c.req.header('x-payment');

    if (!signedPayment) {
      // Return 402 Payment Required with payment details
      const paymentReq: PaymentRequirement = {
        maxAmountRequired: config.amount,
        resource: config.resource || c.req.path,
        payTo: config.address,
        network: config.network,
        nonce: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        tokenType: config.tokenType,
      };

      if (tokenContract) {
        paymentReq.tokenContract = tokenContract;
      }

      return c.json(paymentReq, 402);
    }

    // Verify and settle payment via facilitator
    try {
      const settleRequest: SettleRequest = {
        signed_transaction: signedPayment,
        expected_recipient: config.address,
        min_amount: config.amount,
        network: config.network,
        token_type: config.tokenType.toUpperCase(),
        resource: config.resource || c.req.path,
        method: c.req.method,
      };

      const response = await fetch(\`\${facilitatorUrl}/api/v1/settle\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settleRequest),
      });

      const result = (await response.json()) as SettleResponse;

      if (!result.success) {
        return c.json(
          {
            error: 'Payment verification failed',
            reason: result.error || 'Unknown error',
          },
          402
        );
      }

      // Store payment info in context for handler to use
      c.set('payment', {
        txId: result.tx_id,
        status: result.status,
        sender: result.sender_address,
        recipient: result.recipient_address,
        amount: BigInt(result.amount || 0),
      });

      await next();
    } catch (error) {
      return c.json(
        {
          error: 'Payment processing error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  };
}
`;
}

function getWranglerTemplate(projectName: string, network: string, facilitatorUrl: string): string {
  return `{
  "name": "${projectName}",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-14",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "NETWORK": "${network}",
    "FACILITATOR_URL": "${facilitatorUrl}"
  },
  "env": {
    "production": {
      "vars": {
        "NETWORK": "mainnet"
      }
    }
  }
}
`;
}

function getPackageJsonTemplate(projectName: string): string {
  return `{
  "name": "${projectName}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "wrangler": "set -a && . ./.env && set +a && wrangler",
    "dev": "npm run wrangler -- dev",
    "deploy": "npm run wrangler -- deploy",
    "deploy:dry": "npm run wrangler -- deploy --dry-run",
    "deploy:production": "npm run wrangler -- deploy --env production",
    "tail": "npm run wrangler -- tail"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250109.0",
    "typescript": "^5.7.0",
    "wrangler": "^4.5.0"
  }
}
`;
}

function getTsconfigTemplate(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
`;
}

function getEnvExampleTemplate(recipientAddress: string): string {
  return `# Cloudflare credentials
CLOUDFLARE_API_TOKEN=your-api-token-here
CLOUDFLARE_ACCOUNT_ID=your-account-id-here

# x402 recipient address (set via wrangler secret)
# wrangler secret put RECIPIENT_ADDRESS
# Value: ${recipientAddress}
`;
}

function getGitignoreTemplate(): string {
  return `node_modules/
dist/
.env
.dev.vars
.wrangler/
`;
}

function getReadmeTemplate(
  projectName: string,
  endpoints: EndpointConfig[],
  recipientAddress: string
): string {
  const tokenList = generateTokenList(endpoints);
  const endpointDocs = generateEndpointDocs(endpoints);

  return `# ${projectName}

x402-enabled API endpoints on Cloudflare Workers.

## Payment Tokens

This API accepts payments in:
${tokenList}

## Recipient Address

Payments are sent to: \`${recipientAddress}\`

## Endpoints

### GET /health
- **Description:** Health check endpoint
- **Cost:** Free
- **Payment Required:** No

${endpointDocs}

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Create \`.env\` file from \`.env.example\`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Add your Cloudflare credentials to \`.env\`

4. Set the recipient address as a secret:
   \`\`\`bash
   npm run wrangler -- secret put RECIPIENT_ADDRESS
   # Enter: ${recipientAddress}
   \`\`\`

## Local Development

\`\`\`bash
npm run dev
\`\`\`

The server will start at http://localhost:8787

## Deploy

\`\`\`bash
# Dry run first
npm run deploy:dry

# Deploy to staging
npm run deploy

# Deploy to production
npm run deploy:production
\`\`\`

## x402 Payment Flow

1. Client makes request without payment header
2. Server returns HTTP 402 with payment requirements:
   \`\`\`json
   {
     "maxAmountRequired": "1000",
     "resource": "/api/endpoint",
     "payTo": "${recipientAddress}",
     "network": "testnet",
     "tokenType": "STX"
   }
   \`\`\`
3. Client signs payment transaction (does NOT broadcast)
4. Client retries request with \`X-PAYMENT\` header containing signed tx
5. Server verifies and settles payment via facilitator
6. Server returns actual response

## Testing with curl

\`\`\`bash
# Health check (free)
curl http://localhost:8787/health

# Protected endpoint (returns 402)
curl http://localhost:8787${endpoints[0]?.path || "/api/endpoint"}
\`\`\`

---

Generated with stx402-agent scaffold tool.
`;
}

// =============================================================================
// MAIN SCAFFOLD FUNCTION
// =============================================================================

export async function scaffoldProject(config: ScaffoldConfig): Promise<ScaffoldResult> {
  const { outputDir, projectName, endpoints, recipientAddress, network, facilitatorUrl } = config;

  // Validate output directory exists
  try {
    const stat = await fs.stat(outputDir);
    if (!stat.isDirectory()) {
      throw new Error(`Output path is not a directory: ${outputDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Output directory does not exist: ${outputDir}`);
    }
    throw error;
  }

  const projectPath = path.join(outputDir, projectName);
  const srcPath = path.join(projectPath, "src");

  // Create project directory structure
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(srcPath, { recursive: true });

  const filesCreated: string[] = [];

  // Generate and write files
  const files: Array<{ name: string; content: string }> = [
    { name: "src/index.ts", content: getIndexTemplate(endpoints) },
    { name: "src/x402-middleware.ts", content: getMiddlewareTemplate() },
    { name: "wrangler.jsonc", content: getWranglerTemplate(projectName, network, facilitatorUrl) },
    { name: "package.json", content: getPackageJsonTemplate(projectName) },
    { name: "tsconfig.json", content: getTsconfigTemplate() },
    { name: ".env.example", content: getEnvExampleTemplate(recipientAddress) },
    { name: ".gitignore", content: getGitignoreTemplate() },
    { name: "README.md", content: getReadmeTemplate(projectName, endpoints, recipientAddress) },
  ];

  for (const file of files) {
    const filePath = path.join(projectPath, file.name);
    await fs.writeFile(filePath, file.content, "utf-8");
    filesCreated.push(file.name);
  }

  return {
    projectPath,
    filesCreated,
    nextSteps: [
      `cd ${projectPath}`,
      "npm install",
      "cp .env.example .env",
      "# Add your Cloudflare credentials to .env",
      `npm run wrangler -- secret put RECIPIENT_ADDRESS (enter: ${recipientAddress})`,
      "npm run dev",
    ],
  };
}

// =============================================================================
// AI ENDPOINT TEMPLATES (OpenRouter)
// =============================================================================

const AI_TYPE_CONFIGS: Record<string, { systemPrompt: string; description: string }> = {
  chat: {
    systemPrompt: "You are a helpful AI assistant.",
    description: "Chat with an AI assistant",
  },
  completion: {
    systemPrompt: "You are a creative writing assistant. Complete the given text naturally.",
    description: "AI text completion",
  },
  summarize: {
    systemPrompt:
      "You are a summarization expert. Provide concise summaries of the given text, capturing the key points.",
    description: "Summarize text using AI",
  },
  translate: {
    systemPrompt:
      "You are a professional translator. Translate the given text accurately while preserving meaning and tone.",
    description: "Translate text using AI",
  },
  custom: {
    systemPrompt: "You are a helpful AI assistant.",
    description: "Custom AI endpoint",
  },
};

function generateAIEndpointCode(endpoints: AIEndpointConfig[], defaultModel: string): string {
  return endpoints
    .map((ep) => {
      const amountSmallest = toSmallestUnit(ep.amount, ep.tokenType);
      const config = AI_TYPE_CONFIGS[ep.aiType];
      const systemPrompt = ep.systemPrompt || config.systemPrompt;
      const model = ep.model || defaultModel;

      return `
// ${ep.description}
app.post('${ep.path}',
  x402Middleware({
    amount: '${amountSmallest}',
    address: env.RECIPIENT_ADDRESS,
    network: env.NETWORK as 'mainnet' | 'testnet',
    tokenType: '${ep.tokenType}',
    facilitatorUrl: env.FACILITATOR_URL,
  }),
  async (c) => {
    const payment = c.get('payment');
    const body = await c.req.json<{ prompt?: string; message?: string; text?: string; targetLanguage?: string }>();
    const userInput = body.prompt || body.message || body.text || '';

    if (!userInput) {
      return c.json({ error: 'Missing required field: prompt, message, or text' }, 400);
    }

    const result = await callOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
      model: '${model}',
      systemPrompt: \`${systemPrompt.replace(/`/g, "\\`")}\`,
      userMessage: ${ep.aiType === "translate" ? "`Translate to ${body.targetLanguage || 'English'}: ${userInput}`" : "userInput"},
    });

    return c.json({
      result: result.content,
      model: result.model,
      usage: result.usage,
      txId: payment?.txId,
    });
  }
);`;
    })
    .join("\n");
}

function generateAIEndpointDocs(endpoints: AIEndpointConfig[]): string {
  return endpoints
    .map((ep) => {
      const inputField =
        ep.aiType === "translate" ? "text, targetLanguage (optional)" : "prompt or message or text";
      return `### POST ${ep.path}
- **Description:** ${ep.description}
- **Cost:** ${ep.amount} ${ep.tokenType}
- **AI Type:** ${ep.aiType}
- **Input:** \`{ ${inputField} }\`
- **Payment Required:** Yes`;
    })
    .join("\n\n");
}

function getAIIndexTemplate(endpoints: AIEndpointConfig[], defaultModel: string): string {
  const endpointCode = generateAIEndpointCode(endpoints, defaultModel);
  return `import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { x402Middleware } from './x402-middleware';
import { callOpenRouter } from './openrouter';

type Bindings = {
  RECIPIENT_ADDRESS: string;
  NETWORK: string;
  FACILITATOR_URL: string;
  OPENROUTER_API_KEY: string;
};

type Variables = {
  payment?: {
    txId: string;
    status: string;
    sender: string;
    recipient: string;
    amount: bigint;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors());

// Health check (free)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// x402-protected AI endpoints
app.use('*', async (c, next) => {
  // Make env available to middleware
  const env = c.env;
  (globalThis as Record<string, unknown>).__env = env;
  await next();
});

const env = {
  get RECIPIENT_ADDRESS() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.RECIPIENT_ADDRESS || '';
  },
  get NETWORK() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.NETWORK || 'testnet';
  },
  get FACILITATOR_URL() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.FACILITATOR_URL || '';
  },
  get OPENROUTER_API_KEY() {
    return ((globalThis as Record<string, unknown>).__env as Bindings)?.OPENROUTER_API_KEY || '';
  },
};
${endpointCode}

export default app;
`;
}

function getOpenRouterTemplate(): string {
  return `/**
 * OpenRouter API Client
 * https://openrouter.ai/docs
 */

export interface OpenRouterRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface OpenRouterAPIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callOpenRouter(request: OpenRouterRequest): Promise<OpenRouterResponse> {
  const {
    apiKey,
    model,
    systemPrompt,
    userMessage,
    maxTokens = 1024,
    temperature = 0.7,
  } = request;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${apiKey}\`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://x402stacks.xyz',
      'X-Title': 'x402 AI Endpoint',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(\`OpenRouter API error: \${response.status} - \${error}\`);
  }

  const data = (await response.json()) as OpenRouterAPIResponse;

  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}
`;
}

function getAIPackageJsonTemplate(projectName: string): string {
  return `{
  "name": "${projectName}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "wrangler": "set -a && . ./.env && set +a && wrangler",
    "dev": "npm run wrangler -- dev",
    "deploy": "npm run wrangler -- deploy",
    "deploy:dry": "npm run wrangler -- deploy --dry-run",
    "deploy:production": "npm run wrangler -- deploy --env production",
    "tail": "npm run wrangler -- tail"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250109.0",
    "typescript": "^5.7.0",
    "wrangler": "^4.5.0"
  }
}
`;
}

function getAIEnvExampleTemplate(recipientAddress: string): string {
  return `# Cloudflare credentials
CLOUDFLARE_API_TOKEN=your-api-token-here
CLOUDFLARE_ACCOUNT_ID=your-account-id-here

# x402 recipient address (set via wrangler secret)
# wrangler secret put RECIPIENT_ADDRESS
# Value: ${recipientAddress}

# OpenRouter API key (set via wrangler secret)
# Get your key at https://openrouter.ai/keys
# wrangler secret put OPENROUTER_API_KEY
`;
}

function getAIReadmeTemplate(
  projectName: string,
  endpoints: AIEndpointConfig[],
  recipientAddress: string,
  defaultModel: string
): string {
  const tokenList = [...new Set(endpoints.map((ep) => `- ${ep.tokenType}`))].join("\n");
  const endpointDocs = generateAIEndpointDocs(endpoints);

  return `# ${projectName}

x402-enabled AI API endpoints on Cloudflare Workers, powered by OpenRouter.

## AI Provider

This API uses [OpenRouter](https://openrouter.ai) to access AI models.
Default model: \`${defaultModel}\`

## Payment Tokens

This API accepts payments in:
${tokenList}

## Recipient Address

Payments are sent to: \`${recipientAddress}\`

## Endpoints

### GET /health
- **Description:** Health check endpoint
- **Cost:** Free
- **Payment Required:** No

${endpointDocs}

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Create \`.env\` file from \`.env.example\`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Add your Cloudflare credentials to \`.env\`

4. Set secrets:
   \`\`\`bash
   # Recipient address for payments
   npm run wrangler -- secret put RECIPIENT_ADDRESS
   # Enter: ${recipientAddress}

   # OpenRouter API key (get from https://openrouter.ai/keys)
   npm run wrangler -- secret put OPENROUTER_API_KEY
   \`\`\`

## Local Development

For local development, create a \`.dev.vars\` file:
\`\`\`
RECIPIENT_ADDRESS=${recipientAddress}
OPENROUTER_API_KEY=your-openrouter-key
\`\`\`

Then run:
\`\`\`bash
npm run dev
\`\`\`

The server will start at http://localhost:8787

## Deploy

\`\`\`bash
# Dry run first
npm run deploy:dry

# Deploy to staging
npm run deploy

# Deploy to production
npm run deploy:production
\`\`\`

## Example Usage

\`\`\`bash
# Health check (free)
curl http://localhost:8787/health

# AI endpoint (returns 402 without payment)
curl -X POST http://localhost:8787${endpoints[0]?.path || "/api/chat"} \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Hello, how are you?"}'
\`\`\`

## x402 Payment Flow

1. Client makes request without payment header
2. Server returns HTTP 402 with payment requirements
3. Client signs payment transaction (does NOT broadcast)
4. Client retries request with \`X-PAYMENT\` header containing signed tx
5. Server verifies and settles payment via facilitator
6. Server calls OpenRouter API and returns AI response

## OpenRouter Models

You can use any model available on OpenRouter. Popular options:
- \`anthropic/claude-3.5-sonnet\` - Best for complex tasks
- \`anthropic/claude-3-haiku\` - Fast and affordable
- \`openai/gpt-4o\` - OpenAI's latest
- \`openai/gpt-4o-mini\` - Fast and cheap
- \`meta-llama/llama-3.1-70b-instruct\` - Open source
- \`google/gemini-pro-1.5\` - Google's model

See all models: https://openrouter.ai/models

---

Generated with stx402-agent scaffold tool.
`;
}

// =============================================================================
// AI SCAFFOLD FUNCTION
// =============================================================================

export async function scaffoldAIProject(config: AIScaffoldConfig): Promise<ScaffoldResult> {
  const {
    outputDir,
    projectName,
    endpoints,
    recipientAddress,
    network,
    facilitatorUrl,
    defaultModel,
  } = config;

  // Validate output directory exists
  try {
    const stat = await fs.stat(outputDir);
    if (!stat.isDirectory()) {
      throw new Error(`Output path is not a directory: ${outputDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Output directory does not exist: ${outputDir}`);
    }
    throw error;
  }

  const projectPath = path.join(outputDir, projectName);
  const srcPath = path.join(projectPath, "src");

  // Create project directory structure
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(srcPath, { recursive: true });

  const filesCreated: string[] = [];

  // Generate and write files
  const files: Array<{ name: string; content: string }> = [
    { name: "src/index.ts", content: getAIIndexTemplate(endpoints, defaultModel) },
    { name: "src/x402-middleware.ts", content: getMiddlewareTemplate() },
    { name: "src/openrouter.ts", content: getOpenRouterTemplate() },
    { name: "wrangler.jsonc", content: getWranglerTemplate(projectName, network, facilitatorUrl) },
    { name: "package.json", content: getAIPackageJsonTemplate(projectName) },
    { name: "tsconfig.json", content: getTsconfigTemplate() },
    { name: ".env.example", content: getAIEnvExampleTemplate(recipientAddress) },
    { name: ".gitignore", content: getGitignoreTemplate() },
    {
      name: "README.md",
      content: getAIReadmeTemplate(projectName, endpoints, recipientAddress, defaultModel),
    },
  ];

  for (const file of files) {
    const filePath = path.join(projectPath, file.name);
    await fs.writeFile(filePath, file.content, "utf-8");
    filesCreated.push(file.name);
  }

  return {
    projectPath,
    filesCreated,
    nextSteps: [
      `cd ${projectPath}`,
      "npm install",
      "cp .env.example .env",
      "# Add your Cloudflare credentials to .env",
      `npm run wrangler -- secret put RECIPIENT_ADDRESS (enter: ${recipientAddress})`,
      "npm run wrangler -- secret put OPENROUTER_API_KEY (get from https://openrouter.ai/keys)",
      "# For local dev, create .dev.vars with RECIPIENT_ADDRESS and OPENROUTER_API_KEY",
      "npm run dev",
    ],
  };
}
