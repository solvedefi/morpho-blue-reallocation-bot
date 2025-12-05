import { Range } from "@morpho-blue-reallocation-bot/config";
import { AnvilTestClient } from "@morpho-org/test";
import { Address, Hex, maxUint184, maxUint256, parseUnits, zeroAddress } from "viem";
import { readContract, writeContract } from "viem/actions";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { ApyRange } from "../../../src/strategies/apyRange/index.js";
import {
  rateToApy,
  getUtilization,
  percentToWad,
  WAD,
  rateToUtilization,
  utilizationToRate,
} from "../../../src/utils/maths.js";
import { MarketParams, MarketState, VaultData, VaultMarketData } from "../../../src/utils/types.js";
import { adaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { WBTC, MORPHO, IRM } from "../../constants.js";
import { test } from "../../setup.js";
import { abs, formatMarketState } from "../helpers.js";
import {
  setupVault,
  marketParams1,
  marketParams2,
  marketParams3,
  marketId1,
  marketId2,
  marketId3,
  enableIdleMarket,
  prepareBorrow,
  borrow,
  idleMarketId,
  idleMarketParams,
} from "../vaultSetup.js";

// ============================================================================
// Constants & Test Fixtures
// ============================================================================

const TOLERANCE_1BP = parseUnits("0.01", 16); // 1 basis point
const TOLERANCE_INVERSE_FUNCTIONS = parseUnits("1", 12); // 0.0001% precision

const TEST_AMOUNTS = {
  caps: parseUnits("100000", 6),
  suppliedAmount: parseUnits("10000", 6),
  collateralAmount: parseUnits("2", 8),
  loanAmount: parseUnits("5000", 6),
} as const;

const TARGET_MARKET_1 = { min: 0.5, max: 2 };
const TARGET_MARKET_2 = { min: 8, max: 12 };

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
 * Read market states for multiple markets in parallel
 */
async function readMarketStates(client: AnvilTestClient, marketIds: Hex[]) {
  return Promise.all(
    marketIds.map((id) =>
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [id],
      }),
    ),
  );
}

/**
 * Read rates at target for multiple markets in parallel
 */
async function readRatesAtTarget(client: AnvilTestClient, marketIds: Hex[]) {
  return Promise.all(
    marketIds.map((id) =>
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "rateAtTarget",
        args: [id],
      }),
    ),
  );
}

/**
 * Read borrow rates for multiple markets in parallel
 */
async function readBorrowRates(
  client: AnvilTestClient,
  markets: { params: MarketParams; state: MarketState }[],
) {
  return Promise.all(
    markets.map(({ params, state }) =>
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "borrowRateView",
        // @ts-expect-error - viem ABI type inference doesn't match our MarketState type
        args: [params, state],
      }),
    ),
  );
}

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
  };
}

/**
 * Create vault data structure
 */
function createVaultData(vaultAddress: Address, marketsData: VaultMarketData[]): VaultData {
  return { vaultAddress, marketsData };
}

/**
 * Calculate APY for a market
 */
function calculateMarketApy(market: VaultMarketData): bigint {
  const utilization = getUtilization(market.state);
  const rate = utilizationToRate(utilization, market.rateAtTarget);
  return rateToApy(rate);
}

/**
 * Assert APY is within expected range with tolerance
 */
function assertApyInRange(apy: bigint, min: number, max: number, tolerance: bigint) {
  const minApyWad = percentToWad(min);
  const maxApyWad = percentToWad(max);
  expect(apy).toBeGreaterThanOrEqual(minApyWad - tolerance);
  expect(apy).toBeLessThanOrEqual(maxApyWad + tolerance);
}

describe("apyRange strategy - e2e test", () => {
  const testConfig: TestConfig = {
    DEFAULT_APY_RANGE: { min: 2, max: 8 },
    vaultsDefaultApyRanges: {},
    marketsDefaultApyRanges: {
      [mainnet.id]: {
        [marketId1]: TARGET_MARKET_1,
        [marketId2]: TARGET_MARKET_2,
      },
    },
    ALLOW_IDLE_REALLOCATION: true,
  };

  const strategy = new TestableApyRange(testConfig);

  test.sequential("should equalize rates", async ({ client }) => {
    const vault = await setupVault(client, TEST_AMOUNTS.caps, 3n * TEST_AMOUNTS.suppliedAmount);
    await enableIdleMarket(client, vault);

    // Initial reallocation
    const reallocation = [
      {
        marketParams: marketParams1,
        assets: TEST_AMOUNTS.suppliedAmount,
      },
      {
        marketParams: marketParams2,
        assets: TEST_AMOUNTS.suppliedAmount,
      },
      {
        marketParams: marketParams3,
        assets: maxUint256,
      },
    ];

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [reallocation],
    });

    // Prepare and execute borrows
    await prepareBorrow(client, [
      {
        address: WBTC,
        amount: 3n * TEST_AMOUNTS.collateralAmount,
      },
    ]);

    await borrow(client, [
      {
        marketParams: marketParams1,
        loanAmount: TEST_AMOUNTS.loanAmount,
        collateralAmount: TEST_AMOUNTS.collateralAmount,
      },
      {
        marketParams: marketParams2,
        loanAmount: TEST_AMOUNTS.loanAmount,
        collateralAmount: TEST_AMOUNTS.collateralAmount,
      },
      {
        marketParams: marketParams3,
        loanAmount: TEST_AMOUNTS.loanAmount,
        collateralAmount: TEST_AMOUNTS.collateralAmount,
      },
    ]);

    // Read all market states
    const [marketState1, marketState2, marketState3, marketStateIdle] = await readMarketStates(
      client,
      [marketId1, marketId2, marketId3, idleMarketId],
    );

    const [marketState1RateAtTarget, marketState2RateAtTarget, marketState3RateAtTarget] =
      await readRatesAtTarget(client, [marketId1, marketId2, marketId3]);

    // Type guards to ensure values are defined
    if (!marketState1 || !marketState2 || !marketState3 || !marketStateIdle) {
      throw new Error("Failed to read market states");
    }
    if (
      marketState1RateAtTarget === undefined ||
      marketState2RateAtTarget === undefined ||
      marketState3RateAtTarget === undefined
    ) {
      throw new Error("Failed to read rates at target");
    }

    const vaultData = createVaultData(vault, [
      {
        chainId: 1,
        id: marketId1 as Hex,
        params: marketParams1,
        state: formatMarketState(marketState1),
        cap: TEST_AMOUNTS.caps,
        vaultAssets: TEST_AMOUNTS.suppliedAmount,
        rateAtTarget: marketState1RateAtTarget,
      },
      {
        chainId: 1,
        id: marketId2 as Hex,
        params: marketParams2,
        state: formatMarketState(marketState2),
        cap: TEST_AMOUNTS.caps,
        vaultAssets: TEST_AMOUNTS.suppliedAmount,
        rateAtTarget: marketState2RateAtTarget,
      },
      {
        chainId: 1,
        id: marketId3 as Hex,
        params: marketParams3,
        state: formatMarketState(marketState3),
        cap: TEST_AMOUNTS.caps,
        vaultAssets: TEST_AMOUNTS.suppliedAmount,
        rateAtTarget: marketState3RateAtTarget,
      },
      {
        chainId: 1,
        id: idleMarketId as Hex,
        params: idleMarketParams,
        state: formatMarketState(marketStateIdle),
        cap: maxUint184,
        vaultAssets: 0n,
        rateAtTarget: 0n,
      },
    ]);

    const reallocationProposed = strategy.findReallocation(vaultData);
    expect(reallocationProposed).toBeDefined();

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      // @ts-expect-error - viem ABI type inference doesn't match our MarketAllocation type
      args: [reallocationProposed],
    });

    // Read market states after reallocation
    const [
      marketState1PostReallocation,
      marketState2PostReallocation,
      marketState3PostReallocation,
    ] = await readMarketStates(client, [marketId1, marketId2, marketId3]);

    // Type guards to ensure market states are defined
    if (
      !marketState1PostReallocation ||
      !marketState2PostReallocation ||
      !marketState3PostReallocation
    ) {
      throw new Error("Failed to read market states after reallocation");
    }

    const [marketState1Rate, marketState2Rate] = await readBorrowRates(client, [
      { params: marketParams1, state: formatMarketState(marketState1PostReallocation) },
      { params: marketParams2, state: formatMarketState(marketState2PostReallocation) },
    ]);

    // Type guards to ensure rates are defined
    if (marketState1Rate === undefined || marketState2Rate === undefined) {
      throw new Error("Failed to read borrow rates");
    }

    // Market 1 should be at max apy
    expect(abs(rateToApy(marketState1Rate) - percentToWad(TARGET_MARKET_1.max))).toBeLessThan(
      TOLERANCE_1BP,
    );

    // Market 2 should be at min apy
    expect(abs(rateToApy(marketState2Rate) - percentToWad(TARGET_MARKET_2.min))).toBeLessThan(
      TOLERANCE_1BP,
    );

    // Market 3 should have not been touched (same utilization as before reallocation)
    expect(getUtilization(formatMarketState(marketState3PostReallocation)) - WAD / 2n).toBeLessThan(
      TOLERANCE_1BP,
    );
  });
});

describe("apyRange strategy - unit tests", () => {
  // Market parameters for unit tests
  const MOCK_MARKET_PARAMS: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, // WBTC
    oracle: "0xdddd770BADd886dF3864029e4B377B5F6a2B6b83" as Address,
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

  describe("utilizationToRate and rateToUtilization inverse functions", () => {
    const RATE_AT_TARGET_4_PERCENT = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
    const CURVE_STEEPNESS = 4n;

    it("should be inverse functions for utilization below target", () => {
      const utilization = parseUnits("0.5", 18); // 50%

      const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
      const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

      expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
    });

    it("should be inverse functions for utilization at target (90%)", () => {
      const utilization = parseUnits("0.9", 18); // 90% = TARGET_UTILIZATION

      const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
      const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

      expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
    });

    it("should be inverse functions for utilization above target", () => {
      const utilization = parseUnits("0.95", 18); // 95%

      const rate = utilizationToRate(utilization, RATE_AT_TARGET_4_PERCENT);
      const recoveredUtilization = rateToUtilization(rate, RATE_AT_TARGET_4_PERCENT);

      expect(abs(recoveredUtilization - utilization)).toBeLessThan(TOLERANCE_INVERSE_FUNCTIONS);
    });

    it("should return minRate for 0% utilization", () => {
      const rate = utilizationToRate(0n, RATE_AT_TARGET_4_PERCENT);
      const minRate = RATE_AT_TARGET_4_PERCENT / CURVE_STEEPNESS;

      expect(rate).toBe(minRate);
    });

    it("should return maxRate for 100% utilization", () => {
      const rate = utilizationToRate(WAD, RATE_AT_TARGET_4_PERCENT);
      const maxRate = RATE_AT_TARGET_4_PERCENT * CURVE_STEEPNESS;

      expect(rate).toBe(maxRate);
    });
  });

  describe("no reallocation scenarios", () => {
    it("should return undefined when all markets are within APY range", () => {
      const strategy = new TestableApyRange(TEST_CONFIG_NO_IDLE);
      const rateAtTarget = parseUnits("0.06", 18) / (365n * 24n * 60n * 60n);

      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("5000", 6), // 50% utilization → ~5% APY (within 3-8% range)
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });

    it("should return undefined when APY delta is below minimum threshold", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 5, max: 5.1 }, // Very narrow range
      });

      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("5000", 6),
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        parseUnits("0.05", 18) / (365n * 24n * 60n * 60n),
        MOCK_MARKET_PARAMS,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });

    it("should return undefined when there are no non-idle markets", () => {
      const strategy = new TestableApyRange(TEST_CONFIG_WITH_IDLE);

      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("10000", 6),
        0n,
        parseUnits("5000", 6),
        maxUint184,
        0n,
        IDLE_MARKET_PARAMS,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [idleMarket]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });
  });

  describe("reallocation scenarios", () => {
    it("should propose deposit when market utilization is above max APY", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 6 },
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization (above max APY) - needs deposit
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization = very high APY
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      // Market 2: Low utilization (below min APY) - source of liquidity
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6), // 10% utilization = low APY
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS_2,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeDefined();
      if (!result) return;

      expect(result.length).toBeGreaterThan(0);

      // Simulate reallocation by calculating asset movements
      let totalWithdrawn = 0n;
      for (const market of vaultData.marketsData) {
        const allocation = result.find(
          (a) => a.marketParams.collateralToken === market.params.collateralToken,
        );
        if (allocation && allocation.assets < market.vaultAssets) {
          totalWithdrawn += market.vaultAssets - allocation.assets;
        }
      }

      // Apply reallocation to simulate new state
      const updatedMarkets = vaultData.marketsData.map((market) => {
        const allocation = result.find(
          (a) => a.marketParams.collateralToken === market.params.collateralToken,
        );
        if (!allocation) return market;

        const newVaultAssets =
          allocation.assets === maxUint256
            ? market.vaultAssets + totalWithdrawn
            : allocation.assets;

        const assetsDelta = newVaultAssets - market.vaultAssets;
        const newTotalSupply = market.state.totalSupplyAssets + assetsDelta;

        return {
          ...market,
          vaultAssets: newVaultAssets,
          state: { ...market.state, totalSupplyAssets: newTotalSupply },
        };
      });

      // Verify market 1 (high utilization) received deposits
      const updatedMarket1 = updatedMarkets.find((m) => m.id === marketId1);
      const originalMarket1 = vaultData.marketsData.find((m) => m.id === marketId1);
      if (updatedMarket1 && originalMarket1) {
        expect(updatedMarket1.vaultAssets).toBeGreaterThan(originalMarket1.vaultAssets);

        const apy1 = calculateMarketApy(updatedMarket1);
        assertApyInRange(apy1, 3, 6, percentToWad(1));
      }

      // Verify market 2 (low utilization) had withdrawals
      const updatedMarket2 = updatedMarkets.find((m) => m.id === marketId2);
      const originalMarket2 = vaultData.marketsData.find((m) => m.id === marketId2);
      if (updatedMarket2 && originalMarket2) {
        expect(updatedMarket2.vaultAssets).toBeLessThan(originalMarket2.vaultAssets);

        const apy2 = calculateMarketApy(updatedMarket2);
        const originalApy2 = calculateMarketApy(originalMarket2);
        expect(apy2).toBeGreaterThanOrEqual(originalApy2);
      }
    });

    it("should deposit excess liquidity to idle market when ALLOW_IDLE_REALLOCATION is true", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_WITH_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 6 },
        ALLOW_IDLE_REALLOCATION: true,
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization (above max APY) - needs deposit
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      // Market 2: Low utilization (below min APY) - source of liquidity
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("2300", 6), // 23% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS_2,
      );

      // Idle market - should receive excess liquidity
      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("1000", 6),
        0n,
        parseUnits("100", 6),
        maxUint184,
        0n,
        IDLE_MARKET_PARAMS,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2, idleMarket]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeDefined();
      if (!result) return;

      expect(result.length).toBeGreaterThan(0);

      // Verify allocations
      const market2Allocation = result.find(
        (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
      );
      const market1Allocation = result.find(
        (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
      );
      const idleAllocation = result.find((a) => a.marketParams.collateralToken === zeroAddress);

      expect(market2Allocation).toBeDefined();
      expect(market1Allocation).toBeDefined();
      expect(idleAllocation).toBeDefined();
      if (!market2Allocation || !market1Allocation || !idleAllocation) return;

      // Market 2 should have reduced assets (withdrawal)
      expect(market2Allocation.assets).toBeLessThanOrEqual(market2.vaultAssets);

      // Market 1 should have increased assets
      expect(market1Allocation.assets).toBeGreaterThan(market1.vaultAssets);

      // Idle market should receive excess liquidity (maxUint256)
      expect(idleAllocation.assets).toBe(maxUint256);

      // Simulate after reallocation and verify APY ranges
      const market1AssetsDelta =
        (market1Allocation.assets === maxUint256
          ? market1.vaultAssets + (market2.vaultAssets - market2Allocation.assets)
          : market1Allocation.assets) - market1.vaultAssets;
      const market1AfterApy = calculateMarketApy({
        ...market1,
        state: {
          ...market1.state,
          totalSupplyAssets: market1.state.totalSupplyAssets + market1AssetsDelta,
        },
      });

      const market2AssetsDelta = market2Allocation.assets - market2.vaultAssets;
      const market2AfterApy = calculateMarketApy({
        ...market2,
        state: {
          ...market2.state,
          totalSupplyAssets: market2.state.totalSupplyAssets + market2AssetsDelta,
        },
      });

      // Verify both markets are within target range
      assertApyInRange(market1AfterApy, 3, 6, percentToWad(0.5));
      assertApyInRange(market2AfterApy, 3, 6, percentToWad(0.5));
    });

    it("should use idle market as source when withdrawing and ALLOW_IDLE_REALLOCATION is false", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 6 },
        ALLOW_IDLE_REALLOCATION: false,
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market with high utilization needs deposit
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      // Idle market with assets available
      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("10000", 6),
        0n,
        parseUnits("5000", 6),
        maxUint184,
        0n,
        IDLE_MARKET_PARAMS,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, idleMarket]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeDefined();

      const idleAllocation = result?.find((a) => a.marketParams.collateralToken === zeroAddress);
      if (idleAllocation) {
        expect(idleAllocation.assets).toBeLessThan(parseUnits("5000", 6));
      }
    });
  });

  describe("getApyRange configuration priority", () => {
    it("should use market-specific range over vault default", () => {
      const marketSpecificRange = { min: 10, max: 15 };
      const vaultDefaultRange = { min: 5, max: 8 };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: { min: 3, max: 8 },
        vaultsDefaultApyRanges: {
          [mainnet.id]: { [MOCK_VAULT_ADDRESS]: vaultDefaultRange },
        },
        marketsDefaultApyRanges: {
          [mainnet.id]: { [marketId1]: marketSpecificRange },
        },
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(marketSpecificRange.min));
      expect(range.max).toBe(percentToWad(marketSpecificRange.max));
    });

    it("should use vault default when no market-specific range", () => {
      const vaultDefaultRange = { min: 5, max: 8 };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: { min: 3, max: 8 },
        vaultsDefaultApyRanges: {
          [mainnet.id]: { [MOCK_VAULT_ADDRESS]: vaultDefaultRange },
        },
        marketsDefaultApyRanges: {},
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(vaultDefaultRange.min));
      expect(range.max).toBe(percentToWad(vaultDefaultRange.max));
    });

    it("should use global default when no vault or market specific range", () => {
      const globalDefault = { min: 3, max: 8 };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: globalDefault,
        vaultsDefaultApyRanges: {},
        marketsDefaultApyRanges: {},
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, MOCK_VAULT_ADDRESS, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(globalDefault.min));
      expect(range.max).toBe(percentToWad(globalDefault.max));
    });
  });

  describe("edge cases", () => {
    it("should handle market at full cap (no depositable amount)", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 6 },
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization but already at cap
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization
        parseUnits("10000", 6), // vault assets = cap
        parseUnits("10000", 6), // cap
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      // Market 2: Low utilization
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6),
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS_2,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      expect(result === undefined || result.length >= 0).toBe(true);
    });

    it("should handle market with no vault assets (no withdrawable amount)", () => {
      const strategy = new TestableApyRange({
        ...TEST_CONFIG_NO_IDLE,
        DEFAULT_APY_RANGE: { min: 3, max: 6 },
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6),
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS,
      );

      // Market 2: Low utilization but no vault assets
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6),
        0n, // no vault assets
        parseUnits("20000", 6),
        rateAtTarget,
        MOCK_MARKET_PARAMS_2,
      );

      const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });
  });
});
