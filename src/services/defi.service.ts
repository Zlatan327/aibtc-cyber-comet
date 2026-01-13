import {
  ClarityValue,
  uintCV,
  contractPrincipalCV,
  cvToJSON,
  hexToCV,
  PostConditionMode,
  Pc,
  principalCV,
  noneCV,
} from "@stacks/transactions";
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
// ALEX DEX Service
// ============================================================================

export class AlexDexService {
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getAlexContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.contracts = getAlexContracts(network);
  }

  private ensureMainnet(): void {
    if (!this.contracts) {
      throw new Error("ALEX DEX is only available on mainnet");
    }
  }

  /**
   * Get a swap quote for token X to token Y
   */
  async getSwapQuote(
    tokenX: string,
    tokenY: string,
    amountIn: bigint,
    senderAddress: string
  ): Promise<SwapQuote> {
    this.ensureMainnet();

    // Call get-y-given-x to get the expected output
    const result = await this.hiro.callReadOnlyFunction(
      this.contracts!.ammPool,
      "get-y-given-x",
      [
        contractPrincipalCV(...parseContractIdTuple(tokenX)),
        contractPrincipalCV(...parseContractIdTuple(tokenY)),
        uintCV(100000000n), // factor (1e8)
        uintCV(amountIn),
      ],
      senderAddress
    );

    if (!result.okay || !result.result) {
      throw new Error(`Failed to get swap quote: ${result.cause || "Unknown error"}`);
    }

    const decoded = cvToJSON(hexToCV(result.result));
    const amountOut = extractUintValue(decoded);

    return {
      tokenIn: tokenX,
      tokenOut: tokenY,
      amountIn: amountIn.toString(),
      amountOut: amountOut,
      route: [tokenX, tokenY],
    };
  }

  /**
   * Get a reverse swap quote (how much tokenX needed for amountOut of tokenY)
   */
  async getReverseSwapQuote(
    tokenX: string,
    tokenY: string,
    amountOut: bigint,
    senderAddress: string
  ): Promise<SwapQuote> {
    this.ensureMainnet();

    const result = await this.hiro.callReadOnlyFunction(
      this.contracts!.ammPool,
      "get-x-given-y",
      [
        contractPrincipalCV(...parseContractIdTuple(tokenX)),
        contractPrincipalCV(...parseContractIdTuple(tokenY)),
        uintCV(100000000n), // factor (1e8)
        uintCV(amountOut),
      ],
      senderAddress
    );

    if (!result.okay || !result.result) {
      throw new Error(`Failed to get reverse swap quote: ${result.cause || "Unknown error"}`);
    }

    const decoded = cvToJSON(hexToCV(result.result));
    const amountIn = extractUintValue(decoded);

    return {
      tokenIn: tokenX,
      tokenOut: tokenY,
      amountIn: amountIn,
      amountOut: amountOut.toString(),
      route: [tokenX, tokenY],
    };
  }

  /**
   * Execute a swap using the swap-helper contract
   */
  async swap(
    account: Account,
    tokenX: string,
    tokenY: string,
    amountIn: bigint,
    minAmountOut: bigint
  ): Promise<TransferResult> {
    this.ensureMainnet();

    const { address, name } = parseContractId(this.contracts!.swapHelper);

    // swap-helper automatically determines direction
    const functionArgs: ClarityValue[] = [
      contractPrincipalCV(...parseContractIdTuple(tokenX)),
      contractPrincipalCV(...parseContractIdTuple(tokenY)),
      uintCV(100000000n), // factor (1e8)
      uintCV(amountIn),
      minAmountOut > 0n ? uintCV(minAmountOut) : noneCV(),
    ];

    // Add post-conditions for safety
    const postConditions = [
      Pc.principal(account.address)
        .willSendLte(amountIn)
        .ft(tokenX as `${string}.${string}`, extractAssetName(tokenX)),
    ];

    return callContract(account, {
      contractAddress: address,
      contractName: name,
      functionName: "swap-helper",
      functionArgs,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    });
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

    try {
      const result = await this.hiro.callReadOnlyFunction(
        this.contracts!.ammPool,
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
   * Iterates through pool IDs to discover all trading pairs
   */
  async listPools(limit: number = 50): Promise<PoolListing[]> {
    this.ensureMainnet();

    const pools: PoolListing[] = [];

    for (let i = 1; i <= limit; i++) {
      try {
        const result = await this.hiro.callReadOnlyFunction(
          this.contracts!.ammPool,
          "get-pool-details-by-id",
          [uintCV(BigInt(i))],
          this.contracts!.ammPool.split(".")[0]
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
