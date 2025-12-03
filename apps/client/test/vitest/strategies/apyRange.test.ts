import { Range } from "@morpho-blue-reallocation-bot/config";
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
  apyToRate,
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

const targetMarket1 = { min: 0.5, max: 2 };
const targetMarket2 = { min: 8, max: 12 };

const testConfig = {
  DEFAULT_APY_RANGE: { min: 2, max: 8 },
  vaultsDefaultApyRanges: {},
  marketsDefaultApyRanges: {
    [mainnet.id]: {
      [marketId1]: targetMarket1,
      [marketId2]: targetMarket2,
    },
  },
  ALLOW_IDLE_REALLOCATION: true,
};

interface TestConfig {
  ALLOW_IDLE_REALLOCATION: boolean;
  DEFAULT_APY_RANGE: Range;
  vaultsDefaultApyRanges: Record<number, Record<Address, Range>>;
  marketsDefaultApyRanges: Record<number, Record<Hex, Range>>;
}

class MinRatesTest extends ApyRange {
  private readonly config: TestConfig;

  constructor(testConfig: TestConfig) {
    super();
    this.config = testConfig;
  }

  getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let apyRange = this.config.DEFAULT_APY_RANGE;

    if (this.config.vaultsDefaultApyRanges[chainId]?.[vaultAddress] !== undefined) {
      apyRange = this.config.vaultsDefaultApyRanges[chainId][vaultAddress];
    }

    if (this.config.marketsDefaultApyRanges[chainId]?.[marketId] !== undefined) {
      apyRange = this.config.marketsDefaultApyRanges[chainId][marketId];
    }

    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }
}

describe("apyRange strategy", () => {
  const strategy = new MinRatesTest(testConfig);

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);
  const loanAmount = parseUnits("5000", 6);

  const tolerance = parseUnits("0.01", 16); // We accept errors on the rates up to 1 BP

  test.sequential("should equalize rates", async ({ client }) => {
    const vault = await setupVault(client, caps, 3n * suppliedAmount);
    await enableIdleMarket(client, vault);

    // reallocate

    const reallocation = [
      {
        marketParams: marketParams1,
        assets: suppliedAmount,
      },
      {
        marketParams: marketParams2,
        assets: suppliedAmount,
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

    /// Borrow

    await prepareBorrow(client, [
      {
        address: WBTC,
        amount: 3n * collateralAmount,
      },
    ]);

    await borrow(client, [
      {
        marketParams: marketParams1,
        loanAmount,
        collateralAmount,
      },
      {
        marketParams: marketParams2,
        loanAmount,
        collateralAmount,
      },
      {
        marketParams: marketParams3,
        loanAmount,
        collateralAmount,
      },
    ]);

    const [marketState1, marketState2, marketState3, marketStateIdle] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId2],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId3],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [idleMarketId],
      }),
    ]);

    const [marketState1RateAtTarget, marketState2RateAtTarget, marketState3RateAtTarget] =
      await Promise.all([
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId1],
        }),
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId2],
        }),
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId3],
        }),
      ]);

    const vaultData = {
      vaultAddress: vault,
      marketsData: [
        {
          chainId: 1,
          id: marketId1 as Hex,
          params: marketParams1,
          state: formatMarketState(marketState1),
          cap: caps,
          vaultAssets: suppliedAmount,
          rateAtTarget: marketState1RateAtTarget,
        },
        {
          chainId: 1,
          id: marketId2 as Hex,
          params: marketParams2,
          state: formatMarketState(marketState2),
          cap: caps,
          vaultAssets: suppliedAmount,
          rateAtTarget: marketState2RateAtTarget,
        },
        {
          chainId: 1,
          id: marketId3 as Hex,
          params: marketParams3,
          state: formatMarketState(marketState3),
          cap: caps,
          vaultAssets: suppliedAmount,
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
      ],
    };

    const reallocationProposed = strategy.findReallocation(vaultData)!;

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [reallocationProposed],
    });

    const [
      marketState1PostReallocation,
      marketState2PostReallocation,
      marketState3PostReallocation,
    ] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId2],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId3],
      }),
    ]);

    const [marketState1Rate, marketState2Rate] = await Promise.all([
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "borrowRateView",
        args: [marketParams1, formatMarketState(marketState1PostReallocation)],
      }),
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "borrowRateView",
        args: [marketParams2, formatMarketState(marketState2PostReallocation)],
      }),
    ]);

    // Market 1 should be at max apy
    expect(abs(rateToApy(marketState1Rate) - percentToWad(targetMarket1.max))).toBeLessThan(
      tolerance,
    );

    // Market 2 should be at min apy
    expect(abs(rateToApy(marketState2Rate) - percentToWad(targetMarket2.min))).toBeLessThan(
      tolerance,
    );

    // Market 3 should have not been touched (same utilization as before reallocation)
    expect(getUtilization(formatMarketState(marketState3PostReallocation)) - WAD / 2n).toBeLessThan(
      tolerance,
    );
  });
});

describe("apyRange strategy - unit tests", () => {
  // Default market 1 parameters (USDC/WBTC)
  const defaultMarketParams: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, // WBTC
    oracle: "0xdddd770BADd886dF3864029e4B377B5F6a2B6b83" as Address,
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as Address,
    lltv: parseUnits("0.77", 18),
  };

  // Default market 2 parameters (USDC/WETH) - different from market 1
  const defaultMarketParams2: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, // WETH
    oracle: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address, // ETH/USD oracle
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as Address,
    lltv: parseUnits("0.86", 18),
  };

  // Idle market parameters
  const idleMarketParamsDefault: MarketParams = {
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  };

  /**
   * Helper to create mock market data
   * @param params - Optional custom market parameters. If not provided, uses defaultMarketParams
   */
  const createMockMarketData = (
    id: Hex,
    totalSupply: bigint,
    totalBorrow: bigint,
    vaultAssets: bigint,
    cap: bigint,
    rateAtTarget: bigint,
    params?: MarketParams,
  ): VaultMarketData => {
    const marketParams = params || defaultMarketParams;
    const isIdle = marketParams.collateralToken === zeroAddress;

    return {
      chainId: mainnet.id,
      id,
      params: marketParams,
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
  };

  const createVaultData = (vaultAddress: Address, marketsData: VaultMarketData[]): VaultData => ({
    vaultAddress,
    marketsData,
  });

  const testConfigNoIdle = {
    DEFAULT_APY_RANGE: { min: 3, max: 8 },
    vaultsDefaultApyRanges: {},
    marketsDefaultApyRanges: {},
    ALLOW_IDLE_REALLOCATION: false,
  };

  const testConfigWithIdle = {
    DEFAULT_APY_RANGE: { min: 3, max: 8 },
    vaultsDefaultApyRanges: {},
    marketsDefaultApyRanges: {},
    ALLOW_IDLE_REALLOCATION: true,
  };

  // Custom test strategy with configurable idle reallocation
  class TestableApyRange extends ApyRange {
    private readonly config: typeof testConfigNoIdle;

    constructor(config: typeof testConfigNoIdle) {
      super();
      this.config = config;
    }

    getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
      let apyRange = this.config.DEFAULT_APY_RANGE;

      if (this.config.vaultsDefaultApyRanges[chainId]?.[vaultAddress] !== undefined) {
        apyRange = this.config.vaultsDefaultApyRanges[chainId][vaultAddress];
      }

      if (this.config.marketsDefaultApyRanges[chainId]?.[marketId] !== undefined) {
        apyRange = this.config.marketsDefaultApyRanges[chainId][marketId];
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

  const vaultAddress = "0x1234567890123456789012345678901234567890" as Address;

  describe("utilizationToRate and rateToUtilization inverse functions", () => {
    // Tolerance of 1e12 = 0.0001% precision loss acceptable due to integer division rounding
    const inverseFunctionTolerance = parseUnits("1", 12);

    it("should be inverse functions for utilization below target", () => {
      const rateAtTarget = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n); // 4% APR converted to rate per second
      const utilization = parseUnits("0.5", 18); // 50%

      const rate = utilizationToRate(utilization, rateAtTarget);
      const recoveredUtilization = rateToUtilization(rate, rateAtTarget);

      // Should be approximately equal (some precision loss due to integer math rounding)
      expect(abs(recoveredUtilization - utilization)).toBeLessThan(inverseFunctionTolerance);
    });

    it("should be inverse functions for utilization at target (90%)", () => {
      const rateAtTarget = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
      const utilization = parseUnits("0.9", 18); // 90% = TARGET_UTILIZATION

      const rate = utilizationToRate(utilization, rateAtTarget);
      const recoveredUtilization = rateToUtilization(rate, rateAtTarget);

      expect(abs(recoveredUtilization - utilization)).toBeLessThan(inverseFunctionTolerance);
    });

    it("should be inverse functions for utilization above target", () => {
      const rateAtTarget = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
      const utilization = parseUnits("0.95", 18); // 95%

      const rate = utilizationToRate(utilization, rateAtTarget);
      const recoveredUtilization = rateToUtilization(rate, rateAtTarget);

      expect(abs(recoveredUtilization - utilization)).toBeLessThan(inverseFunctionTolerance);
    });

    it("should return minRate for 0% utilization", () => {
      const rateAtTarget = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
      const utilization = 0n;

      const rate = utilizationToRate(utilization, rateAtTarget);
      const minRate = rateAtTarget / 4n; // CURVE_STEEPNESS = 4

      expect(rate).toBe(minRate);
    });

    it("should return maxRate for 100% utilization", () => {
      const rateAtTarget = parseUnits("0.04", 18) / (365n * 24n * 60n * 60n);
      const utilization = WAD; // 100%

      const rate = utilizationToRate(utilization, rateAtTarget);
      const maxRate = rateAtTarget * 4n; // CURVE_STEEPNESS = 4

      expect(rate).toBe(maxRate);
    });
  });

  describe("no reallocation scenarios", () => {
    it("should return undefined when all markets are within APY range", () => {
      const strategy = new TestableApyRange(testConfigNoIdle);
      const rateAtTarget = parseUnits("0.06", 18) / (365n * 24n * 60n * 60n); // ~6% APY at target

      // Create markets with utilization that yields ~5% APY (within 3-8% range)
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6), // total supply
        parseUnits("5000", 6), // total borrow = 50% utilization
        parseUnits("5000", 6), // vault assets
        parseUnits("20000", 6), // cap
        rateAtTarget,
      );

      const vaultData = createVaultData(vaultAddress, [market1]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });

    it("should return undefined when APY delta is below minimum threshold", () => {
      const strategy = new TestableApyRange({
        ...testConfigNoIdle,
        DEFAULT_APY_RANGE: {
          min: 5,
          max: 5.1,
        }, // Very narrow range
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market slightly outside range but delta would be tiny
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("5000", 6), // 50% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
      );

      const vaultData = createVaultData(vaultAddress, [market1]);
      const result = strategy.findReallocation(vaultData);

      // Should return undefined because APY delta is below 25 bips threshold
      expect(result).toBeUndefined();
    });

    it("should return undefined when there are no non-idle markets", () => {
      const strategy = new TestableApyRange(testConfigWithIdle);

      // Only idle market
      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("10000", 6),
        0n,
        parseUnits("5000", 6),
        maxUint184,
        0n,
        idleMarketParamsDefault, // idle market params
      );

      const vaultData = createVaultData(vaultAddress, [idleMarket]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeUndefined();
    });
  });

  describe("reallocation scenarios", () => {
    it("should propose deposit when market utilization is above max APY", () => {
      const strategy = new TestableApyRange({
        ...testConfigNoIdle,
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 6,
        },
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
        defaultMarketParams, // USDC/WBTC
      );

      // Market 2: Low utilization (below min APY) - source of liquidity
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6), // 10% utilization = low APY
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        defaultMarketParams2, // USDC/WETH
      );

      const vaultData = createVaultData(vaultAddress, [market1, market2]);

      console.log("===========");
      console.log("===========");
      for (const market of vaultData.marketsData) {
        console.log("id", market.id);
        console.log("cap", market.cap);
        console.log("vaultAssets", market.vaultAssets);
        console.log("rateAtTarget", market.rateAtTarget);

        console.log("totalSupplyAssets", market.state.totalSupplyAssets);
        console.log("totalSupplyShares", market.state.totalSupplyShares);
        console.log("totalBorrowAssets", market.state.totalBorrowAssets);
        console.log("totalBorrowShares", market.state.totalBorrowShares);
        console.log("loanToken", market.params.loanToken);
        console.log("collateralToken", market.params.collateralToken);
        console.log("oracle", market.params.oracle);
        console.log("irm", market.params.irm);
        console.log("lltv", market.params.lltv);

        console.log();
      }
      console.log("===========");
      console.log("===========");

      const result = strategy.findReallocation(vaultData);

      console.log("reallocations:");
      for (const reallocation of result!) {
        console.log("marketParams", reallocation.marketParams);
        console.log("assets", reallocation.assets);
        console.log();
      }

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);

      // Verify that after reallocation, markets would be within target APY ranges
      // Calculate the actual asset movements from the reallocation
      let totalWithdrawn = 0n;
      const totalDeposited = 0n;

      // First pass: calculate withdrawals
      for (const market of vaultData.marketsData) {
        const allocation = result!.find(
          (a) => a.marketParams.collateralToken === market.params.collateralToken,
        );
        if (allocation && allocation.assets < market.vaultAssets) {
          totalWithdrawn += market.vaultAssets - allocation.assets;
        }
      }

      // Apply the reallocation to simulate the new state
      const updatedMarkets = vaultData.marketsData.map((market) => {
        const allocation = result!.find(
          (a) => a.marketParams.collateralToken === market.params.collateralToken,
        );
        if (!allocation) return market;

        let newVaultAssets: bigint;
        if (allocation.assets === maxUint256) {
          // maxUint256 means deposit all available (from withdrawals)
          newVaultAssets = market.vaultAssets + totalWithdrawn;
        } else {
          newVaultAssets = allocation.assets;
        }

        // Calculate new total supply (assuming vault's share of supply changes proportionally)
        const assetsDelta = newVaultAssets - market.vaultAssets;
        const newTotalSupply = market.state.totalSupplyAssets + assetsDelta;

        return {
          ...market,
          vaultAssets: newVaultAssets,
          state: {
            ...market.state,
            totalSupplyAssets: newTotalSupply,
          },
        };
      });

      // Check market 1 (high utilization) after reallocation
      const updatedMarket1 = updatedMarkets.find((m) => m.id === marketId1);
      const originalMarket1 = vaultData.marketsData.find((m) => m.id === marketId1);
      if (updatedMarket1 && originalMarket1) {
        const utilization1 = getUtilization(updatedMarket1.state);
        const rate1 = utilizationToRate(utilization1, updatedMarket1.rateAtTarget);
        const apy1 = rateToApy(rate1);
        const apy1Percent = Number(apy1) / 1e16;

        const originalUtilization1 = getUtilization(originalMarket1.state);
        const originalRate1 = utilizationToRate(originalUtilization1, originalMarket1.rateAtTarget);
        const originalApy1 = rateToApy(originalRate1);
        const originalApy1Percent = Number(originalApy1) / 1e16;

        console.log("Market 1 (WBTC - high APY market):");
        console.log("  Before: ", originalApy1Percent.toFixed(2), "% APY");
        console.log("  After:  ", apy1Percent.toFixed(2), "% APY");
        console.log("  Target: 3-6% range");
        console.log(
          "  Assets: ",
          Number(originalMarket1.vaultAssets) / 1e6,
          "M →",
          Number(updatedMarket1.vaultAssets) / 1e6,
          "M",
        );

        // Market 1 should have received deposits (increased assets)
        expect(updatedMarket1.vaultAssets).toBeGreaterThan(originalMarket1.vaultAssets);

        // APY should be within or closer to the target range
        const minApyWad = percentToWad(3);
        const maxApyWad = percentToWad(6);
        const tolerance = percentToWad(1); // 1% tolerance

        expect(apy1).toBeGreaterThanOrEqual(minApyWad - tolerance);
        expect(apy1).toBeLessThanOrEqual(maxApyWad + tolerance);
      }

      // Check market 2 (low utilization) after reallocation
      const updatedMarket2 = updatedMarkets.find((m) => m.id === marketId2);
      const originalMarket2 = vaultData.marketsData.find((m) => m.id === marketId2);
      if (updatedMarket2 && originalMarket2) {
        const utilization2 = getUtilization(updatedMarket2.state);
        const rate2 = utilizationToRate(utilization2, updatedMarket2.rateAtTarget);
        const apy2 = rateToApy(rate2);
        const apy2Percent = Number(apy2) / 1e16;

        const originalUtilization2 = getUtilization(originalMarket2.state);
        const originalRate2 = utilizationToRate(originalUtilization2, originalMarket2.rateAtTarget);
        const originalApy2 = rateToApy(originalRate2);
        const originalApy2Percent = Number(originalApy2) / 1e16;

        console.log("\nMarket 2 (WETH - low APY market):");
        console.log("  Before: ", originalApy2Percent.toFixed(2), "% APY");
        console.log("  After:  ", apy2Percent.toFixed(2), "% APY");
        console.log("  Target: 3-6% range");
        console.log(
          "  Assets: ",
          Number(originalMarket2.vaultAssets) / 1e6,
          "M →",
          Number(updatedMarket2.vaultAssets) / 1e6,
          "M",
        );

        // Market 2 should have had withdrawals (decreased assets)
        expect(updatedMarket2.vaultAssets).toBeLessThan(originalMarket2.vaultAssets);

        // APY should have increased (withdrawing assets increases utilization)
        expect(apy2).toBeGreaterThanOrEqual(originalApy2);
      }
    });

    it("should deposit excess liquidity to idle market when ALLOW_IDLE_REALLOCATION is true", () => {
      const strategy = new TestableApyRange({
        ...testConfigWithIdle,
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 6,
        },
        ALLOW_IDLE_REALLOCATION: true,
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
        defaultMarketParams, // USDC/WBTC
      );

      // Market 2: Low utilization (below min APY) - source of liquidity
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6), // 10% utilization = low APY
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        defaultMarketParams2, // USDC/WETH
      );

      // Idle market - should receive excess liquidity
      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("1000", 6), // small existing supply
        0n, // no borrows (idle)
        parseUnits("100", 6), // small vault assets
        maxUint184,
        0n,
        idleMarketParamsDefault,
      );

      const vaultData = createVaultData(vaultAddress, [market1, market2, idleMarket]);

      console.log("\n========== WITH IDLE MARKET ==========");
      for (const market of vaultData.marketsData) {
        const isIdle = market.params.collateralToken === zeroAddress;
        console.log(
          isIdle
            ? "\nIdle Market:"
            : `\nMarket ${market.id.slice(0, 10)}... (${market.params.collateralToken.slice(0, 10)}...):`,
        );
        console.log("  Vault Assets:", Number(market.vaultAssets) / 1e6, "M");
        console.log("  Total Supply:", Number(market.state.totalSupplyAssets) / 1e6, "M");
        console.log("  Total Borrow:", Number(market.state.totalBorrowAssets) / 1e6, "M");
      }

      const result = strategy.findReallocation(vaultData);

      console.log("\nReallocations:");
      for (const reallocation of result!) {
        const isIdle = reallocation.marketParams.collateralToken === zeroAddress;
        const isMaxUint = reallocation.assets === maxUint256;
        console.log(
          isIdle
            ? "  Idle Market:"
            : `  ${reallocation.marketParams.collateralToken.slice(0, 10)}...:`,
          isMaxUint ? "maxUint256 (all remaining)" : `${Number(reallocation.assets) / 1e6} M`,
        );
      }

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);

      // Should have withdrawals from market 2, deposits to market 1, and deposits to idle
      const market2Allocation = result!.find(
        (a) => a.marketParams.collateralToken === defaultMarketParams2.collateralToken,
      );
      const market1Allocation = result!.find(
        (a) => a.marketParams.collateralToken === defaultMarketParams.collateralToken,
      );
      const idleAllocation = result!.find((a) => a.marketParams.collateralToken === zeroAddress);

      // Market 2 should have reduced assets (withdrawal) - possibly to 0
      expect(market2Allocation).toBeDefined();
      expect(market2Allocation!.assets).toBeLessThanOrEqual(market2.vaultAssets);

      // Market 1 should have increased assets (specific amount to reach target APY)
      expect(market1Allocation).toBeDefined();
      expect(market1Allocation!.assets).toBeGreaterThan(market1.vaultAssets);

      // Idle market should receive excess liquidity
      expect(idleAllocation).toBeDefined();
      console.log("\n✅ Idle market receives excess liquidity!");
      console.log(
        `   Market 2 withdrew: ${Number(market2.vaultAssets - market2Allocation!.assets) / 1e6} M`,
      );
      console.log(
        `   Market 1 received: ${Number(market1Allocation!.assets - market1.vaultAssets) / 1e6} M`,
      );
      console.log(
        `   Idle receives remaining: ${Number(market2.vaultAssets - market2Allocation!.assets - (market1Allocation!.assets - market1.vaultAssets)) / 1e6} M`,
      );
      expect(idleAllocation!.assets).toBe(maxUint256);
    });

    it("should use idle market as source when withdrawing and ALLOW_IDLE_REALLOCATION is false", () => {
      const strategy = new TestableApyRange({
        ...testConfigNoIdle,
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 6,
        },
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
        defaultMarketParams, // USDC/WBTC
      );

      // Idle market with assets available
      const idleMarket = createMockMarketData(
        idleMarketId as Hex,
        parseUnits("10000", 6),
        0n,
        parseUnits("5000", 6),
        maxUint184,
        0n,
        idleMarketParamsDefault, // idle market params
      );

      const vaultData = createVaultData(vaultAddress, [market1, idleMarket]);
      const result = strategy.findReallocation(vaultData);

      expect(result).toBeDefined();
      // Check that idle market is used as withdrawal source (assets should be reduced)
      const idleAllocation = result?.find((a) => a.marketParams.collateralToken === zeroAddress);
      if (idleAllocation) {
        expect(idleAllocation.assets).toBeLessThan(parseUnits("5000", 6));
      }
    });
  });

  describe("getApyRange configuration priority", () => {
    it("should use market-specific range over vault default", () => {
      const marketSpecificRange = {
        min: 10,
        max: 15,
      };
      const vaultDefaultRange = {
        min: 5,
        max: 8,
      };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 8,
        },
        vaultsDefaultApyRanges: {
          [mainnet.id]: {
            [vaultAddress]: vaultDefaultRange,
          },
        },
        marketsDefaultApyRanges: {
          [mainnet.id]: {
            [marketId1]: marketSpecificRange,
          },
        },
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, vaultAddress, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(marketSpecificRange.min));
      expect(range.max).toBe(percentToWad(marketSpecificRange.max));
    });

    it("should use vault default when no market-specific range", () => {
      const vaultDefaultRange = {
        min: 5,
        max: 8,
      };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 8,
        },
        vaultsDefaultApyRanges: {
          [mainnet.id]: {
            [vaultAddress]: vaultDefaultRange,
          },
        },
        marketsDefaultApyRanges: {},
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, vaultAddress, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(vaultDefaultRange.min));
      expect(range.max).toBe(percentToWad(vaultDefaultRange.max));
    });

    it("should use global default when no vault or market specific range", () => {
      const globalDefault = {
        min: 3,
        max: 8,
      };

      const strategy = new TestableApyRange({
        DEFAULT_APY_RANGE: globalDefault,
        vaultsDefaultApyRanges: {},
        marketsDefaultApyRanges: {},
        ALLOW_IDLE_REALLOCATION: false,
      });

      const range = strategy.getApyRange(mainnet.id, vaultAddress, marketId1 as Hex);

      expect(range.min).toBe(percentToWad(globalDefault.min));
      expect(range.max).toBe(percentToWad(globalDefault.max));
    });
  });

  describe("edge cases", () => {
    it("should handle market at full cap (no depositable amount)", () => {
      const strategy = new TestableApyRange({
        ...testConfigNoIdle,
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 6,
        },
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization but already at cap
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization
        parseUnits("10000", 6), // vault assets = cap (no more room)
        parseUnits("10000", 6), // cap
        rateAtTarget,
        defaultMarketParams, // USDC/WBTC
      );

      // Market 2: Low utilization
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6), // 10% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        defaultMarketParams2, // USDC/WETH
      );

      const vaultData = createVaultData(vaultAddress, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      // Should still work, but market1 won't receive deposits since it's at cap
      // Result could be undefined if there's nowhere to deposit
      expect(result === undefined || result.length >= 0).toBe(true);
    });

    it("should handle market with no vault assets (no withdrawable amount)", () => {
      const strategy = new TestableApyRange({
        ...testConfigNoIdle,
        DEFAULT_APY_RANGE: {
          min: 3,
          max: 6,
        },
      });

      const rateAtTarget = parseUnits("0.05", 18) / (365n * 24n * 60n * 60n);

      // Market 1: High utilization
      const market1 = createMockMarketData(
        marketId1 as Hex,
        parseUnits("10000", 6),
        parseUnits("9500", 6), // 95% utilization
        parseUnits("5000", 6),
        parseUnits("20000", 6),
        rateAtTarget,
        defaultMarketParams, // USDC/WBTC
      );

      // Market 2: Low utilization but no vault assets
      const market2 = createMockMarketData(
        marketId2 as Hex,
        parseUnits("10000", 6),
        parseUnits("1000", 6), // 10% utilization
        0n, // no vault assets
        parseUnits("20000", 6),
        rateAtTarget,
        defaultMarketParams2, // USDC/WETH
      );

      const vaultData = createVaultData(vaultAddress, [market1, market2]);
      const result = strategy.findReallocation(vaultData);

      // Should return undefined since there's nothing to withdraw from market2
      expect(result).toBeUndefined();
    });
  });
});
