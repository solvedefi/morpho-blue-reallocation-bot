import { MarketState, VaultMarketData } from "./types";

export function freeMarketLiquidity(state: MarketState): bigint {
  const { totalSupplyAssets, totalBorrowAssets } = state;
  return totalSupplyAssets > totalBorrowAssets ? totalSupplyAssets - totalBorrowAssets : 0n;
}

export function maxWithdrawableAssets(market: VaultMarketData): bigint {
  const freeLiquidity = freeMarketLiquidity(market.state);
  return freeLiquidity < market.vaultAssets ? freeLiquidity : market.vaultAssets;
}
