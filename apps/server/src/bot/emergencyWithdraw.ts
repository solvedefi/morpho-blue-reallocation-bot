import { maxUint256 } from "viem";

import { freeMarketLiquidity } from "../utils/marketLiquidity";
import { MarketAllocation, VaultMarketData } from "../utils/types";

// ponytail: interest accrues between read and execution, so the on-chain withdrawal
// (supplyAssets_now - target) is slightly larger than planned. Leave 1bp of the vault's
// position as buffer; "100% utilization" therefore means free liquidity <= buffer.
export function emergencyBuffer(market: VaultMarketData): bigint {
  return market.vaultAssets / 10_000n + 1n;
}

/** Allocations moving as much as possible from `market` to `idle`; null when nothing more can be pulled. */
export function planEmergencyWithdraw(
  market: VaultMarketData,
  idle: VaultMarketData,
): MarketAllocation[] | null {
  const buffer = emergencyBuffer(market);
  const free = freeMarketLiquidity(market.state);
  const idleRoom = idle.cap > idle.vaultAssets ? idle.cap - idle.vaultAssets : 0n;
  const limit = free < idleRoom ? free : idleRoom;
  if (market.vaultAssets === 0n || limit <= buffer) return null;

  // full exit: assets=0 makes MetaMorpho burn all shares, no dust left behind
  const target = market.vaultAssets + buffer <= limit ? 0n : market.vaultAssets - (limit - buffer);

  return [
    { marketParams: market.params, assets: target },
    { marketParams: idle.params, assets: maxUint256 },
  ];
}
