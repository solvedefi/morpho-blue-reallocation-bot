import type { Address, Chain, Hex } from "viem";

export type ChainConfig = {
  chain: Chain;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
};

export type MarketParams = {
  loanToken: Address;
  collateralToken: Address;
  irm: Address;
  oracle: Address;
  lltv: bigint;
};

export interface MarketState {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export type VaultMarketData = {
  chainId: number;
  id: Hex;
  params: MarketParams;
  state: MarketState;
  cap: bigint;
  vaultAssets: bigint;
  rateAtTarget: bigint;
};

export type VaultData = {
  vaultAddress: Address;
  marketsData: VaultMarketData[];
};

export type MarketAllocation = {
  marketParams: MarketParams;
  assets: bigint;
};
