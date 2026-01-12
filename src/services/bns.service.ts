import { ClarityValue, bufferCV, uintCV, stringUtf8CV } from "@stacks/transactions";
import { HiroApiService, getHiroApi, BnsName, getBnsV2Api, BnsV2ApiService } from "./hiro-api.js";
import { getContracts, parseContractId, type Network } from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";

// ============================================================================
// Types
// ============================================================================

export interface BnsLookupResult {
  name: string;
  address: string;
  namespace: string;
  expireBlock: number;
  zonefile?: string;
}

export interface BnsNameInfo {
  name: string;
  namespace: string;
  address: string;
  expireBlock: number;
  gracePeriod: number;
  status: string;
  zonefile?: string;
  zonefileHash?: string;
  lastTxId: string;
}

export interface BnsPrice {
  units: string;
  amount: string;
  amountStx: string;
}

// ============================================================================
// BNS Service
// ============================================================================

export class BnsService {
  private hiro: HiroApiService;
  private bnsV2: BnsV2ApiService;
  private contracts: ReturnType<typeof getContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.bnsV2 = getBnsV2Api();
    this.contracts = getContracts(network);
  }

  /**
   * Lookup a BNS name and get the associated address
   * Uses BNS V2 API for .btc names, falls back to Hiro API for other namespaces
   */
  async lookupName(name: string): Promise<BnsLookupResult | null> {
    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    // For .btc names, use BNS V2 API (where most names are registered)
    if (namespace === "btc" || !namespace) {
      try {
        const info = await this.bnsV2.getNameInfo(fullName);
        if (info.status === "active" && info.data.is_valid && !info.data.revoked) {
          return {
            name: fullName,
            address: info.data.owner,
            namespace: info.data.namespace_string || "btc",
            expireBlock: parseInt(info.data.renewal_height, 10),
          };
        }
        return null;
      } catch {
        // Name not found in BNS V2, try Hiro API as fallback (for legacy BNS V1 names)
      }
    }

    // Fallback to Hiro API for other namespaces or legacy V1 names
    try {
      const info = await this.hiro.getBnsNameInfo(fullName);
      return {
        name: fullName,
        address: info.address,
        namespace: namespace || "btc",
        expireBlock: info.expire_block,
        zonefile: info.zonefile,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reverse lookup - get BNS names for an address
   * Combines results from both BNS V2 and Hiro API (V1)
   */
  async reverseLookup(address: string): Promise<string[]> {
    const allNames: string[] = [];

    // Get names from BNS V2
    try {
      const v2Result = await this.bnsV2.getNamesOwnedByAddress(address);
      if (v2Result.names) {
        allNames.push(...v2Result.names.map(n => n.full_name));
      }
    } catch {
      // BNS V2 lookup failed, continue with Hiro API
    }

    // Get names from Hiro API (BNS V1)
    try {
      const v1Result = await this.hiro.getBnsNamesOwnedByAddress(address);
      if (v1Result.names) {
        // Add only names not already in the list
        for (const name of v1Result.names) {
          if (!allNames.includes(name)) {
            allNames.push(name);
          }
        }
      }
    } catch {
      // Hiro API lookup failed
    }

    return allNames;
  }

  /**
   * Get detailed info about a BNS name
   * Uses BNS V2 API for .btc names, falls back to Hiro API
   */
  async getNameInfo(name: string): Promise<BnsNameInfo | null> {
    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    // For .btc names, try BNS V2 first
    if (namespace === "btc" || !namespace) {
      try {
        const info = await this.bnsV2.getNameInfo(fullName);
        if (info.data) {
          return {
            name: fullName,
            namespace: info.data.namespace_string || "btc",
            address: info.data.owner,
            expireBlock: parseInt(info.data.renewal_height, 10),
            gracePeriod: 0, // BNS V2 doesn't have grace period in the same way
            status: info.status,
            lastTxId: "", // Not available in V2 response
          };
        }
      } catch {
        // Name not found in BNS V2, try Hiro API
      }
    }

    // Fallback to Hiro API
    try {
      const info = await this.hiro.getBnsNameInfo(fullName);
      return {
        name: fullName,
        namespace: namespace || "btc",
        address: info.address,
        expireBlock: info.expire_block,
        gracePeriod: info.grace_period,
        status: info.status,
        zonefile: info.zonefile,
        zonefileHash: info.zonefile_hash,
        lastTxId: info.last_txid,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a BNS name is available for registration
   * A name is available if it's not found in either BNS V2 or V1
   */
  async checkAvailability(name: string): Promise<boolean> {
    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;

    // Check BNS V2 first (where most .btc names are registered)
    try {
      const exists = await this.bnsV2.nameExists(fullName);
      if (exists) {
        return false; // Name is taken
      }
    } catch {
      // Error checking BNS V2, continue to check V1
    }

    // Also check Hiro API (BNS V1) for legacy names
    try {
      const info = await this.hiro.getBnsNameInfo(fullName);
      if (info && info.address) {
        return false; // Name is taken in V1
      }
    } catch {
      // Name not found in V1 either - it's available
    }

    return true;
  }

  /**
   * Get the price of a BNS name
   */
  async getPrice(name: string): Promise<BnsPrice | null> {
    try {
      const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
      const [baseName] = fullName.split(".");

      const price = await this.hiro.getBnsNamePrice(baseName);

      const amountMicroStx = price.amount;
      const amountStx = (BigInt(amountMicroStx) / BigInt(1_000_000)).toString();

      return {
        units: price.units,
        amount: amountMicroStx,
        amountStx,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all domains owned by an address
   */
  async getUserDomains(address: string): Promise<string[]> {
    return this.reverseLookup(address);
  }

  /**
   * Resolve a name to an address (convenient wrapper)
   */
  async resolve(name: string): Promise<string | null> {
    const result = await this.lookupName(name);
    return result?.address || null;
  }

  /**
   * Register a new BNS name
   * Note: BNS registration is a multi-step process involving preorder and register
   */
  async preorderName(
    account: Account,
    name: string,
    salt: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    // Create the hashed salted name for preorder
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256")
      .update(Buffer.from(fullName + salt))
      .digest();

    const functionArgs: ClarityValue[] = [
      bufferCV(hash),
      uintCV(0), // STX to burn (registration fee)
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-preorder",
      functionArgs,
    });
  }

  /**
   * Register a name after preorder
   */
  async registerName(
    account: Account,
    name: string,
    salt: string,
    zonefile?: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      bufferCV(Buffer.from(salt)),
      zonefile ? bufferCV(Buffer.from(zonefile)) : bufferCV(Buffer.alloc(0)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-register",
      functionArgs,
    });
  }

  /**
   * Update a name's zonefile
   */
  async updateZonefile(
    account: Account,
    name: string,
    zonefile: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      bufferCV(Buffer.from(zonefile)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-update",
      functionArgs,
    });
  }

  /**
   * Transfer a BNS name to a new owner
   */
  async transferName(
    account: Account,
    name: string,
    newOwner: string,
    zonefile?: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      { type: "principal", value: newOwner } as unknown as ClarityValue,
      zonefile ? bufferCV(Buffer.from(zonefile)) : bufferCV(Buffer.alloc(0)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-transfer",
      functionArgs,
    });
  }

  /**
   * Renew a BNS name
   */
  async renewName(
    account: Account,
    name: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      uintCV(0), // STX to burn (renewal fee)
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-renewal",
      functionArgs,
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

let _bnsServiceInstance: BnsService | null = null;

export function getBnsService(network: Network): BnsService {
  if (!_bnsServiceInstance || _bnsServiceInstance["network"] !== network) {
    _bnsServiceInstance = new BnsService(network);
  }
  return _bnsServiceInstance;
}
