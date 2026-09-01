import { Result, err, ok } from "neverthrow";
import { type Address, type Hex } from "viem";

import { Reallocation, ReallocationAction, VaultV2Data } from "../../contracts/typesV2";
import { ApyConfiguration } from "../../database/DatabaseClient";
import {
  apyToRate,
  getUtilization,
  min,
  percentToWad,
  rateToApy,
  rateToUtilization,
  utilizationToRate,
} from "../../utils/maths";
import { getDepositableAmountV2, getWithdrawableAmountV2 } from "../helpers/caps";
import { encodeMarketParamsV1 } from "../helpers/encoding";
import { StrategyV2 } from "../strategy";

// Minimum APY change (in bips, 1 bip = 0.01%) that must be achievable on at
// least one market for the bot to bother sending a tx. Mirrors the V1
// strategy's threshold; not yet per-vault/per-market configurable.
const DEFAULT_MIN_APY_DELTA_BIPS = 50;

/**
 * V2 ApyRange strategy — keeps each market's borrow APY within an
 * operator-configured range by reallocating between markets.
 *
 * Differences from the V1 strategy in `../../strategies/apyRange`:
 *   - Operates on `VaultV2Data` (markets array, not Map; no idle market)
 *   - Returns `Reallocation` ({allocations, deallocations}) of adapter-
 *     targeted actions, not flat `MarketAllocation[]`
 *   - V2 caps are absolute + relative (relative = fraction of totalAssets)
 *   - Idle assets are vault-level (`vaultData.idleAssets`), not a market
 *   - No Adaptive-IRM curve-shift trick (defer to a Phase 2 if needed)
 *   - No per-vault hardcoded broken-market filters — V2 vaults are fresh
 */
export class ApyRangeV2Strategy implements StrategyV2 {
  private config: ApyConfiguration;

  constructor(config: ApyConfiguration) {
    this.config = config;
  }

  findReallocation(vaultData: VaultV2Data): Result<Reallocation | undefined, Error> {
    try {
      const markets = vaultData.marketsV1Data.markets;
      const adapterAddress = vaultData.marketsV1Data.adapterAddress;

      let totalToAllocate = 0n;
      let totalToDeallocate = 0n;
      let didExceedMinDelta = false;

      // First pass: aggregate totals + decide whether the minimum-delta
      // threshold is met by at least one market.
      for (const market of markets) {
        const range = this.getApyRange(market.chainId, vaultData.vaultAddress, market.id);

        const upperUtil = rateToUtilization(apyToRate(range.max), market.rateAtTarget);
        const lowerUtil = rateToUtilization(apyToRate(range.min), market.rateAtTarget);

        // 0 means the configured APY is below what the IRM can produce —
        // skip rather than try to push the curve (V1 has a special trick
        // for this; V2 v0 doesn't).
        if (upperUtil === 0n || lowerUtil === 0n) continue;

        const util = getUtilization(market.state);

        if (util > upperUtil) {
          totalToAllocate += getDepositableAmountV2(market, vaultData.totalAssets, upperUtil);
          didExceedMinDelta ||= apyDeltaExceedsThreshold(market.rateAtTarget, util, upperUtil);
        } else if (util < lowerUtil) {
          totalToDeallocate += getWithdrawableAmountV2(market, lowerUtil);
          didExceedMinDelta ||= apyDeltaExceedsThreshold(market.rateAtTarget, util, lowerUtil);
        }
      }

      // Balance allocate vs deallocate (mirrors upstream template).
      //   - dealloc > alloc, !allowIdle: cap dealloc to alloc (full balance)
      //   - dealloc > alloc,  allowIdle: leave dealloc — excess goes to vault idle
      //   - alloc > dealloc:             cap alloc to dealloc + min(diff, idle)
      if (totalToDeallocate > totalToAllocate && !this.config.allowIdleReallocation) {
        totalToDeallocate = totalToAllocate;
      } else if (totalToAllocate > totalToDeallocate) {
        const idleUsed = min(totalToAllocate - totalToDeallocate, vaultData.idleAssets);
        totalToAllocate = totalToDeallocate + idleUsed;
      }

      // Stop when either side is zero (template's `min(...) === 0n` rule).
      // Pure idle deployment (alloc>0 with dealloc=0) is intentionally NOT
      // done by this strategy — it's a rebalancer, not an opportunistic
      // idle deployer.
      if (min(totalToAllocate, totalToDeallocate) === 0n || !didExceedMinDelta) {
        return ok(undefined);
      }

      // Second pass: build per-market actions until the totals are exhausted.
      const allocations: ReallocationAction[] = [];
      const deallocations: ReallocationAction[] = [];

      let remainingAllocate = totalToAllocate;
      let remainingDeallocate = totalToDeallocate;

      for (const market of markets) {
        const range = this.getApyRange(market.chainId, vaultData.vaultAddress, market.id);
        const upperUtil = rateToUtilization(apyToRate(range.max), market.rateAtTarget);
        const lowerUtil = rateToUtilization(apyToRate(range.min), market.rateAtTarget);
        if (upperUtil === 0n || lowerUtil === 0n) continue;

        const util = getUtilization(market.state);

        if (util > upperUtil && remainingAllocate > 0n) {
          const delta = min(
            getDepositableAmountV2(market, vaultData.totalAssets, upperUtil),
            remainingAllocate,
          );
          if (delta > 0n) {
            allocations.push(buildAction(adapterAddress, market.params, delta));
            remainingAllocate -= delta;
          }
        } else if (util < lowerUtil && remainingDeallocate > 0n) {
          const delta = min(getWithdrawableAmountV2(market, lowerUtil), remainingDeallocate);
          if (delta > 0n) {
            deallocations.push(buildAction(adapterAddress, market.params, delta));
            remainingDeallocate -= delta;
          }
        }

        if (remainingAllocate === 0n && remainingDeallocate === 0n) break;
      }

      if (allocations.length === 0 && deallocations.length === 0) return ok(undefined);

      return ok({ allocations, deallocations });
    } catch (error) {
      return err(
        new Error(
          `Failed to find V2 reallocation for vault ${vaultData.vaultAddress}: ${String(error)}`,
        ),
      );
    }
  }

  /**
   * Resolve the APY range for a market using the same precedence rules as
   * the V1 strategy: market-specific > vault-specific > global default.
   * Returns values in WAD format ready for `apyToRate`.
   */
  protected getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let minApy = this.config.defaultMinApy;
    let maxApy = this.config.defaultMaxApy;

    const vaultRange = this.config.vaultRanges[chainId]?.[vaultAddress];
    if (vaultRange) {
      minApy = vaultRange.min;
      maxApy = vaultRange.max;
    }

    const marketRange = this.config.marketRanges[chainId]?.[marketId];
    if (marketRange) {
      minApy = marketRange.min;
      maxApy = marketRange.max;
    }

    return { min: percentToWad(minApy), max: percentToWad(maxApy) };
  }
}

function buildAction(
  adapterAddress: Address,
  params: {
    loanToken: Address;
    collateralToken: Address;
    oracle: Address;
    irm: Address;
    lltv: bigint;
  },
  assets: bigint,
): ReallocationAction {
  return {
    adapterAddress,
    data: encodeMarketParamsV1(params),
    assets,
  };
}

function apyDeltaExceedsThreshold(
  rateAtTarget: bigint,
  currentUtil: bigint,
  targetUtil: bigint,
): boolean {
  const delta =
    rateToApy(utilizationToRate(targetUtil, rateAtTarget)) -
    rateToApy(utilizationToRate(currentUtil, rateAtTarget));
  // delta is in WAD; convert to bips by dividing by 1e14.
  return Math.abs(Number(delta / 1_000_000_000n) / 1e5) > DEFAULT_MIN_APY_DELTA_BIPS;
}
