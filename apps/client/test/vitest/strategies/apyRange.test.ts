import { Range } from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, maxUint184, maxUint256, parseEther, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { MarketState } from "../../../src/contracts/types.js";
import { ApyRange } from "../../../src/strategies/apyRange/index.js";
import {
  apyToRate,
  rateToApy,
  percentToWad,
  getUtilization,
  calculateBorrowRate,
  utilizationToRate,
} from "../../../src/utils/maths.js";
import { MarketParams, VaultData, VaultMarketData } from "../../../src/utils/types.js";

interface TestConfig {
  ALLOW_IDLE_REALLOCATION: boolean;
  DEFAULT_APY_RANGE: Range;
  vaultsDefaultApyRanges: Record<number, Record<Address, Range>>;
  marketsDefaultApyRanges: Record<number, Record<Hex, Range>>;
}

class StrategyMock extends ApyRange {
  private readonly config: TestConfig;

  constructor(config: TestConfig) {
    super();
    this.config = config;
  }

  getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let apyRange = this.config.DEFAULT_APY_RANGE;

    const vaultRange: Range | undefined =
      this.config.vaultsDefaultApyRanges[chainId]?.[vaultAddress];
    if (vaultRange !== undefined) {
      apyRange = vaultRange;
    }

    const marketRange: Range | undefined = this.config.marketsDefaultApyRanges[chainId]?.[marketId];
    if (marketRange !== undefined) {
      apyRange = marketRange;
    }

    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }

  getMinApyDeltaBips(_chainId: number, _vaultAddress: Address, _marketId: Hex) {
    return 25; // 0.25% = 25 bips
  }
}

function createVaultMarketData(
  id: Hex,
  totalSupply: bigint,
  totalBorrow: bigint,
  vaultAssets: bigint,
  cap: bigint,
  rateAtTarget: bigint,
  params: MarketParams,
  rateAt100Utilization?: bigint,
): VaultMarketData {
  const isIdle = params.collateralToken === zeroAddress;

  return {
    chainId: mainnet.id,
    id,
    params,
    state: {
      totalSupplyAssets: totalSupply,
      totalSupplyShares: totalSupply,
      totalBorrowAssets: totalBorrow,
      totalBorrowShares: totalBorrow,
      lastUpdate: BigInt(Math.floor(Date.now() / 1000)),
      fee: 0n,
    },
    cap,
    vaultAssets,
    rateAtTarget: isIdle ? 0n : rateAtTarget,
    rateAt100Utilization,
  };
}

function createVaultData(vaultAddress: Address, marketsData: VaultMarketData[]): VaultData {
  const marketsMap = new Map<Hex, VaultMarketData>();
  for (const marketData of marketsData) {
    marketsMap.set(marketData.id, marketData);
  }
  return { vaultAddress, marketsData: marketsMap };
}

function calculateApyFromState(vaultMarketData: VaultMarketData, rateAtTarget: bigint): bigint {
  const utilization = getUtilization(vaultMarketData.state);

  const { newRateAtTarget } = calculateBorrowRate(
    vaultMarketData.state,
    rateAtTarget,
    BigInt(Math.floor(Date.now() / 1000)),
  );

  const actualRate = utilizationToRate(utilization, newRateAtTarget);
  const apy = rateToApy(actualRate);

  return apy;
}
describe("apyRange strategy - unit tests", () => {
  const EUSD_VAULT_ADDRESS = "0xbb819D845b573B5D7C538F5b85057160cfb5f313" as Address;

  const MARKET_ID_BSDETH_EUSD =
    "0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf";
  const MARKET_ID_WSTETH_EUSD =
    "0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea";
  const MARKET_ID_IDLE_EUSD = "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8";

  const MARKET_PARAMS_BSDETH_EUSD: MarketParams = {
    loanToken: "0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4" as Address, // EUSD
    collateralToken: "0xCb327b99fF831bF8223cCEd12B1338FF3aA322Ff" as Address, // BSDETH
    oracle: "0xc866447b4C254E2029f1bfB700F5AA43ce27b1BE" as Address,
    irm: "0x46415998764C29aB2a25CbeA6254146D50D22687" as Address,
    lltv: parseUnits("0.86", 18),
  };

  const MARKET_PARAMS_WSTETH_EUSD: MarketParams = {
    loanToken: "0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4" as Address, // EUSD
    collateralToken: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" as Address, // wstETH
    oracle: "0xa79e9EC3458fEd729E7A0A1A1573e6a29E875d5E" as Address,
    irm: "0x46415998764C29aB2a25CbeA6254146D50D22687" as Address,
    lltv: parseUnits("0.86", 18),
  };

  const IDLE_MARKET_PARAMS_EUSD: MarketParams = {
    loanToken: "0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4" as Address, // EUSD
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  };

  const TEST_CONFIG_NO_IDLE: TestConfig = {
    DEFAULT_APY_RANGE: { min: 3, max: 8 },
    vaultsDefaultApyRanges: {},
    marketsDefaultApyRanges: {},
    ALLOW_IDLE_REALLOCATION: false,
  };

  it("should keep two markets at 100% util because the curve haven't shifted yet", () => {
    const DEFAULT_APY_RANGE = { min: 30, max: 40 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
    });

    const targetApyAt100 = percentToWad(7);
    const rateAt100Util = apyToRate(targetApyAt100);
    const rateAtTarget = rateAt100Util / 4n;

    // Market 1: rateAt100Utilization < max APY (should withdraw to 100% util)
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("5000", 18),
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      rateAt100Util,
    );

    // Market 2: High utilization, normal rebalancing (rateAt100Util not set or high enough)
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9500", 18),
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      rateAt100Util, // No rateAt100Utilization, normal rebalancing
    );

    // Market 3: Idle market
    const vaultMarketDataIdle = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("1000000", 18),
      parseUnits("0", 18),
      parseUnits("1000000", 18),
      parseUnits("2000000", 18),
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
      vaultMarketDataIdle,
    ]);
    const result = strategy.findReallocation(vaultData);

    expect(result).toBeDefined();
    if (!result) return;

    expect(result[0]).toBeDefined();
    if (!result[0]) return;

    expect(result[1]).toBeDefined();
    if (!result[1]) return;

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      result[0].assets,
      parseUnits("5000", 18),
      result[0].assets,
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      rateAt100Util,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    // we should have exactly 7% since the curve haven't shifted yet
    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(targetApyAt100 / 10n ** 16n);

    const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      result[1].assets,
      parseUnits("9500", 18), // WSTETH originally had 9500 borrow, doesn't change with reallocation
      result[1].assets,
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      rateAt100Util,
    );

    const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_WSTETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_WSTETH_EUSD = parseFloat(
      (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    // we should have exactly 7% since the curve haven't shifted yet
    expect(apy_WSTETH_EUSD).toBeGreaterThanOrEqual(targetApyAt100 / 10n ** 16n);
  });

  it("should keep one market at 100% utilization and withdraw from the other market", () => {
    const DEFAULT_APY_RANGE = { min: 30, max: 40 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
    });

    const targetApyAt100 = percentToWad(7);
    const lowRateAt100Util = apyToRate(targetApyAt100);
    const lowRateAtTarget = lowRateAt100Util / 4n;

    // For 16-20% APY range, we need a rateAtTarget that gives ~18% APY at 90% util
    // The IRM curve: at 90% util, rate = rateAtTarget; at 100% util, rate = 4x rateAtTarget
    const targetApyAt90WSTETH_EUSD = percentToWad(18); // Middle of 16-20% range
    const highRateAtTargetWSTETH_EUSD = apyToRate(targetApyAt90WSTETH_EUSD);
    const highRateAt100UtilWSTETH_EUSD = highRateAtTargetWSTETH_EUSD * 4n;

    // Market 1: rateAt100Utilization < max APY (should withdraw to 100% util)
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("5000", 18),
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      lowRateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      lowRateAt100Util,
    );

    // Market 2: High utilization, normal rebalancing (rateAt100Util not set or high enough)
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9500", 18),
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      highRateAtTargetWSTETH_EUSD,
      MARKET_PARAMS_WSTETH_EUSD,
      highRateAt100UtilWSTETH_EUSD, // No rateAt100Utilization, normal rebalancing
    );

    // Market 3: Idle market
    const vaultMarketDataIdle = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("1000000", 18),
      parseUnits("0", 18),
      parseUnits("1000000", 18),
      parseUnits("2000000", 18),
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
      vaultMarketDataIdle,
    ]);
    const result = strategy.findReallocation(vaultData);

    expect(result).toBeDefined();
    if (!result) return;

    expect(result[0]).toBeDefined();
    if (!result[0]) return;

    expect(result[1]).toBeDefined();
    if (!result[1]) return;

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      result[0].assets,
      parseUnits("5000", 18),
      result[0].assets,
      parseUnits("20000", 18),
      lowRateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      lowRateAt100Util,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      lowRateAtTarget,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    // we should have exactly 7% since the curve haven't shifted yet
    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(targetApyAt100 / 10n ** 16n);

    const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      result[1].assets,
      parseUnits("9500", 18), // WSTETH originally had 9500 borrow, doesn't change with reallocation
      result[1].assets,
      parseUnits("20000", 18),
      highRateAtTargetWSTETH_EUSD,
      MARKET_PARAMS_BSDETH_EUSD,
      highRateAt100UtilWSTETH_EUSD,
    );

    const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_WSTETH_EUSD_afterReallocation,
      highRateAtTargetWSTETH_EUSD,
    );

    const apy_WSTETH_EUSD = parseFloat(
      (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    expect(apy_WSTETH_EUSD).toBeGreaterThanOrEqual(DEFAULT_APY_RANGE.min);
    expect(apy_WSTETH_EUSD).toBeLessThanOrEqual(DEFAULT_APY_RANGE.max + 1);
  });

  it("should return no reallocation when all markets are within APY range", () => {
    const DEFAULT_APY_RANGE = { min: 3, max: 8 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
    });

    // Market with APY around 5% (within 3-8% range)
    const targetApyAt90 = percentToWad(5);
    const rateAtTarget = apyToRate(targetApyAt90);
    const rateAt100Util = rateAtTarget * 4n;

    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9000", 18), // 90% utilization
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      rateAt100Util,
    );

    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("8500", 18), // 85% utilization
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      rateAt100Util,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
    ]);
    const result = strategy.findReallocation(vaultData);

    expect(result).toBeUndefined();
  });

  it("should deposit to market above upper utilization bound", () => {
    const DEFAULT_APY_RANGE = { min: 3, max: 8 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
    });

    // Market with high utilization (above upper bound) - needs deposit
    const targetApyAt90 = percentToWad(5);
    const rateAtTarget = apyToRate(targetApyAt90);
    const rateAt100Util = rateAtTarget * 4n;

    // Market 1: High utilization (95%), APY above max (8%)
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9500", 18), // 95% utilization - above upper bound
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      rateAt100Util,
    );

    // Market 2: Lower utilization (50%), APY below min (3%)
    const lowRateAtTarget = apyToRate(percentToWad(2));
    const lowRateAt100Util = lowRateAtTarget * 4n;
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("5000", 18), // 50% utilization - below lower bound
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      lowRateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      lowRateAt100Util,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
    ]);
    const result = strategy.findReallocation(vaultData);

    expect(result).toBeDefined();
    if (!result) return;

    // Should have withdrawals from WSTETH and deposits to BSDETH
    const withdrawals = result.filter((r) => r.assets < maxUint256);
    const deposits = result.filter((r) => r.assets === maxUint256);

    expect(withdrawals.length).toBeGreaterThan(0);
    expect(deposits.length).toBeGreaterThan(0);

    // Verify APY after reallocation
    const wstethAllocation = result.find(
      (r) =>
        r.marketParams.collateralToken === MARKET_PARAMS_WSTETH_EUSD.collateralToken &&
        r.marketParams.loanToken === MARKET_PARAMS_WSTETH_EUSD.loanToken,
    );

    if (wstethAllocation && wstethAllocation.assets < maxUint256) {
      // WSTETH had withdrawal (assets decreased)
      const apy_WSTETH_EUSD_before = calculateApyFromState(
        vaultMarketData_WSTETH_EUSD,
        lowRateAtTarget,
      );
      const apyBefore = parseFloat((Number(apy_WSTETH_EUSD_before) / 1e16).toFixed(1));

      const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
        MARKET_ID_WSTETH_EUSD as Hex,
        wstethAllocation.assets,
        parseUnits("5000", 18), // Borrow doesn't change
        wstethAllocation.assets,
        parseUnits("20000", 18),
        lowRateAtTarget,
        MARKET_PARAMS_WSTETH_EUSD,
        lowRateAt100Util,
      );

      const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
        vaultMarketData_WSTETH_EUSD_afterReallocation,
        lowRateAtTarget,
      );

      const apy_WSTETH_EUSD = parseFloat(
        (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
      );

      // After withdrawal, utilization should increase, APY should increase
      expect(apy_WSTETH_EUSD).toBeGreaterThan(apyBefore);
    }

    // For BSDETH deposit, calculate new assets from withdrawal amount
    const bsdethAllocation = result.find(
      (r) =>
        r.marketParams.collateralToken === MARKET_PARAMS_BSDETH_EUSD.collateralToken &&
        r.marketParams.loanToken === MARKET_PARAMS_BSDETH_EUSD.loanToken,
    );

    if (bsdethAllocation) {
      let newBsdethAssets: bigint;
      if (bsdethAllocation.assets === maxUint256) {
        // Calculate deposit amount from withdrawal
        if (!wstethAllocation) throw new Error("wstethAllocation not found");
        const withdrawalAmount = vaultMarketData_WSTETH_EUSD.vaultAssets - wstethAllocation.assets;
        newBsdethAssets = vaultMarketData_BSDETH_EUSD.vaultAssets + withdrawalAmount;
      } else {
        newBsdethAssets = bsdethAllocation.assets;
      }

      const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
        MARKET_ID_BSDETH_EUSD as Hex,
        newBsdethAssets,
        parseUnits("9500", 18), // Borrow doesn't change
        newBsdethAssets,
        parseUnits("20000", 18),
        rateAtTarget,
        MARKET_PARAMS_BSDETH_EUSD,
        rateAt100Util,
      );

      const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
        vaultMarketData_BSDETH_EUSD_afterReallocation,
        rateAtTarget,
      );

      const apy_BSDETH_EUSD = parseFloat(
        (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
      );

      const apy_BSDETH_EUSD_before = calculateApyFromState(
        vaultMarketData_BSDETH_EUSD,
        rateAtTarget,
      );
      const apyBefore = parseFloat((Number(apy_BSDETH_EUSD_before) / 1e16).toFixed(1));

      // After deposit, utilization should decrease, APY should decrease
      expect(apy_BSDETH_EUSD).toBeLessThan(apyBefore);
    }
  });
});
