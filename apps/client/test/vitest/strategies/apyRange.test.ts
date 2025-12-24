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

// Mock market IDs for unit tests
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

  const TEST_CONFIG_WITH_IDLE: TestConfig = {
    DEFAULT_APY_RANGE: { min: 3, max: 8 },
    vaultsDefaultApyRanges: {},
    marketsDefaultApyRanges: {},
    ALLOW_IDLE_REALLOCATION: true,
  };

  // const MOCK_VAULT_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;

  // describe("utilizationToRate and rateToUtilization inverse functions", () => {
  //   const RATE_AT_TARGET_4_PERCENT = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
  //   const CURVE_STEEPNESS = 4n;

  //   it("should be inverse functions for utilization below target", () => {
  //     const utilization = parseUnits("0.5", 18); // 50%

  //     const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
  //     const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

  //     expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
  //   });

  //   it("should be inverse functions for utilization at target (90%)", () => {
  //     const utilization = parseUnits("0.9", 18); // 90% = TARGET_UTILIZATION

  //     const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
  //     const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

  //     expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
  //   });

  //   it("should be inverse functions for utilization above target", () => {
  //     const utilization = parseUnits("0.95", 18); // 95%

  //     const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
  //     const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

  //     expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
  //   });

  //   it("should return minRate for 0% utilization", () => {
  //     const rate = utilizationToRate(0n, RATE_AT_TARGET_4_PERCENT);
  //     const minRate = RATE_AT_TARGET_4_PERCENT / CURVE_STEEPNESS;

  //     expect(rate).toBe(minRate);
  //   });

  //   it("should return maxRate for 100% utilization", () => {
  //     const rate = utilizationToRate(WAD, RATE_AT_TARGET_4_PERCENT);
  //     const maxRate = RATE_AT_TARGET_4_PERCENT * CURVE_STEEPNESS;

  //     expect(rate).toBe(maxRate);
  //   });
  // });

  // describe("no reallocation scenarios", () => {
  //   it("should return undefined when all markets are within APY range", async () => {
  //     const strategy = new TestableApyRange(TEST_CONFIG_NO_IDLE);
  //     const rateAtTarget = parseUnits("0.06", 18) / (365n * 24n * 60n * 60n);

  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("5000", 6), // 50% utilization → ~5% APY (within 3-8% range)
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeUndefined();
  //   });

  //   it("should return undefined when APY delta is below minimum threshold", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_NO_IDLE,
  //       DEFAULT_APY_RANGE: { min: 5, max: 5.1 }, // Very narrow range
  //     });

  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("5000", 6),
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       parseUnits("0.05", 18) / (365n * 24n * 60n * 60n),
  //       MOCK_MARKET_PARAMS,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeUndefined();
  //   });

  //   it("should return undefined when there are no non-idle markets", async () => {
  //     const strategy = new TestableApyRange(TEST_CONFIG_WITH_IDLE);

  //     const idleMarket = createMockMarketData(
  //       idleMarketId as Hex,
  //       parseUnits("10000", 6),
  //       0n,
  //       parseUnits("5000", 6),
  //       maxUint184,
  //       0n,
  //       IDLE_MARKET_PARAMS,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [idleMarket]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeUndefined();
  //   });
  // });

  // describe("reallocation scenarios", () => {
  //   it("should propose deposit when market utilization is above max APY", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_NO_IDLE,
  //       DEFAULT_APY_RANGE: { min: 3, max: 6 },
  //     });

  //     const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

  //     // Market 1: High utilization (above max APY) - needs deposit
  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("9500", 6), // 95% utilization = very high APY
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     // Market 2: Low utilization (below min APY) - source of liquidity
  //     const market2 = createMockMarketData(
  //       marketId2 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("1000", 6), // 10% utilization = low APY
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS_2,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeDefined();
  //     if (!result) return;

  //     // Should have both withdrawal and deposit operations
  //     expect(result.length).toBeGreaterThanOrEqual(1);

  //     // Verify we have at least one withdrawal (from low util market)
  //     const hasWithdrawal = result.some((r) => {
  //       const market = Array.from(vaultData.marketsData.values()).find(
  //         (m) => m.params.collateralToken === r.marketParams.collateralToken,
  //       );
  //       return market && r.assets < market.vaultAssets;
  //     });

  //     // Verify we have at least one deposit (to high util market or maxUint256)
  //     const hasDeposit = result.some(
  //       (r) =>
  //         r.assets === maxUint256 ||
  //         Array.from(vaultData.marketsData.values()).some(
  //           (m) =>
  //             m.params.collateralToken === r.marketParams.collateralToken &&
  //             r.assets > m.vaultAssets,
  //         ),
  //     );

  //     expect(hasWithdrawal || hasDeposit).toBe(true);
  //   });

  //   it("should deposit excess liquidity to idle market when ALLOW_IDLE_REALLOCATION is true", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_WITH_IDLE,
  //       DEFAULT_APY_RANGE: { min: 3, max: 6 },
  //       ALLOW_IDLE_REALLOCATION: true,
  //     });

  //     const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

  //     // Market 1: High utilization (above max APY) - needs deposit
  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("9500", 6), // 95% utilization
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     // Market 2: Low utilization (below min APY) - source of liquidity
  //     const market2 = createMockMarketData(
  //       marketId2 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("2300", 6), // 23% utilization
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS_2,
  //     );

  //     // Idle market - should receive excess liquidity
  //     const idleMarket = createMockMarketData(
  //       idleMarketId as Hex,
  //       parseUnits("1000", 6),
  //       0n,
  //       parseUnits("100", 6),
  //       maxUint184,
  //       0n,
  //       IDLE_MARKET_PARAMS,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2, idleMarket]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeDefined();
  //     if (!result) return;

  //     expect(result.length).toBeGreaterThan(0);

  //     // Verify allocations - at least some should be present
  //     const market2Allocation = result.find(
  //       (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
  //     );
  //     const market1Allocation = result.find(
  //       (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
  //     );
  //     const idleAllocation = result.find((a) => a.marketParams.collateralToken === zeroAddress);

  //     // At least one reallocation should be present
  //     expect(
  //       market2Allocation !== undefined ||
  //         market1Allocation !== undefined ||
  //         idleAllocation !== undefined,
  //     ).toBe(true);

  //     // If idle allocation exists, it should be maxUint256 (deposit all remaining)
  //     if (idleAllocation) {
  //       expect(idleAllocation.assets).toBe(maxUint256);
  //     }
  //   });

  //   it("should use idle market as source when withdrawing and ALLOW_IDLE_REALLOCATION is false", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_NO_IDLE,
  //       DEFAULT_APY_RANGE: { min: 3, max: 6 },
  //       ALLOW_IDLE_REALLOCATION: false,
  //     });

  //     const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

  //     // Market with high utilization needs deposit
  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("9500", 6), // 95% utilization
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     // Idle market with assets available
  //     const idleMarket = createMockMarketData(
  //       idleMarketId as Hex,
  //       parseUnits("10000", 6),
  //       0n,
  //       parseUnits("5000", 6),
  //       maxUint184,
  //       0n,
  //       IDLE_MARKET_PARAMS,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, idleMarket]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeDefined();

  //     const idleAllocation = result?.find((a) => a.marketParams.collateralToken === zeroAddress);
  //     if (idleAllocation) {
  //       expect(idleAllocation.assets).toBeLessThan(parseUnits("5000", 6));
  //     }
  //   });
  // });

  // describe("getApyRange configuration priority", () => {
  //   it("should use market-specific range over vault default", () => {
  //     const marketSpecificRange = { min: 10, max: 15 };
  //     const vaultDefaultRange = { min: 5, max: 8 };

  //     const strategy = new TestableApyRange({
  //       DEFAULT_APY_RANGE: { min: 3, max: 8 },
  //       vaultsDefaultApyRanges: {
  //         [mainnet.id]: { [MOCK_VAULT_ADDRESS]: vaultDefaultRange },
  //       },
  //       marketsDefaultApyRanges: {
  //         [mainnet.id]: { [marketId1]: marketSpecificRange },
  //       },
  //       ALLOW_IDLE_REALLOCATION: false,
  //     });

  //     const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

  //     expect(range.min).toBe(percentToWad(marketSpecificRange.min));
  //     expect(range.max).toBe(percentToWad(marketSpecificRange.max));
  //   });

  //   it("should use vault default when no market-specific range", () => {
  //     const vaultDefaultRange = { min: 5, max: 8 };

  //     const strategy = new TestableApyRange({
  //       DEFAULT_APY_RANGE: { min: 3, max: 8 },
  //       vaultsDefaultApyRanges: {
  //         [mainnet.id]: { [MOCK_VAULT_ADDRESS]: vaultDefaultRange },
  //       },
  //       marketsDefaultApyRanges: {},
  //       ALLOW_IDLE_REALLOCATION: false,
  //     });

  //     const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

  //     expect(range.min).toBe(percentToWad(vaultDefaultRange.min));
  //     expect(range.max).toBe(percentToWad(vaultDefaultRange.max));
  //   });

  //   it("should use global default when no vault or market specific range", () => {
  //     const globalDefault = { min: 3, max: 8 };

  //     const strategy = new TestableApyRange({
  //       DEFAULT_APY_RANGE: globalDefault,
  //       vaultsDefaultApyRanges: {},
  //       marketsDefaultApyRanges: {},
  //       ALLOW_IDLE_REALLOCATION: false,
  //     });

  //     const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

  //     expect(range.min).toBe(percentToWad(globalDefault.min));
  //     expect(range.max).toBe(percentToWad(globalDefault.max));
  //   });
  // });

  // describe("edge cases", () => {
  //   it("should handle market at full cap (no depositable amount)", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_NO_IDLE,
  //       DEFAULT_APY_RANGE: { min: 3, max: 6 },
  //     });

  //     const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

  //     // Market 1: High utilization but already at cap
  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("9500", 6), // 95% utilization
  //       parseUnits("10000", 6), // vault assets = cap
  //       parseUnits("10000", 6), // cap
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     // Market 2: Low utilization
  //     const market2 = createMockMarketData(
  //       marketId2 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("1000", 6),
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS_2,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result === undefined || result.length >= 0).toBe(true);
  //   });

  //   it("should handle market with no vault assets (no withdrawable amount)", async () => {
  //     const strategy = new TestableApyRange({
  //       ...TEST_CONFIG_NO_IDLE,
  //       DEFAULT_APY_RANGE: { min: 3, max: 6 },
  //     });

  //     const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

  //     // Market 1: High utilization
  //     const market1 = createMockMarketData(
  //       marketId1 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("9500", 6),
  //       parseUnits("5000", 6),
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS,
  //     );

  //     // Market 2: Low utilization but no vault assets
  //     const market2 = createMockMarketData(
  //       marketId2 as Hex,
  //       parseUnits("10000", 6),
  //       parseUnits("1000", 6),
  //       0n, // no vault assets
  //       parseUnits("20000", 6),
  //       rateAtTarget,
  //       MOCK_MARKET_PARAMS_2,
  //     );

  //     const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
  //     const result = await strategy.findReallocation(vaultData);

  //     expect(result).toBeDefined();
  //   });
  // });

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
});
