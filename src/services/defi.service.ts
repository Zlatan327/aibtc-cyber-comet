import {
  ClarityValue,
  uintCV,
  contractPrincipalCV,
  cvToJSON,
  hexToCV,
  PostConditionMode,
  Pc,
  principalCV,
  broadcastTransaction,
  makeContractCall,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import { AlexSDK, Currency, type TokenInfo } from "alex-sdk";
import { HiroApiService, getHiroApi } from "./hiro-api.js";
import {
  getAlexContracts,
  getZestContracts,
  parseContractId,
  type Network,
} from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";

// ============================================================================
// Types
// ============================================================================

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceImpact?: string;
  route: string[];
}

export interface PoolInfo {
  poolId: string;
  tokenX: string;
  tokenY: string;
  reserveX: string;
  reserveY: string;
  totalShares?: string;
}

export interface PoolListing {
  id: number;
  tokenX: string;
  tokenY: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  factor: string;
}

export interface ZestMarketInfo {
  asset: string;
  totalSupply: string;
  totalBorrow: string;
  supplyRate: string;
  borrowRate: string;
  utilizationRate: string;
}

export interface ZestUserPosition {
  asset: string;
  supplied: string;
  borrowed: string;
  healthFactor?: string;
}

export interface ZestAsset {
  contractId: string;
  symbol: string;
  name: string;
  decimals?: number;
}

// ============================================================================
// ALEX DEX Service (using alex-sdk)
// ============================================================================

export class AlexDexService {
  private sdk: AlexSDK;
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getAlexContracts>;
  private tokenInfoCache: TokenInfo[] | null = null;

  constructor(private network: Network) {
    this.sdk = new AlexSDK();
    this.hiro = getHiroApi(network);
    this.contracts = getAlexContracts(network);
  }

  private ensureMainnet(): void {
    if (this.network !== "mainnet") {
      throw new Error("ALEX DEX is only available on mainnet");
    }
  }

  /**
   * Get all swappable token info from SDK (cached)
   */
  private async getTokenInfos(): Promise<TokenInfo[]> {
    if (!this.tokenInfoCache) {
      this.tokenInfoCache = await this.sdk.fetchSwappableCurrency();
    }
    return this.tokenInfoCache;
  }

  /**
   * Convert a token identifier (contract ID or symbol) to an ALEX SDK Currency
   */
  private async resolveCurrency(tokenId: string): Promise<Currency> {
    // Handle common aliases
    const normalizedId = tokenId.toUpperCase();
    if (normalizedId === "STX" || normalizedId === "WSTX") {
      return Currency.STX;
    }
    if (normalizedId === "ALEX") {
      return Currency.ALEX;
    }

    // Fetch available tokens from SDK
    const tokens = await this.getTokenInfos();

    for (const token of tokens) {
      // Match by contract ID (strip the ::asset suffix for comparison)
      const wrapContract = token.wrapToken.split("::")[0];
      const underlyingContract = token.underlyingToken.split("::")[0];

      if (wrapContract === tokenId || underlyingContract === tokenId) {
        return token.id;
      }

      // Match by symbol (case-insensitive)
      if (token.name.toLowerCase() === tokenId.toLowerCase()) {
        return token.id;
      }
    }

    throw new Error(`Unknown token: ${tokenId}. Use alex_list_pools to see available tokens.`);
  }

  /**
   * Get a swap quote for token X to token Y using ALEX SDK
   */
  async getSwapQuote(
    tokenX: string,
    tokenY: string,
    amountIn: bigint,
    _senderAddress: string
  ): Promise<SwapQuote> {
    this.ensureMainnet();

    const currencyX = await this.resolveCurrency(tokenX);
    const currencyY = await this.resolveCurrency(tokenY);

    const amountOut = await this.sdk.getAmountTo(currencyX, amountIn, currencyY);

    // Get route info
    const routeCurrencies = await this.sdk.getRouter(currencyX, currencyY);

    return {
      tokenIn: tokenX,
      tokenOut: tokenY,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      route: routeCurrencies.map(c => c.toString()),
    };
  }

  /**
   * Execute a swap using ALEX SDK
   * The SDK handles STX wrapping internally
   */
  async swap(
    account: Account,
    tokenX: string,
    tokenY: string,
    amountIn: bigint,
    minAmountOut: bigint
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const currencyX = await this.resolveCurrency(tokenX);
    const currencyY = await this.resolveCurrency(tokenY);

    // Use SDK to build the swap transaction parameters
    const txParams = await this.sdk.runSwap(
      account.address,
      currencyX,
      currencyY,
      amountIn,
      minAmountOut
    );

    // Use makeContractCall to build and sign the transaction
    const transaction = await makeContractCall({
      contractAddress: txParams.contractAddress,
      contractName: txParams.contractName,
      functionName: txParams.functionName,
      functionArgs: txParams.functionArgs,
      postConditions: txParams.postConditions,
      senderKey: account.privateKey,
      network: STACKS_MAINNET,
      postConditionMode: PostConditionMode.Deny,
    });

    const broadcastResult = await broadcastTransaction({
      transaction,
      network: STACKS_MAINNET
    });

    if ("error" in broadcastResult) {
      throw new Error(`Broadcast failed: ${broadcastResult.error} - ${broadcastResult.reason}`);
    }

    return {
      txid: broadcastResult.txid,
      rawTx: Buffer.from(transaction.serialize()).toString("hex"),
    };
  }

  /**
   * Get pool information
   */
  async getPoolInfo(
    tokenX: string,
    tokenY: string,
    senderAddress: string
  ): Promise<PoolInfo | null> {
    this.ensureMainnet();

    if (!this.contracts) return null;

    try {
      const result = await this.hiro.callReadOnlyFunction(
        this.contracts.ammPool,
        "get-pool-details",
        [
          contractPrincipalCV(...parseContractIdTuple(tokenX)),
          contractPrincipalCV(...parseContractIdTuple(tokenY)),
          uintCV(100000000n), // factor
        ],
        senderAddress
      );

      if (!result.okay || !result.result) {
        return null;
      }

      const decoded = cvToJSON(hexToCV(result.result));

      // Parse the pool details response
      if (decoded.value && typeof decoded.value === "object") {
        return {
          poolId: `${tokenX}-${tokenY}`,
          tokenX,
          tokenY,
          reserveX: decoded.value["balance-x"]?.value || "0",
          reserveY: decoded.value["balance-y"]?.value || "0",
          totalShares: decoded.value["total-supply"]?.value,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * List all available pools on ALEX DEX
   * Uses SDK to fetch swappable currencies
   */
  async listPools(limit: number = 50): Promise<PoolListing[]> {
    this.ensureMainnet();

    if (!this.contracts) return [];

    const pools: PoolListing[] = [];

    for (let i = 1; i <= limit; i++) {
      try {
        const result = await this.hiro.callReadOnlyFunction(
          this.contracts.ammPool,
          "get-pool-details-by-id",
          [uintCV(BigInt(i))],
          this.contracts.ammPool.split(".")[0]
        );

        if (!result.okay || !result.result) {
          break;
        }

        const decoded = cvToJSON(hexToCV(result.result));
        if (!decoded.success || !decoded.value?.value) {
          break;
        }

        const pool = decoded.value.value;
        const tokenX = pool["token-x"]?.value || "";
        const tokenY = pool["token-y"]?.value || "";
        const factor = pool["factor"]?.value || "0";

        // Extract symbol from contract name
        const tokenXSymbol = tokenX.split(".")[1]?.replace("token-", "") || tokenX;
        const tokenYSymbol = tokenY.split(".")[1]?.replace("token-", "") || tokenY;

        pools.push({
          id: i,
          tokenX,
          tokenY,
          tokenXSymbol,
          tokenYSymbol,
          factor,
        });
      } catch {
        // No more pools
        break;
      }
    }

    return pools;
  }

  /**
   * Get all swappable currencies from ALEX SDK
   */
  async getSwappableCurrencies(): Promise<TokenInfo[]> {
    this.ensureMainnet();
    return await this.getTokenInfos();
  }

  /**
   * Get latest prices from ALEX SDK
   */
  async getLatestPrices(): Promise<Record<string, number>> {
    this.ensureMainnet();
    const prices = await this.sdk.getLatestPrices();
    // Convert to regular object with string keys
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(prices)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}

// ============================================================================
// Zest Protocol Service
// ============================================================================

export class ZestProtocolService {
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getZestContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.contracts = getZestContracts(network);
  }

  private ensureMainnet(): void {
    if (!this.contracts) {
      throw new Error("Zest Protocol is only available on mainnet");
    }
  }

  /**
   * Get all supported assets from Zest Protocol
   * Calls the get-assets() read-only function on the pool-borrow contract
   * Then fetches metadata for each asset from the Hiro API
   */
  async getAssets(): Promise<ZestAsset[]> {
    this.ensureMainnet();

    const result = await this.hiro.callReadOnlyFunction(
      this.contracts!.poolBorrow,
      "get-assets",
      [],
      this.contracts!.poolBorrow.split(".")[0] // Use deployer as sender
    );

    if (!result.okay || !result.result) {
      throw new Error(`Failed to get Zest assets: ${result.cause || "Unknown error"}`);
    }

    const decoded = cvToJSON(hexToCV(result.result));

    if (!decoded.value || !Array.isArray(decoded.value)) {
      return [];
    }

    // Fetch metadata for each asset from Hiro API
    const assets: ZestAsset[] = await Promise.all(
      decoded.value.map(async (item: { value: string }) => {
        const contractId = item.value;

        // Try to get token metadata from Hiro API
        const metadata = await this.hiro.getTokenMetadata(contractId);

        if (metadata) {
          return {
            contractId,
            symbol: metadata.symbol,
            name: metadata.name,
            decimals: metadata.decimals,
          };
        }

        // Fallback: extract from contract name
        const contractName = contractId.split(".")[1] || contractId;
        return {
          contractId,
          symbol: contractName.replace("token-", "").replace("-token", "").toUpperCase(),
          name: contractName,
        };
      })
    );

    return assets;
  }

  /**
   * Resolve an asset symbol or contract ID to a full contract ID
   */
  async resolveAsset(assetOrSymbol: string): Promise<string> {
    // If it looks like a contract ID, return as-is
    if (assetOrSymbol.includes(".")) {
      return assetOrSymbol;
    }

    // Look up by symbol
    const assets = await this.getAssets();
    const match = assets.find(
      (a) => a.symbol.toLowerCase() === assetOrSymbol.toLowerCase()
    );

    if (!match) {
      throw new Error(
        `Unknown asset symbol: ${assetOrSymbol}. Use zest_list_assets to see available assets.`
      );
    }

    return match.contractId;
  }

  /**
   * Get user's reserve/position data for an asset
   */
  async getUserPosition(
    asset: string,
    userAddress: string
  ): Promise<ZestUserPosition | null> {
    this.ensureMainnet();

    try {
      const result = await this.hiro.callReadOnlyFunction(
        this.contracts!.poolReserve,
        "get-user-reserve-data",
        [
          principalCV(userAddress),
          contractPrincipalCV(...parseContractIdTuple(asset)),
        ],
        userAddress
      );

      if (!result.okay || !result.result) {
        return null;
      }

      const decoded = cvToJSON(hexToCV(result.result));

      if (decoded.value && typeof decoded.value === "object") {
        return {
          asset,
          supplied: decoded.value["current-a-token-balance"]?.value || "0",
          borrowed: decoded.value["current-variable-debt"]?.value || "0",
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Supply assets to Zest lending pool
   */
  async supply(
    account: Account,
    asset: string,
    amount: bigint,
    onBehalfOf?: string
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const { address, name } = parseContractId(this.contracts!.poolBorrow);

    const functionArgs: ClarityValue[] = [
      contractPrincipalCV(...parseContractIdTuple(asset)),
      uintCV(amount),
      principalCV(onBehalfOf || account.address),
    ];

    // Post-condition: user will send the asset
    const postConditions = [
      Pc.principal(account.address)
        .willSendEq(amount)
        .ft(asset as `${string}.${string}`, extractAssetName(asset)),
    ];

    return callContract(account, {
      contractAddress: address,
      contractName: name,
      functionName: "supply",
      functionArgs,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    });
  }

  /**
   * Withdraw assets from Zest lending pool
   */
  async withdraw(
    account: Account,
    asset: string,
    amount: bigint
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const { address, name } = parseContractId(this.contracts!.poolBorrow);

    const functionArgs: ClarityValue[] = [
      contractPrincipalCV(...parseContractIdTuple(asset)),
      uintCV(amount),
      principalCV(account.address),
    ];

    return callContract(account, {
      contractAddress: address,
      contractName: name,
      functionName: "withdraw",
      functionArgs,
      postConditionMode: PostConditionMode.Allow, // Allow receiving tokens
    });
  }

  /**
   * Borrow assets from Zest lending pool
   */
  async borrow(
    account: Account,
    asset: string,
    amount: bigint
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const { address, name } = parseContractId(this.contracts!.poolBorrow);

    const functionArgs: ClarityValue[] = [
      contractPrincipalCV(...parseContractIdTuple(asset)),
      uintCV(amount),
      principalCV(account.address),
    ];

    return callContract(account, {
      contractAddress: address,
      contractName: name,
      functionName: "borrow",
      functionArgs,
      postConditionMode: PostConditionMode.Allow, // Allow receiving borrowed tokens
    });
  }

  /**
   * Repay borrowed assets
   */
  async repay(
    account: Account,
    asset: string,
    amount: bigint,
    onBehalfOf?: string
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const { address, name } = parseContractId(this.contracts!.poolBorrow);

    const functionArgs: ClarityValue[] = [
      contractPrincipalCV(...parseContractIdTuple(asset)),
      uintCV(amount),
      principalCV(onBehalfOf || account.address),
    ];

    // Post-condition: user will send the asset to repay
    const postConditions = [
      Pc.principal(account.address)
        .willSendLte(amount)
        .ft(asset as `${string}.${string}`, extractAssetName(asset)),
    ];

    return callContract(account, {
      contractAddress: address,
      contractName: name,
      functionName: "repay",
      functionArgs,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseContractIdTuple(contractId: string): [string, string] {
  const { address, name } = parseContractId(contractId);
  return [address, name];
}

function extractAssetName(contractId: string): string {
  const { name } = parseContractId(contractId);
  return name;
}

function extractUintValue(decoded: unknown): string {
  if (typeof decoded === "object" && decoded !== null) {
    const obj = decoded as Record<string, unknown>;

    // Check if this is an error response (success: false)
    if ("success" in obj && obj.success === false) {
      const errorCode = obj.value && typeof obj.value === "object"
        ? (obj.value as Record<string, unknown>).value
        : obj.value;
      throw new Error(`Contract returned error: ${errorCode}`);
    }

    // Handle ok response
    if ("value" in obj && typeof obj.value === "object" && obj.value !== null) {
      const inner = obj.value as Record<string, unknown>;
      if ("value" in inner) {
        return String(inner.value);
      }
    }
    if ("value" in obj) {
      return String(obj.value);
    }
  }
  return "0";
}

// ============================================================================
// Service Singletons
// ============================================================================

let _alexServiceInstance: AlexDexService | null = null;
let _zestServiceInstance: ZestProtocolService | null = null;

export function getAlexDexService(network: Network): AlexDexService {
  if (!_alexServiceInstance || _alexServiceInstance["network"] !== network) {
    _alexServiceInstance = new AlexDexService(network);
  }
  return _alexServiceInstance;
}

export function getZestProtocolService(network: Network): ZestProtocolService {
  if (!_zestServiceInstance || _zestServiceInstance["network"] !== network) {
    _zestServiceInstance = new ZestProtocolService(network);
  }
  return _zestServiceInstance;
}
