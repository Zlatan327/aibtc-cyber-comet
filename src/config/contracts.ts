import { Network } from "./networks.js";

/**
 * Known contract addresses for mainnet
 */
export const MAINNET_CONTRACTS = {
  // sBTC
  SBTC_TOKEN: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-token",
  SBTC_DEPOSIT: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-deposit",
  SBTC_REGISTRY: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-registry",

  // Stablecoins
  USDCX: "SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-usdcx",

  // BNS
  BNS: "SP000000000000000000002Q6VF78.bns",

  // Stacking
  POX_4: "SP000000000000000000002Q6VF78.pox-4",

  // ALEX DEX
  ALEX_AMM_POOL: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1",
  ALEX_SWAP_HELPER: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.swap-helper-v1-03",
  ALEX_SWAP_BRIDGED: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.swap-helper-bridged",
  ALEX_VAULT: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.alex-vault",
  ALEX_TOKEN: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-alex",
  ALEX_WSTX: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-wstx-v2",

  // Zest Protocol
  ZEST_POOL_BORROW: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-3",
  ZEST_BORROW_HELPER: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5",
  ZEST_POOL_RESERVE: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve",

  // Zest Supported Assets
  STSTX: "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token",
  AEUSDC: "SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc",
} as const;

/**
 * Known contract addresses for testnet
 */
export const TESTNET_CONTRACTS = {
  // sBTC (testnet)
  SBTC_TOKEN: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
  SBTC_DEPOSIT: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-deposit",
  SBTC_REGISTRY: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-registry",

  // Stablecoins
  USDCX: "ST2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-usdcx",

  // BNS
  BNS: "ST000000000000000000002AMW42H.bns",

  // Stacking
  POX_4: "ST000000000000000000002AMW42H.pox-4",
} as const;

/**
 * Get contract addresses for the specified network
 */
export function getContracts(network: Network) {
  return network === "mainnet" ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
}

/**
 * Parse a contract identifier into address and name
 */
export function parseContractId(contractId: string): { address: string; name: string } {
  const [address, name] = contractId.split(".");
  if (!address || !name) {
    throw new Error(`Invalid contract ID: ${contractId}`);
  }
  return { address, name };
}

/**
 * Common token contract IDs
 */
export const WELL_KNOWN_TOKENS = {
  mainnet: {
    STX: "native",
    sBTC: MAINNET_CONTRACTS.SBTC_TOKEN,
    USDCx: MAINNET_CONTRACTS.USDCX,
    ALEX: MAINNET_CONTRACTS.ALEX_TOKEN,
    wSTX: MAINNET_CONTRACTS.ALEX_WSTX,
  },
  testnet: {
    STX: "native",
    sBTC: TESTNET_CONTRACTS.SBTC_TOKEN,
    USDCx: TESTNET_CONTRACTS.USDCX,
  },
} as const;

/**
 * Get ALEX DEX contract addresses for the network
 */
export function getAlexContracts(network: Network) {
  if (network === "mainnet") {
    return {
      ammPool: MAINNET_CONTRACTS.ALEX_AMM_POOL,
      swapHelper: MAINNET_CONTRACTS.ALEX_SWAP_HELPER,
      vault: MAINNET_CONTRACTS.ALEX_VAULT,
      wstx: MAINNET_CONTRACTS.ALEX_WSTX,
    };
  }
  // ALEX is mainnet-only currently
  return null;
}

/**
 * Get Zest Protocol contract addresses for the network
 */
export function getZestContracts(network: Network) {
  if (network === "mainnet") {
    return {
      poolBorrow: MAINNET_CONTRACTS.ZEST_POOL_BORROW,
      borrowHelper: MAINNET_CONTRACTS.ZEST_BORROW_HELPER,
      poolReserve: MAINNET_CONTRACTS.ZEST_POOL_RESERVE,
    };
  }
  // Zest is mainnet-only currently
  return null;
}

export function getWellKnownTokens(network: Network) {
  return WELL_KNOWN_TOKENS[network];
}
