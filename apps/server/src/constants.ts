/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Chain ID to chain name mapping
 */
export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  80094: "Bera",
  480: "Worldchain",
  98866: "Plume",
  130: "Unichain",
  1868: "Soneium",
  42161: "Arbitrum",
  239: "TAC",
  747474: "Katana",
  137: "Polygon",
  1135: "Lisk",
};

/**
 * Get chain name by ID, with fallback to "Chain {id}"
 */
export function getChainName(chainId: number): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

/**
 * Native gas-token symbol per chainId
 */
const NATIVE_SYMBOLS: Record<number, string> = {
  1: "ETH",
  8453: "ETH",
  80094: "BERA",
  480: "ETH",
  98866: "PLUME",
  130: "ETH",
  1868: "ETH",
  42161: "ETH",
  239: "TAC",
  747474: "ETH",
  137: "POL",
  1135: "ETH",
};

export function getNativeSymbol(chainId: number): string {
  return NATIVE_SYMBOLS[chainId] ?? "ETH";
}

/**
 * Per-chain default minimum gas balance (in wei of the chain's native token)
 * used to seed `chain_config.min_gas_wei` when a chain is first created.
 */
export const DEFAULT_MIN_GAS_WEI: Record<number, bigint> = {
  1: 50_000_000_000_000_000n, // Ethereum: 0.05 ETH
  8453: 5_000_000_000_000_000n, // Base: 0.005 ETH
  80094: 500_000_000_000_000_000n, // Berachain: 0.5 BERA — TODO: confirm
  480: 5_000_000_000_000_000n, // Worldchain: 0.005 ETH
  98866: 500_000_000_000_000_000n, // Plume: 0.5 PLUME — TODO: confirm
  130: 5_000_000_000_000_000n, // Unichain: 0.005 ETH
  1868: 5_000_000_000_000_000n, // Soneium: 0.005 ETH
  42161: 5_000_000_000_000_000n, // Arbitrum: 0.005 ETH
  239: 500_000_000_000_000_000n, // TAC: 0.5 native — TODO: confirm
  747474: 5_000_000_000_000_000n, // Katana: 0.005 ETH
  137: 20_000_000_000_000_000_000n, // Polygon: 20 POL
  1135: 1_000_000_000_000_000n, // Lisk: 0.001 ETH
};
