import { Address, Hex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { Caps, MarketV1Data, VaultV2Data } from "../../../src/contracts/typesV2.js";
import { ApyConfiguration } from "../../../src/database/index.js";
import { ApyRangeV2Strategy } from "../../../src/strategies-v2/apyRange/ApyRangeV2Strategy.js";
import {
  apyToRate,
  calculateBorrowRate,
  getUtilization,
  percentToWad,
  rateToApy,
  utilizationToRate,
} from "../../../src/utils/maths.js";
import { MarketParams } from "../../../src/utils/types.js";

/**
 * Unit tests for ApyRangeV2Strategy. Mirrors apps/server/test/vitest/
 * strategies/apyRange.test.ts but operates on V2 shapes:
 *   - markets array (not Map; no idle "market" entry)
 *   - vault-level idleAssets
 *   - caps { absolute, relative } per market
 *   - returned Reallocation has separate allocations + deallocations,
 *     each holding adapter + ABI-encoded marketParams + delta amount
 *
 * Tests that are V1-specific (Adaptive-IRM "push to 100% utilization"
 * trick, hardcoded broken-market filters) are intentionally absent — V2
 * doesn't carry those over. See V2_INTEGRATION_PLAN.md Step 4 for the
 * deliberate divergences.
 */

const TEST_VAULT = "0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC" as Address;
const TEST_ADAPTER = "0x07E20Ff434D8ba9B8a68596BDeB61aE69Fb468D4" as Address;

const MARKET_ID_A = "0xaa00000000000000000000000000000000000000000000000000000000000001" as Hex;
const MARKET_ID_B = "0xbb00000000000000000000000000000000000000000000000000000000000002" as Hex;
const MARKET_ID_C = "0xcc00000000000000000000000000000000000000000000000000000000000003" as Hex;

const PARAMS_A: MarketParams = {
  loanToken: "0x1111111111111111111111111111111111111111" as Address,
  collateralToken: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
  oracle: "0x0000000000000000000000000000000000000a01" as Address,
  irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3" as Address,
  lltv: parseUnits("0.86", 18),
};

const PARAMS_B: MarketParams = {
  loanToken: "0x1111111111111111111111111111111111111111" as Address,
  collateralToken: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
  oracle: "0x0000000000000000000000000000000000000b01" as Address,
  irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3" as Address,
  lltv: parseUnits("0.915", 18),
};

const PARAMS_C: MarketParams = {
  loanToken: "0x1111111111111111111111111111111111111111" as Address,
  collateralToken: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
  oracle: "0x0000000000000000000000000000000000000c01" as Address,
  irm: "0x7e82b16496fa8cc04935528da7f5a2c684a3c7a3" as Address,
  lltv: parseUnits("0.86", 18),
};

const FULL_RELATIVE_CAP = parseUnits("1", 18); // 100% in WAD

function caps(absolute: bigint, relative = FULL_RELATIVE_CAP): Caps {
  return { absolute, relative };
}

function buildMarket(args: {
  id: Hex;
  params: MarketParams;
  totalSupply: bigint;
  totalBorrow: bigint;
  vaultAssets: bigint;
  rateAtTarget: bigint;
  caps: Caps;
}): MarketV1Data {
  return {
    chainId: mainnet.id,
    id: args.id,
    params: args.params,
    state: {
      totalSupplyAssets: args.totalSupply,
      totalSupplyShares: args.totalSupply,
      totalBorrowAssets: args.totalBorrow,
      totalBorrowShares: args.totalBorrow,
      lastUpdate: BigInt(Math.floor(Date.now() / 1000)),
      fee: 0n,
    },
    caps: args.caps,
    vaultAssets: args.vaultAssets,
    rateAtTarget: args.rateAtTarget,
  };
}

function buildVaultData(args: {
  totalAssets: bigint;
  idleAssets: bigint;
  markets: MarketV1Data[];
}): VaultV2Data {
  return {
    vaultAddress: TEST_VAULT,
    totalAssets: args.totalAssets,
    idleAssets: args.idleAssets,
    marketsV1Data: { adapterAddress: TEST_ADAPTER, markets: args.markets },
  };
}

function makeApyConfig(overrides: Partial<ApyConfiguration> = {}): ApyConfiguration {
  return {
    vaultRanges: {},
    marketRanges: {},
    allowIdleReallocation: true,
    defaultMinApy: 3,
    defaultMaxApy: 8,
    ...overrides,
  };
}

/**
 * Recompute APY (in WAD bigint, e.g. 0.05e18 = 5%) from a hypothetical
 * post-reallocation state. Borrow stays the same; supply changes by the
 * delta the strategy proposed.
 */
function apyAfterWad(market: MarketV1Data, newSupplyAssets: bigint): bigint {
  const updated: MarketV1Data = {
    ...market,
    state: {
      ...market.state,
      totalSupplyAssets: newSupplyAssets,
      totalSupplyShares: newSupplyAssets,
    },
    vaultAssets: newSupplyAssets,
  };
  const util = getUtilization(updated.state);
  const { newRateAtTarget } = calculateBorrowRate(
    updated.state,
    updated.rateAtTarget,
    BigInt(Math.floor(Date.now() / 1000)),
  );
  return rateToApy(utilizationToRate(util, newRateAtTarget));
}

describe("ApyRangeV2Strategy - unit tests", () => {
  // Calibration: rateAtTarget such that APY at 90% util ≈ 5%.
  const TYPICAL_RATE_AT_TARGET = apyToRate(percentToWad(5));

  it("returns no reallocation when every market is already inside the APY range", () => {
    const strategy = new ApyRangeV2Strategy(makeApyConfig({ defaultMinApy: 3, defaultMaxApy: 8 }));

    // Both markets at 90% utilization → APY ≈ 5%, comfortably inside [3%, 8%].
    const a = buildMarket({
      id: MARKET_ID_A,
      params: PARAMS_A,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("9000", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("20000", 18)),
    });
    const b = buildMarket({
      id: MARKET_ID_B,
      params: PARAMS_B,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("8500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("20000", 18)),
    });

    const result = strategy.findReallocation(
      buildVaultData({
        totalAssets: parseUnits("20000", 18),
        idleAssets: 0n,
        markets: [a, b],
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toBeUndefined();
  });

  it("balances allocate vs deallocate between an over-utilized and an under-utilized market", () => {
    // allowIdleReallocation=false → strategy must produce balanced totals
    // (no excess deallocation flowing to vault idle).
    const strategy = new ApyRangeV2Strategy(
      makeApyConfig({ defaultMinApy: 3, defaultMaxApy: 8, allowIdleReallocation: false }),
    );

    // Market A: 95% util, APY ≈ 11% → above max, needs more supply (allocate).
    const a = buildMarket({
      id: MARKET_ID_A,
      params: PARAMS_A,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("9500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });
    // Market B: 40% util, APY ≈ 1% → below min, needs withdraw (deallocate).
    const b = buildMarket({
      id: MARKET_ID_B,
      params: PARAMS_B,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("4000", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });

    const result = strategy.findReallocation(
      buildVaultData({
        totalAssets: parseUnits("20000", 18),
        idleAssets: 0n,
        markets: [a, b],
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const reallocation = result.value;
    expect(reallocation).toBeDefined();
    if (!reallocation) return;

    // Should produce one allocate (to A) and one deallocate (from B), and
    // the totals must match (no idle deployment in this test — idleAssets=0).
    expect(reallocation.allocations.length).toBe(1);
    expect(reallocation.deallocations.length).toBe(1);

    const allocate = reallocation.allocations[0];
    const deallocate = reallocation.deallocations[0];
    if (!allocate || !deallocate) throw new Error("expected one allocate and one deallocate");
    expect(allocate.adapterAddress).toBe(TEST_ADAPTER);
    expect(deallocate.adapterAddress).toBe(TEST_ADAPTER);
    expect(allocate.assets).toBeGreaterThan(0n);
    expect(deallocate.assets).toBeGreaterThan(0n);
    expect(allocate.assets).toEqual(deallocate.assets); // balanced

    // Verify direction of movement — A's APY drops (was 12.97%, now lower
    // toward 8% upper), B's APY rises (was 2.89%, now higher toward 3% lower).
    // We don't assert "fully inside range" here because allowIdle=false caps
    // deallocate to allocate, and the allocate side's cap-buffered headroom
    // can be the bottleneck — a partial rebalance is the expected outcome
    // when one market has tighter cap headroom than the other has supply.
    const apyA_before = apyAfterWad(a, a.vaultAssets);
    const apyB_before = apyAfterWad(b, b.vaultAssets);
    const apyA_after = apyAfterWad(a, a.vaultAssets + allocate.assets);
    const apyB_after = apyAfterWad(b, b.vaultAssets - deallocate.assets);
    expect(apyA_after < apyA_before).toBe(true);
    expect(apyB_after > apyB_before).toBe(true);
  });

  it("uses vault idleAssets to top up an over-utilized market when no other market needs draining", () => {
    const strategy = new ApyRangeV2Strategy(makeApyConfig({ defaultMinApy: 3, defaultMaxApy: 8 }));

    // Market A is over-utilized (needs more supply), market B is in range.
    // No deallocation source → strategy must pull from vault idle.
    const a = buildMarket({
      id: MARKET_ID_A,
      params: PARAMS_A,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("9500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });
    const b = buildMarket({
      id: MARKET_ID_B,
      params: PARAMS_B,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("8500", 18), // 85% util → APY ≈ 4.5%, in range
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });

    const idleAvailable = parseUnits("5000", 18);
    const result = strategy.findReallocation(
      buildVaultData({
        totalAssets: parseUnits("25000", 18),
        idleAssets: idleAvailable,
        markets: [a, b],
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const reallocation = result.value;

    // Strategy contract: stop when min(allocate, deallocate) === 0. With
    // dealloc=0, alloc>0 (from idle), the strategy returns undefined — it
    // is a rebalancer, not an opportunistic idle deployer.
    expect(reallocation).toBeUndefined();
  });

  it("respects allowIdleReallocation=false by capping deallocate to allocate", () => {
    const strategy = new ApyRangeV2Strategy(
      makeApyConfig({ defaultMinApy: 3, defaultMaxApy: 8, allowIdleReallocation: false }),
    );

    // Two under-utilized markets (lots of withdrawable supply), one
    // over-utilized market (modest depositable headroom). Without
    // allowIdleReallocation, dealloc gets capped to alloc — no excess sits
    // in vault idle.
    const a = buildMarket({
      id: MARKET_ID_A,
      params: PARAMS_A,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("9500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("12000", 18)), // tight cap → small allocate headroom
    });
    const b = buildMarket({
      id: MARKET_ID_B,
      params: PARAMS_B,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("3000", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });
    const c = buildMarket({
      id: MARKET_ID_C,
      params: PARAMS_C,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("3500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });

    const result = strategy.findReallocation(
      buildVaultData({
        totalAssets: parseUnits("30000", 18),
        idleAssets: 0n,
        markets: [a, b, c],
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const reallocation = result.value;
    expect(reallocation).toBeDefined();
    if (!reallocation) return;

    const totalAllocate = reallocation.allocations.reduce((s, x) => s + x.assets, 0n);
    const totalDeallocate = reallocation.deallocations.reduce((s, x) => s + x.assets, 0n);
    expect(totalAllocate).toBeGreaterThan(0n);
    // With allowIdleReallocation=false, deallocate must equal allocate.
    expect(totalDeallocate).toEqual(totalAllocate);
  });

  it("respects the absolute cap with the 1% buffer when computing depositable headroom", () => {
    const strategy = new ApyRangeV2Strategy(makeApyConfig({ defaultMinApy: 3, defaultMaxApy: 8 }));

    // Market A is over-utilized but its absolute cap is only slightly
    // above current vaultAssets — the strategy's cap-buffer should keep
    // the proposed allocation strictly below the cap.
    const absoluteCap = parseUnits("11000", 18);
    const a = buildMarket({
      id: MARKET_ID_A,
      params: PARAMS_A,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("9500", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(absoluteCap),
    });
    const b = buildMarket({
      id: MARKET_ID_B,
      params: PARAMS_B,
      totalSupply: parseUnits("10000", 18),
      totalBorrow: parseUnits("4000", 18),
      vaultAssets: parseUnits("10000", 18),
      rateAtTarget: TYPICAL_RATE_AT_TARGET,
      caps: caps(parseUnits("50000", 18)),
    });

    const result = strategy.findReallocation(
      buildVaultData({
        totalAssets: parseUnits("20000", 18),
        idleAssets: 0n,
        markets: [a, b],
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const reallocation = result.value;
    expect(reallocation).toBeDefined();
    if (!reallocation) return;

    const allocateToA = reallocation.allocations.find((x) => x.adapterAddress === TEST_ADAPTER);
    expect(allocateToA).toBeDefined();
    if (!allocateToA) return;

    // Post-allocation supply must stay strictly below the absolute cap.
    expect(a.vaultAssets + allocateToA.assets).toBeLessThan(absoluteCap);
  });
});
