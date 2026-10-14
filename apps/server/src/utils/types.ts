import type { Address, Chain, Hex } from "viem";

import type { MorphoVaultType } from "./vaultsCsv";

export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
}

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

export interface MarketState {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface VaultMarketData {
  chainId: number;
  id: Hex;
  params: MarketParams;
  state: MarketState;
  cap: bigint;
  vaultAssets: bigint;
  rateAtTarget: bigint;
  apyAt100Utilization: bigint;
  loanTokenDecimals: number;
  /** morpho-v2 only: the MorphoMarketV1AdapterV2 holding this market's position */
  adapter?: Address;
}

export interface VaultData {
  vaultAddress: Address;
  marketsData: Map<Hex, VaultMarketData>;
  /** defaults to morpho-v1 */
  vaultType?: MorphoVaultType;
}

export interface MarketAllocation {
  marketParams: MarketParams;
  assets: bigint;
}
