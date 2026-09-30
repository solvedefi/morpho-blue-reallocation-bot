/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { maxUint256, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { EquilizeUtilizations } from "../../../src/strategies";
import { getUtilization } from "../../../src/utils/maths";
import { type VaultData, type VaultMarketData } from "../../../src/utils/types";

const VAULT = "0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B" as Address;
const usd = (n: number) => parseUnits(String(n), 6);

const market = (
  id: string,
  collateral: Address,
  supply: number,
  borrow: number,
  vaultAssets: number,
): VaultMarketData => ({
  chainId: 480,
  id: id as Hex,
  params: {
    loanToken: zeroAddress,
    collateralToken: collateral,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  },
  state: {
    totalSupplyAssets: usd(supply),
    totalSupplyShares: 0n,
    totalBorrowAssets: usd(borrow),
    totalBorrowShares: 0n,
    lastUpdate: 0n,
    fee: 0n,
  },
  cap: usd(1_000_000),
  vaultAssets: usd(vaultAssets),
  rateAtTarget: 0n,
  apyAt100Utilization: 0n,
  loanTokenDecimals: 6,
});

const vault = (markets: VaultMarketData[]): VaultData => ({
  vaultAddress: VAULT,
  marketsData: new Map(markets.map((m) => [m.id, m])),
});

const strategy = new EquilizeUtilizations(new Map([[VAULT.toLowerCase(), parseUnits("0.9", 18)]]));

// Applies an allocation to a market's supply and returns its new utilization in percent.
const utilAfter = (m: VaultMarketData, assets: bigint) =>
  Number(
    getUtilization({
      ...m.state,
      totalSupplyAssets: m.state.totalSupplyAssets - m.vaultAssets + assets,
    }) /
      10n ** 14n,
  ) / 100;

describe("EquilizeUtilizations with fixed target", () => {
  const hot = market("0x01", "0x0000000000000000000000000000000000000001", 1000, 950, 500); // 95%
  const cold = market("0x02", "0x0000000000000000000000000000000000000002", 1000, 800, 500); // 80%
  const idle = market("0x03", zeroAddress, 1000, 0, 1000);

  it("moves every market to 90% and parks the surplus in idle", () => {
    const allocs = strategy.findReallocation(vault([hot, cold, idle]))._unsafeUnwrap()!;
    const byMarket = new Map(allocs.map((a) => [a.marketParams.collateralToken, a.assets]));

    expect(utilAfter(cold, byMarket.get(cold.params.collateralToken)!)).toBeCloseTo(90, 1);
    expect(utilAfter(hot, byMarket.get(hot.params.collateralToken)!)).toBeCloseTo(90, 1);
    expect(byMarket.get(zeroAddress)).toBe(maxUint256);
    // withdrawals before deposits, idle deposit last
    expect(allocs.at(-1)?.marketParams.collateralToken).toBe(zeroAddress);
  });

  it("funds the deficit from idle when every market is above target", () => {
    const hot2 = market("0x02", "0x0000000000000000000000000000000000000002", 1000, 990, 500); // 99%
    const allocs = strategy.findReallocation(vault([hot, hot2, idle]))._unsafeUnwrap()!;
    const byMarket = new Map(allocs.map((a) => [a.marketParams.collateralToken, a.assets]));

    expect(allocs[0]?.marketParams.collateralToken).toBe(zeroAddress);
    expect(byMarket.get(zeroAddress)!).toBeLessThan(idle.vaultAssets);
    const deposits = allocs.slice(1);
    const withdrawn = idle.vaultAssets - byMarket.get(zeroAddress)!;
    const deposited = deposits.reduce((acc, a) => {
      const m = [hot, hot2].find(
        (x) => x.params.collateralToken === a.marketParams.collateralToken,
      )!;
      return acc + (a.assets === maxUint256 ? 0n : a.assets - m.vaultAssets);
    }, 0n);
    expect(deposited).toBeLessThanOrEqual(withdrawn);
    expect(utilAfter(hot, byMarket.get(hot.params.collateralToken)!)).toBeCloseTo(90, 1);
  });

  it("does nothing for vaults without a fixed target and balanced markets", () => {
    const other = { ...vault([hot, hot, idle]), vaultAddress: zeroAddress };
    expect(strategy.findReallocation(other)._unsafeUnwrap()).toBeUndefined();
  });
});
