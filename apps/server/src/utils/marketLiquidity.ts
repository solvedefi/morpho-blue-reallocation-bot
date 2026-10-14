import { maxUint256, zeroAddress } from "viem";

import { marketIdFromParams } from "./marketId";
import { MarketAllocation, MarketState, VaultData, VaultMarketData } from "./types";

export function freeMarketLiquidity(state: MarketState): bigint {
  const { totalSupplyAssets, totalBorrowAssets } = state;
  return totalSupplyAssets > totalBorrowAssets ? totalSupplyAssets - totalBorrowAssets : 0n;
}

export function maxWithdrawableAssets(market: VaultMarketData): bigint {
  const freeLiquidity = freeMarketLiquidity(market.state);
  return freeLiquidity < market.vaultAssets ? freeLiquidity : market.vaultAssets;
}

/** Per-market state of a vault for failure logs; bigints as strings so they survive JSON. */
export function marketsSnapshot(vaultData: VaultData, allocations?: MarketAllocation[]) {
  const targets = new Map(
    allocations?.map((a) => [marketIdFromParams(a.marketParams).toLowerCase(), a.assets]),
  );
  return [...vaultData.marketsData.values()].map((m) => {
    const { totalSupplyAssets, totalBorrowAssets } = m.state;
    const target = targets.get(m.id.toLowerCase());
    return {
      id: m.id,
      collateralToken: m.params.collateralToken,
      // v2: adapter holding the market; null for v1 markets and the virtual idle market
      adapter: m.adapter ?? null,
      // v2 idle is the vault's token balance, shown as a market with collateral 0x0
      virtualIdle: vaultData.vaultType === "morpho-v2" && m.params.collateralToken === zeroAddress,
      decimals: m.loanTokenDecimals,
      vaultAssets: String(m.vaultAssets),
      cap: String(m.cap),
      totalSupplyAssets: String(totalSupplyAssets),
      totalBorrowAssets: String(totalBorrowAssets),
      freeLiquidity: String(freeMarketLiquidity(m.state)),
      maxWithdrawable: String(maxWithdrawableAssets(m)),
      utilization:
        totalSupplyAssets === 0n
          ? null
          : Number((totalBorrowAssets * 10_000n) / totalSupplyAssets) / 10_000,
      target: target === undefined ? null : target === maxUint256 ? "max" : String(target),
    };
  });
}
