import { Address, Hex, maxUint256, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ApyRange } from "../../../../server/src/strategies/apyRange/ApyRangeStrategy.js";
import { ApyConfiguration, type ApyRangeConfig as Range } from "../../../src/database/index.js";
import {
  apyToRate,
  calculateBorrowRate,
  getUtilization,
  percentToWad,
  rateToApy,
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
  private readonly testConfig: TestConfig;

  constructor(config: TestConfig) {
    // Convert TestConfig to ApyConfiguration
    const apyConfig: ApyConfiguration = {
      allowIdleReallocation: config.ALLOW_IDLE_REALLOCATION,
      defaultMinApy: config.DEFAULT_APY_RANGE.min,
      defaultMaxApy: config.DEFAULT_APY_RANGE.max,
      vaultRanges: {},
      marketRanges: {},
    };

    // Convert vault ranges
    for (const [chainId, vaults] of Object.entries(config.vaultsDefaultApyRanges)) {
      apyConfig.vaultRanges[Number(chainId)] = {};
      for (const [vaultAddress, range] of Object.entries(vaults)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        apyConfig.vaultRanges[Number(chainId)]![vaultAddress] = {
          min: range.min,
          max: range.max,
        };
      }
    }

    // Convert market ranges
    for (const [chainId, markets] of Object.entries(config.marketsDefaultApyRanges)) {
      apyConfig.marketRanges[Number(chainId)] = {};
      for (const [marketId, range] of Object.entries(markets)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        apyConfig.marketRanges[Number(chainId)]![marketId] = {
          min: range.min,
          max: range.max,
          collateralSymbol: "TEST",
          loanSymbol: "TEST",
        };
      }
    }

    super(apyConfig);
    this.testConfig = config;
  }

  getMinApyDeltaBips() {
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
  apyAt100Utilization: bigint,
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
    loanTokenDecimals: 18,
    vaultAssets,
    rateAtTarget: isIdle ? 0n : rateAtTarget,
    apyAt100Utilization: apyAt100Utilization,
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
  const MARKET_ID_IDLE_EUSD = "0x4a858e4426a2132c7090021abe5939a8afcd6644429e138e677104530be1e547";

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

  it("should keep one market at 100% util because the curve haven't shifted yet and perform normal reallocation for the other market", () => {
    const APY_AT_100_FOR_BSDETH_EUSD = 7;
    const DEFAULT_APY_RANGE = { min: 30, max: 40 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
      ALLOW_IDLE_REALLOCATION: true,
    });

    const totalSupply_BSDETH_EUSD = parseUnits("10000", 18);
    const totalBorrow_BSDETH_EUSD = parseUnits("5000", 18);
    const vaultAssets_BSDETH_EUSD = parseUnits("10000", 18);
    const cap_BSDETH_EUSD = parseUnits("20000", 18);

    const targetApyAt100Utilization_BSDETH_EUSD = percentToWad(APY_AT_100_FOR_BSDETH_EUSD);
    const rateAt100Utilization_BSDETH_EUSD = apyToRate(targetApyAt100Utilization_BSDETH_EUSD);
    const rateAtTarget_BSDETH_EUSD = rateAt100Utilization_BSDETH_EUSD / 4n;
    const apyAt100Util_BSDETH_EUSD = rateToApy(rateAt100Utilization_BSDETH_EUSD);
    const apyAtTarget_BSDETH_EUSD = rateToApy(rateAtTarget_BSDETH_EUSD);

    console.log("targetApyAt100Utilization_BSDETH_EUSD:", targetApyAt100Utilization_BSDETH_EUSD);
    console.log("rateAt100Utilization_BSDETH_EUSD:", rateAt100Utilization_BSDETH_EUSD);
    console.log("rateAtTarget_BSDETH_EUSD:", rateAtTarget_BSDETH_EUSD);
    console.log(
      `apyAt100Util_BSDETH_EUSD: ${apyAt100Util_BSDETH_EUSD.toString()}, ${(apyAt100Util_BSDETH_EUSD / 10n ** 16n).toString()}%`,
    );
    console.log(
      `apyAtTarget_BSDETH_EUSD: ${apyAtTarget_BSDETH_EUSD.toString()}, ${(apyAtTarget_BSDETH_EUSD / 10n ** 16n).toString()}%`,
    );

    console.log();

    const totalSupply_WSTETH_EUSD = parseUnits("10000", 18);
    const totalBorrow_WSTETH_EUSD = parseUnits("9500", 18);
    const vaultAssets_WSTETH_EUSD = parseUnits("10000", 18);
    const cap_WSTETH_EUSD = parseUnits("20000", 18);

    // MAX apy at 100% utilization is 50%, should not push to 100% util and jsut rebalance normally
    const targetApyAt100Utilization_WSTETH_EUSD = percentToWad(50);
    const rateAt100Utilization_WSTETH_EUSD = apyToRate(targetApyAt100Utilization_WSTETH_EUSD);
    const rateAtTarget_WSTETH_EUSD = rateAt100Utilization_WSTETH_EUSD / 4n;
    const apyAt100Util_WSTETH_EUSD = rateToApy(rateAt100Utilization_WSTETH_EUSD);
    const apyAtTarget_WSTETH_EUSD = rateToApy(rateAtTarget_WSTETH_EUSD);

    console.log("targetApyAt100Utilization_WSTETH_EUSD:", targetApyAt100Utilization_WSTETH_EUSD);
    console.log("rateAtTarget_WSTETH_EUSD:", rateAtTarget_WSTETH_EUSD);
    console.log("rateAt100Utilization_WSTETH_EUSD:", rateAt100Utilization_WSTETH_EUSD);
    console.log(
      `apyAt100Util_WSTETH_EUSD: ${apyAt100Util_WSTETH_EUSD.toString()}, ${(apyAt100Util_WSTETH_EUSD / 10n ** 16n).toString()}%`,
    );
    console.log(
      `apyAtTarget_WSTETH_EUSD: ${apyAtTarget_WSTETH_EUSD.toString()}, ${(apyAtTarget_WSTETH_EUSD / 10n ** 16n).toString()}%`,
    );
    console.log();

    const totalSupply_IDLE = parseUnits("1000000", 18);
    const totalBorrow_IDLE = parseUnits("0", 18);
    const vaultAssets_IDLE = parseUnits("1000000", 18);
    const cap_IDLE = parseUnits("2000000", 18);

    // Market 1: rateAt100Utilization < max APY (7) (should withdraw to 100% util)
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      totalSupply_BSDETH_EUSD,
      totalBorrow_BSDETH_EUSD,
      vaultAssets_BSDETH_EUSD,
      cap_BSDETH_EUSD,
      rateAtTarget_BSDETH_EUSD,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util_BSDETH_EUSD,
    );

    // Market 2: High utilization, max apy is 50%, normal rebalancing (rateAt100Util not set or high enough)
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      totalSupply_WSTETH_EUSD,
      totalBorrow_WSTETH_EUSD,
      vaultAssets_WSTETH_EUSD,
      cap_WSTETH_EUSD,
      rateAtTarget_WSTETH_EUSD,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util_WSTETH_EUSD, // No rateAt100Utilization, normal rebalancing
    );

    // Market 3: Idle market
    const vaultMarketDataIdle = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      totalSupply_IDLE,
      totalBorrow_IDLE,
      vaultAssets_IDLE,
      cap_IDLE,
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
      vaultMarketDataIdle,
    ]);
    const reallocationResult = strategy.findReallocation(vaultData);

    expect(reallocationResult.isOk()).toBe(true);
    if (reallocationResult.isErr()) return;

    const result = reallocationResult.value;
    expect(result).toBeDefined();
    if (!result) return;

    expect(result[0]).toBeDefined();
    if (!result[0]) return;

    expect(result[1]).toBeDefined();
    if (!result[1]) return;

    const vaultAssets_BSDETH_EUSD_afterReallocation = result[0].assets;
    const totalSupply_BSDETH_EUSD_afterReallocation = result[0].assets;

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      totalSupply_BSDETH_EUSD_afterReallocation,
      totalBorrow_BSDETH_EUSD,
      vaultAssets_BSDETH_EUSD_afterReallocation,
      cap_BSDETH_EUSD,
      rateAtTarget_BSDETH_EUSD,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util_BSDETH_EUSD,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      rateAtTarget_BSDETH_EUSD,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    console.log();
    console.log();
    console.log();

    console.log("apy_BSDETH_EUSD:", apy_BSDETH_EUSD);

    // we should have approx 7% apy because of the buffer
    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(APY_AT_100_FOR_BSDETH_EUSD - 1);

    const vaultAssets_WSTETH_EUSD_afterReallocation = result[1].assets;
    const totalSupply_WSTETH_EUSD_afterReallocation = result[1].assets;

    const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      totalSupply_WSTETH_EUSD_afterReallocation,
      totalBorrow_WSTETH_EUSD,
      vaultAssets_WSTETH_EUSD_afterReallocation,
      cap_WSTETH_EUSD,
      rateAtTarget_WSTETH_EUSD,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util_WSTETH_EUSD,
    );

    const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_WSTETH_EUSD_afterReallocation,
      rateAtTarget_WSTETH_EUSD,
    );

    const apy_WSTETH_EUSD = parseFloat(
      (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    console.log("apy_WSTETH_EUSD:", apy_WSTETH_EUSD);

    expect(apy_WSTETH_EUSD).toBeGreaterThanOrEqual(DEFAULT_APY_RANGE.min);
    expect(apy_WSTETH_EUSD).toBeLessThanOrEqual(DEFAULT_APY_RANGE.max);
  });

  it("should keep two market at 100% utilization and deposit", () => {
    const apyAt100Number = 7;
    const DEFAULT_APY_RANGE = { min: 30, max: 40 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
      ALLOW_IDLE_REALLOCATION: true,
    });

    const totalSupply_IDLE = parseUnits("1000000", 18);
    const totalBorrow_IDLE = parseUnits("0", 18);
    const vaultAssets_IDLE = parseUnits("1000000", 18);
    const cap_IDLE = parseUnits("2000000", 18);

    const totalSupply_BSDETH_EUSD = parseUnits("10000", 18);
    const totalBorrow_BSDETH_EUSD = parseUnits("5000", 18);
    const vaultAssets_BSDETH_EUSD = parseUnits("10000", 18);
    const cap_BSDETH_EUSD = parseUnits("20000", 18);

    const targetApyAt100 = percentToWad(apyAt100Number);
    const rateAt100Util = apyToRate(targetApyAt100);
    const rateAtTarget = rateAt100Util / 4n;
    const apyAt100Util = rateToApy(rateAt100Util);

    // Market 1: rateAt100Utilization < max APY (should withdraw to 100% util)
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      totalSupply_BSDETH_EUSD,
      totalBorrow_BSDETH_EUSD,
      vaultAssets_BSDETH_EUSD,
      cap_BSDETH_EUSD,
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util,
    );

    const totalSupply_WSTETH_EUSD = parseUnits("10000", 18);
    const totalBorrow_WSTETH_EUSD = parseUnits("9800", 18);
    const vaultAssets_WSTETH_EUSD = parseUnits("10000", 18);
    const cap_WSTETH_EUSD = parseUnits("20000", 18);

    // Market 2: Very high utilization (98%), APY above max range - needs deposit
    // Starting at 98% util with 40% APY at 90%, after deposit should land in 30-40% range
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      totalSupply_WSTETH_EUSD,
      totalBorrow_WSTETH_EUSD,
      vaultAssets_WSTETH_EUSD,
      cap_WSTETH_EUSD,
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util,
    );

    // Market 3: Idle market
    const vaultMarketDataIdle = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      totalSupply_IDLE,
      totalBorrow_IDLE,
      vaultAssets_IDLE,
      cap_IDLE,
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
      vaultMarketDataIdle,
    ]);
    const reallocationResult = strategy.findReallocation(vaultData);

    expect(reallocationResult.isOk()).toBe(true);
    if (reallocationResult.isErr()) return;

    const result = reallocationResult.value;
    expect(result).toBeDefined();
    if (!result) return;

    expect(result.length).toBe(3);

    const bsdethAllocation = result.find(
      (r) => r.marketParams.collateralToken === MARKET_PARAMS_BSDETH_EUSD.collateralToken,
    );
    expect(bsdethAllocation).toBeDefined();
    if (!bsdethAllocation) expect.fail("BSDETH_EUSD reallocation not found");

    const vaultAssets_BSDETH_EUSD_afterReallocation = bsdethAllocation.assets;
    const totalSupply_BSDETH_EUSD_afterReallocation = bsdethAllocation.assets;

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      totalSupply_BSDETH_EUSD_afterReallocation,
      totalBorrow_BSDETH_EUSD,
      vaultAssets_BSDETH_EUSD_afterReallocation,
      cap_BSDETH_EUSD,
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    // we should have around 6.5% since the strategy leaves a 1% buffer when pushing to 100% util
    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(apyAt100Number - 0.5);

    const wstethAllocation = result.find(
      (r) => r.marketParams.collateralToken === MARKET_PARAMS_WSTETH_EUSD.collateralToken,
    );
    expect(wstethAllocation).toBeDefined();
    if (!wstethAllocation) expect.fail("WSTETH_EUSD reallocation not found");

    const vaultAssets_WSTETH_EUSD_afterReallocation = wstethAllocation.assets;
    const totalSupply_WSTETH_EUSD_afterReallocation = wstethAllocation.assets;

    const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      totalSupply_WSTETH_EUSD_afterReallocation,
      totalBorrow_WSTETH_EUSD,
      vaultAssets_WSTETH_EUSD_afterReallocation,
      cap_WSTETH_EUSD,
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util,
    );

    const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_WSTETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_WSTETH_EUSD = parseFloat(
      (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    // don't adjust for buffer because high number of borrows gives 7% apy after reallocation
    expect(apy_WSTETH_EUSD).toBeGreaterThanOrEqual(apyAt100Number);
  });

  it("should return no reallocation when all markets are within APY range", () => {
    const DEFAULT_APY_RANGE = { min: 3, max: 8 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
      ALLOW_IDLE_REALLOCATION: true,
    });

    // Market with APY around 5% (within 3-8% range)
    const targetApyAt90 = percentToWad(5);
    const rateAtTarget = apyToRate(targetApyAt90);
    const rateAt100Util = rateAtTarget * 4n;
    const apyAt100Util = rateToApy(rateAt100Util);

    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9000", 18), // 90% utilization
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util,
    );

    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("8500", 18), // 85% utilization
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
    ]);
    const reallocationResult = strategy.findReallocation(vaultData);

    expect(reallocationResult.isOk()).toBe(true);
    if (reallocationResult.isErr()) return;

    expect(reallocationResult.value).toBeUndefined();
  });

  it("should deposit to market above upper utilization bound", () => {
    const DEFAULT_APY_RANGE = { min: 3, max: 8 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
      ALLOW_IDLE_REALLOCATION: true,
    });

    // Market with high utilization (95%), APY above max (8%) - needs deposit
    // At 95% util with 5% APY at 90%: APY ≈ 10% (above 8% max)
    const targetApyAt90 = percentToWad(5);
    const rateAtTarget = apyToRate(targetApyAt90);
    const rateAt100Util = rateAtTarget * 4n;
    const apyAt100Util = rateToApy(rateAt100Util);

    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9500", 18), // 95% utilization - above upper bound
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util,
    );

    // Idle market with liquidity to withdraw from
    const vaultMarketData_IDLE = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      parseUnits("5000", 18), // Available liquidity in idle
      0n, // No borrows in idle
      parseUnits("5000", 18),
      parseUnits("1000000", 18),
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_IDLE,
    ]);
    const reallocationResult = strategy.findReallocation(vaultData);

    expect(reallocationResult.isOk()).toBe(true);
    if (reallocationResult.isErr()) return;

    const result = reallocationResult.value;
    expect(result).toBeDefined();
    if (!result) return;

    // Should have withdrawal from idle and deposit to BSDETH
    expect(result.length).toBe(2);

    // Find the idle withdrawal and BSDETH deposit
    const idleAllocation = result.find(
      (r) => r.marketParams.collateralToken === IDLE_MARKET_PARAMS_EUSD.collateralToken,
    );
    const bsdethAllocation = result.find(
      (r) => r.marketParams.collateralToken === MARKET_PARAMS_BSDETH_EUSD.collateralToken,
    );

    expect(idleAllocation).toBeDefined();
    expect(bsdethAllocation).toBeDefined();
    if (!idleAllocation) throw new Error("Idle allocation not found");
    if (!bsdethAllocation) throw new Error("BSDETH allocation not found");

    // Idle should have withdrawal (assets < original)
    expect(idleAllocation.assets).toBeLessThan(vaultMarketData_IDLE.vaultAssets);

    // BSDETH should have deposit (maxUint256)
    expect(bsdethAllocation.assets).toBe(maxUint256);

    // Calculate new BSDETH assets after deposit
    const withdrawalAmount = idleAllocation.assets;
    const newBsdethAssets = vaultMarketData_BSDETH_EUSD.vaultAssets + withdrawalAmount;

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      newBsdethAssets,
      parseUnits("9500", 18), // Borrow doesn't change
      newBsdethAssets,
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(DEFAULT_APY_RANGE.min);
    expect(apy_BSDETH_EUSD).toBeLessThanOrEqual(DEFAULT_APY_RANGE.max);
  });

  it("should withdraw from market below lower utilization bound", () => {
    const DEFAULT_APY_RANGE = { min: 3, max: 8 };
    const strategy = new StrategyMock({
      ...TEST_CONFIG_NO_IDLE,
      DEFAULT_APY_RANGE,
      ALLOW_IDLE_REALLOCATION: true,
    });

    // Market 1: Low utilization (40%), APY below min (3%)
    const lowRateAtTarget = apyToRate(percentToWad(2));
    const lowRateAt100Util = lowRateAtTarget * 4n;
    const apyAt100Util_BSDETH_EUSD = rateToApy(lowRateAt100Util);
    const vaultMarketData_BSDETH_EUSD = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("4000", 18), // 40% utilization - below lower bound
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      lowRateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util_BSDETH_EUSD,
    );

    // Market 2: Higher utilization (92%), APY above upper bound - needs deposit
    const targetApyAt90 = percentToWad(9); // Above max (8%)
    const rateAtTarget = apyToRate(targetApyAt90);
    const rateAt100Util_WSTETH_EUSD = rateAtTarget * 4n;
    const apyAt100Util_WSTETH_EUSD = rateToApy(rateAt100Util_WSTETH_EUSD);
    const vaultMarketData_WSTETH_EUSD = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      parseUnits("10000", 18),
      parseUnits("9200", 18), // 92% utilization - above upper bound
      parseUnits("10000", 18),
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util_WSTETH_EUSD,
    );

    // Idle market with liquidity to withdraw from
    const vaultMarketData_IDLE = createVaultMarketData(
      MARKET_ID_IDLE_EUSD as Hex,
      parseUnits("5000", 18), // Available liquidity in idle
      0n, // No borrows in idle
      parseUnits("5000", 18),
      parseUnits("1000000", 18),
      0n,
      IDLE_MARKET_PARAMS_EUSD,
      0n,
    );

    const vaultData = createVaultData(EUSD_VAULT_ADDRESS, [
      vaultMarketData_BSDETH_EUSD,
      vaultMarketData_WSTETH_EUSD,
      vaultMarketData_IDLE,
    ]);
    const reallocationResult = strategy.findReallocation(vaultData);

    expect(reallocationResult.isOk()).toBe(true);
    if (reallocationResult.isErr()) return;

    const result = reallocationResult.value;
    expect(result).toBeDefined();
    if (!result) return;

    // Should have withdrawals from BSDETH and deposits to WSTETH
    const withdrawals = result.filter((r) => r.assets < maxUint256);
    const deposits = result.filter((r) => r.assets === maxUint256);

    expect(withdrawals.length).toBeGreaterThan(0);
    expect(deposits.length).toBeGreaterThan(0);

    // Verify APY after reallocation
    const bsdethAllocation = result.find(
      (r) =>
        r.marketParams.collateralToken === MARKET_PARAMS_BSDETH_EUSD.collateralToken &&
        r.marketParams.loanToken === MARKET_PARAMS_BSDETH_EUSD.loanToken,
    );
    const wstethAllocation = result.find(
      (r) =>
        r.marketParams.collateralToken === MARKET_PARAMS_WSTETH_EUSD.collateralToken &&
        r.marketParams.loanToken === MARKET_PARAMS_WSTETH_EUSD.loanToken,
    );

    if (!bsdethAllocation) throw new Error("BSDETH allocation not found");

    const apy_BSDETH_EUSD_before = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD,
      lowRateAtTarget,
    );
    const apyBefore = parseFloat((Number(apy_BSDETH_EUSD_before) / 1e16).toFixed(1));
    expect(apyBefore).toBeLessThan(DEFAULT_APY_RANGE.min);

    const vaultMarketData_BSDETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_BSDETH_EUSD as Hex,
      bsdethAllocation.assets,
      parseUnits("4000", 18), // Borrow doesn't change
      bsdethAllocation.assets,
      parseUnits("20000", 18),
      lowRateAtTarget,
      MARKET_PARAMS_BSDETH_EUSD,
      apyAt100Util_BSDETH_EUSD,
    );

    const apy_BSDETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_BSDETH_EUSD_afterReallocation,
      lowRateAtTarget,
    );

    const apy_BSDETH_EUSD = parseFloat(
      (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    expect(apy_BSDETH_EUSD).toBeGreaterThanOrEqual(DEFAULT_APY_RANGE.min);
    expect(apy_BSDETH_EUSD).toBeLessThanOrEqual(DEFAULT_APY_RANGE.max);

    if (!wstethAllocation) throw new Error("WSTETH allocation not found");

    let newWstethAssets: bigint;
    if (wstethAllocation.assets === maxUint256) {
      // Calculate deposit amount from withdrawal
      const withdrawalAmount = vaultMarketData_BSDETH_EUSD.vaultAssets - bsdethAllocation.assets;
      newWstethAssets = vaultMarketData_WSTETH_EUSD.vaultAssets + withdrawalAmount;
    } else {
      newWstethAssets = wstethAllocation.assets;
    }

    const vaultMarketData_WSTETH_EUSD_afterReallocation = createVaultMarketData(
      MARKET_ID_WSTETH_EUSD as Hex,
      newWstethAssets,
      parseUnits("9200", 18), // Borrow doesn't change
      newWstethAssets,
      parseUnits("20000", 18),
      rateAtTarget,
      MARKET_PARAMS_WSTETH_EUSD,
      apyAt100Util_WSTETH_EUSD,
    );

    const apy_WSTETH_EUSD_afterReallocation = calculateApyFromState(
      vaultMarketData_WSTETH_EUSD_afterReallocation,
      rateAtTarget,
    );

    const apy_WSTETH_EUSD = parseFloat(
      (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toFixed(1),
    );

    expect(apy_WSTETH_EUSD).toBeGreaterThanOrEqual(DEFAULT_APY_RANGE.min);
    expect(apy_WSTETH_EUSD).toBeLessThanOrEqual(DEFAULT_APY_RANGE.max);
  });
});
