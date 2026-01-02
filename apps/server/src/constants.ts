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
  239: "Neon",
  747474: "Form",
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
