import { Range } from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, maxUint184, maxUint256, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ApyRange } from "../../../src/strategies/apyRange/index.js";
import {
  apyToRate,
  rateToApy,
  percentToWad,
  WAD,
  rateToUtilization,
  utilizationToRate,
} from "../../../src/utils/maths.js";
import { MarketParams, VaultData, VaultMarketData } from "../../../src/utils/types.js";
import { abs } from "../helpers.js";

// ============================================================================
// Constants & Test Fixtures
// ============================================================================

const TOLERANCE_INVERSE_FUNCTIONS = parseUnits("1", 12); // 0.0001% precision

// Mock market IDs for unit tests
const marketId1 = "0x60f25d76d9cd6762dabce33cc13d2d018f0d33f9bd62323a7fbe0726e0518388";
const marketId2 = "0x88d40fc93bdfe3328504a780f04c193e2938e0ec3d92e6339b6a960f4584229a";
const idleMarketId = "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8";

// ============================================================================
// Test Configuration Interface & Strategy Class
// ============================================================================

interface TestConfig {
  ALLOW_IDLE_REALLOCATION: boolean;
  DEFAULT_APY_RANGE: Range;
  vaultsDefaultApyRanges: Record<number, Record<Address, Range>>;
  marketsDefaultApyRanges: Record<number, Record<Hex, Range>>;
}

class TestableApyRange extends ApyRange {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getMinApyDeltaBips(_chainId: number, _vaultAddress: Address, _marketId: Hex) {
    return 25; // 0.25% = 25 bips
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create mock market data for unit tests
 */
function createMockMarketData(
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

/**
 * Create vault data structure
 */
function createVaultData(vaultAddress: Address, marketsData: VaultMarketData[]): VaultData {
  const marketsMap = new Map<Hex, VaultMarketData>();
  for (const marketData of marketsData) {
    marketsMap.set(marketData.id, marketData);
  }
  return { vaultAddress, marketsData: marketsMap };
}

describe("apyRange strategy - unit tests", () => {
  // Market parameters for unit tests
  const MOCK_MARKET_PARAMS: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, // WBTC
    oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83" as Address,
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as Address,
    lltv: parseUnits("0.77", 18),
  };

  const MOCK_MARKET_PARAMS_2: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, // WETH
    oracle: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as Address,
    lltv: parseUnits("0.86", 18),
  };

  const IDLE_MARKET_PARAMS: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
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

  const MOCK_VAULT_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;

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

  describe("100% utilization reallocation scenarios", () => {
    // it("should withdraw from market when rateAt100Utilization is below max APY range", () => {
    //   const strategy = new TestableApyRange({
    //     ...TEST_CONFIG_NO_IDLE,
    //     DEFAULT_APY_RANGE: { min: 3, max: 8 },
    //   });

    //   // To get an APY of ~7% at 100% utilization (which is < 8%)
    //   // We need: rateAt100Util = apyToRate(7%)
    //   // And: rateAtTarget = rateAt100Util / 4 (since CURVE_STEEPNESS = 4)
    //   const targetApyAt100 = percentToWad(7); // 7% APY
    //   const rateAt100Util = apyToRate(targetApyAt100);
    //   const rateAtTarget = rateAt100Util / 4n;

    //   // Verify our test setup: apyAt100Util should be less than 8%
    //   const apyAt100Util = rateToApy(rateAt100Util);
    //   expect(apyAt100Util).toBeLessThan(percentToWad(8));

    //   // Create a market where rateAt100Utilization (as APY) is less than max range (8%)
    //   // This should trigger a withdrawal to push utilization to 100%
    //   const market1 = createMockMarketData(
    //     marketId1 as Hex,
    //     parseUnits("10000", 6), // totalSupply
    //     parseUnits("5000", 6), // totalBorrow - 50% utilization
    //     parseUnits("5000", 6), // vaultAssets
    //     parseUnits("20000", 6), // cap
    //     rateAtTarget,
    //     MOCK_MARKET_PARAMS,
    //     rateAt100Util, // rateAt100Utilization
    //   );

    //   const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
    //   const result = strategy.findReallocation(vaultData);

    //   // Should return a reallocation
    //   expect(result).toBeDefined();
    //   if (!result) return;

    //   expect(result.length).toBeGreaterThan(0);

    //   // Should have a withdrawal for this market
    //   const market1Allocation = result.find(
    //     (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
    //   );
    //   expect(market1Allocation).toBeDefined();

    //   // The withdrawal should equal totalBorrowAssets (to push util to 100%)
    //   // assets field should equal totalBorrowAssets
    //   expect(market1Allocation?.assets).toBe(parseUnits("5000", 6));
    // });

    // it("should create withdrawal-only reallocation when all markets need to push to 100% util", () => {
    //   const strategy = new TestableApyRange({
    //     ...TEST_CONFIG_NO_IDLE,
    //     DEFAULT_APY_RANGE: { min: 3, max: 8 },
    //   });

    //   const targetApyAt100 = percentToWad(7);
    //   const rateAt100Util = apyToRate(targetApyAt100);
    //   const rateAtTarget = rateAt100Util / 4n;

    //   // Multiple markets where rateAt100Utilization < max APY
    //   const market1 = createMockMarketData(
    //     marketId1 as Hex,
    //     parseUnits("10000", 6),
    //     parseUnits("5000", 6),
    //     parseUnits("5000", 6),
    //     parseUnits("20000", 6),
    //     rateAtTarget,
    //     MOCK_MARKET_PARAMS,
    //     rateAt100Util,
    //   );

    //   const market2 = createMockMarketData(
    //     marketId2 as Hex,
    //     parseUnits("8000", 6),
    //     parseUnits("4000", 6),
    //     parseUnits("4000", 6),
    //     parseUnits("15000", 6),
    //     rateAtTarget,
    //     MOCK_MARKET_PARAMS_2,
    //     rateAt100Util,
    //   );

    //   const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
    //   const result = strategy.findReallocation(vaultData);

    //   expect(result).toBeDefined();
    //   if (!result) return;

    //   // Should have withdrawals for both markets
    //   expect(result.length).toBe(2);

    //   const market1Allocation = result.find(
    //     (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
    //   );
    //   const market2Allocation = result.find(
    //     (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
    //   );

    //   expect(market1Allocation).toBeDefined();
    //   expect(market2Allocation).toBeDefined();

    //   // Both should be withdrawals (assets = totalBorrowAssets)
    //   expect(market1Allocation?.assets).toBe(parseUnits("5000", 6));
    //   expect(market2Allocation?.assets).toBe(parseUnits("4000", 6));
    // });

    // it("should handle mixed scenario: some markets push to 100%, others rebalance normally", () => {
    //   const strategy = new TestableApyRange({
    //     ...TEST_CONFIG_NO_IDLE,
    //     DEFAULT_APY_RANGE: { min: 3, max: 8 },
    //   });

    //   const targetApyAt100 = percentToWad(7);
    //   const lowRateAt100Util = apyToRate(targetApyAt100);
    //   const lowRateAtTarget = lowRateAt100Util / 4n;

    //   const highRateAtTarget = parseUnits("0.08", 18) / (365n * 24n * 60n * 60n);

    //   // Market 1: rateAt100Utilization < max APY (should withdraw to 100% util)
    //   const market1 = createMockMarketData(
    //     marketId1 as Hex,
    //     parseUnits("10000", 6),
    //     parseUnits("5000", 6),
    //     parseUnits("5000", 6),
    //     parseUnits("20000", 6),
    //     lowRateAtTarget,
    //     MOCK_MARKET_PARAMS,
    //     lowRateAt100Util,
    //   );

    //   // Market 2: High utilization, normal rebalancing (rateAt100Util not set or high enough)
    //   const market2 = createMockMarketData(
    //     marketId2 as Hex,
    //     parseUnits("10000", 6),
    //     parseUnits("9500", 6), // 95% utilization - needs deposit
    //     parseUnits("5000", 6),
    //     parseUnits("20000", 6),
    //     highRateAtTarget,
    //     MOCK_MARKET_PARAMS_2,
    //     undefined, // No rateAt100Utilization, normal rebalancing
    //   );

    //   const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
    //   const result = strategy.findReallocation(vaultData);

    //   expect(result).toBeDefined();
    //   if (!result) return;

    //   expect(result.length).toBeGreaterThan(0);

    //   const market1Allocation = result.find(
    //     (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
    //   );
    //   const market2Allocation = result.find(
    //     (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
    //   );

    //   // Market 1 should have withdrawal to push to 100% util
    //   expect(market1Allocation).toBeDefined();
    //   if (market1Allocation) {
    //     // The withdrawal should equal totalBorrowAssets (to push util to 100%)
    //     expect(market1Allocation.assets).toBe(parseUnits("5000", 6));
    //   }

    //   // Market 2 might receive deposit from market 1's withdrawal
    //   if (market2Allocation) {
    //     // Market 2 should receive a deposit (either maxUint256 or more than current vaultAssets)
    //     const isDeposit =
    //       market2Allocation.assets === maxUint256 ||
    //       market2Allocation.assets > parseUnits("5000", 6);
    //     expect(isDeposit).toBe(true);
    //   }
    // });

    it("should keep one market at 100% utilization and withdraw from the other market", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 8 },
      });

      const targetApyAt100 = percentToWad(7);
      const lowRateAt100Util = apyToRate(targetApyAt100);
      const lowRateAtTarget = lowRateAt100Util / 4n;

      const highRateAtTarget = parseUnits("0.08", 18) / (365n * 24n * 60n * 60n);
      console.log("highRateAtTarget:", highRateAtTarget);

      // Market 1: rateAt100Utilization < max APY (should withdraw to 100% util)
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("5000", 6),
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        lowRateAtTarget,
        MOCK_MARKET_PARAMS,
        lowRateAt100Util,
      );

      // Market 2: High utilization, normal rebalancing (rateAt100Util not set or high enough)
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization - needs deposit
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        highRateAtTarget,
        MOCK_MARKET_PARAMS_2,
        undefined, // No rateAt100Utilization, normal rebalancing
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeDefined();
      if (!result) return;

      for (const reallocation of result) {
        console.log(
          "reallocation.marketParams.collateralToken:",
          reallocation.marketParams.collateralToken,
        );
        console.log("reallocation.assets:", reallocation.assets);
        console.log();
      }
      expect(result.length).toBeGreaterThan(0);

      const market1Allocation = result.find(
        (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
      );
      const market2Allocation = result.find(
        (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
      );

      // Market 1 should have withdrawal to push to 100% util
      expect(market1Allocation).toBeDefined();
      if (market1Allocation) {
        // The withdrawal should equal totalBorrowAssets (to push util to 100%)
        expect(market1Allocation.assets).toBe(parseUnits("5000", 6));
      }

      // Market 2 might receive deposit from market 1's withdrawal
      if (market2Allocation) {
        // Market 2 should receive a deposit (either maxUint256 or more than current vaultAssets)
        const isDeposit =
          market2Allocation.assets === maxUint256 ||
          market2Allocation.assets > parseUnits("5000", 6);
        expect(isDeposit).toBe(true);
      }
    });

    it("should not reallocate when rateAt100Utilization is above or equal to max APY", async () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 8 },
      });

      // To get an APY of 9% at 100% utilization (which is > 8%)
      const targetApyAt100 = percentToWad(9); // 9% APY
      const highRateAt100Util = apyToRate(targetApyAt100);
      const highRateAtTarget = highRateAt100Util / 4n;

      // Verify our test setup: apyAt100Util should be >= 8%
      const apyAt100Util = rateToApy(highRateAt100Util);
      expect(apyAt100Util).toBeGreaterThanOrEqual(percentToWad(8));

      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("5000", 6), // 50% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        highRateAtTarget,
        MOCK_MARKET_PARAMS,
        highRateAt100Util,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
      const result = await strategy.findReallocation(vaultData);

      // Should not trigger reallocation since utilization is within range
      // and rateAt100Util >= max APY
      expect(result).toBeUndefined();
    });
  });
});
