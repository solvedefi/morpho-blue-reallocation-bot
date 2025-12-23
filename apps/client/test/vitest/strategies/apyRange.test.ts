import { Range } from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, maxUint184, maxUint256, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

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

    //   // Both should be withdrawals (assets = totalBorrowAssets);
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
      const strategy = new StrategyMock({
        ...TEST_CONFIG_NO_IDLE,
        // DEFAULT_APY_RANGE: { min: 3, max: 8 },
        // DEFAULT_APY_RANGE: { min: 16, max: 20 }, // doesn't work
        DEFAULT_APY_RANGE: { min: 12, max: 14 }, // doesn't work
      });

      const targetApyAt100 = percentToWad(7);
      const lowRateAt100Util = apyToRate(targetApyAt100);
      const lowRateAtTarget = lowRateAt100Util / 4n;

      const targetApyAt100WSTETH_EUSD = percentToWad(30);
      console.log("targetApyAt100WSTETH_EUSD:", targetApyAt100WSTETH_EUSD);
      const highRateAt100UtilWSTETH_EUSD = apyToRate(targetApyAt100WSTETH_EUSD);
      console.log("highRateAt100UtilWSTETH_EUSD:", highRateAt100UtilWSTETH_EUSD);
      const highRateAtTargetWSTETH_EUSD = highRateAt100UtilWSTETH_EUSD / 4n;
      console.log("highRateAtTargetWSTETH_EUSD:", highRateAtTargetWSTETH_EUSD);

      const rateToAPYHighestUtilization = rateToApy(highRateAt100UtilWSTETH_EUSD);
      const rateToAPYHighestAtTarget = rateToApy(highRateAtTargetWSTETH_EUSD);
      console.log("rateToAPYHighestUtilization:", rateToAPYHighestUtilization);
      console.log("rateToAPYHighestAtTarget:", rateToAPYHighestAtTarget);

      // const targetApyAt100 = percentToWad(10);
      // const highRateAtTarget = parseUnits("0.10", 18) / (365n * 24n * 60n * 60n);
      // const highRateAt100Util = apyToRate(targetApyAt100);
      // console.log("highRateAt100Util:", highRateAt100Util);

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
      console.log("result:", result);

      expect(result).toBeDefined();
      if (!result) return;

      // for (const reallocation of result) {
      //   console.log(
      //     "reallocation.marketParams.collateralToken:",
      //     reallocation.marketParams.collateralToken,
      //   );
      //   console.log("reallocation.assets:", reallocation.assets);
      //   console.log();
      // }
      // expect(result.length).toBeGreaterThan(0);

      // const market1Allocation = result.find(
      //   (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS.collateralToken,
      // );
      // const market2Allocation = result.find(
      //   (a) => a.marketParams.collateralToken === MOCK_MARKET_PARAMS_2.collateralToken,
      // );

      // // Market 1 should have withdrawal to push to 100% util
      // expect(market1Allocation).toBeDefined();
      // if (market1Allocation) {
      //   // The withdrawal should equal totalBorrowAssets (to push util to 100%)
      //   expect(market1Allocation.assets).toBe(parseUnits("5000", 6));
      // }

      // // Market 2 might receive deposit from market 1's withdrawal
      // if (market2Allocation) {
      //   // Market 2 should receive a deposit (either maxUint256 or more than current vaultAssets)
      //   const isDeposit =
      //     market2Allocation.assets === maxUint256 ||
      //     market2Allocation.assets > parseUnits("5000", 6);
      //   expect(isDeposit).toBe(true);
      // }

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

      const BSDETH_EUSD_utilizationAfterReallocation = getUtilization(
        vaultMarketData_BSDETH_EUSD_afterReallocation.state,
      );
      console.log(
        "BSDETH_EUSD_utilizationAfterReallocation:",
        BSDETH_EUSD_utilizationAfterReallocation,
      );

      const { newRateAtTarget: newRateAtTarget_BSDETH_EUSD } = calculateBorrowRate(
        vaultMarketData_BSDETH_EUSD_afterReallocation.state,
        lowRateAtTarget,
        BigInt(Math.floor(Date.now() / 1000)),
      );
      console.log(
        "newRateAtTarget for BSDETH_EUSD after reallocation:",
        newRateAtTarget_BSDETH_EUSD,
      );

      // Calculate actual rate at current utilization, then convert to APY
      const actualRate_BSDETH_EUSD = utilizationToRate(
        BSDETH_EUSD_utilizationAfterReallocation,
        newRateAtTarget_BSDETH_EUSD,
      );
      const apy_BSDETH_EUSD_afterReallocation = rateToApy(actualRate_BSDETH_EUSD);
      console.log(
        "apy for BSDETH_EUSD after reallocation (at current utilization):",
        (Number(apy_BSDETH_EUSD_afterReallocation) / 1e16).toString(),
      );

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

      const WSTETH_EUSD_utilizationAfterReallocation = getUtilization(
        vaultMarketData_WSTETH_EUSD_afterReallocation.state,
      );
      console.log(
        "WSTETH_EUSD_utilizationAfterReallocation:",
        WSTETH_EUSD_utilizationAfterReallocation,
      );

      const { newRateAtTarget: newRateAtTarget_WSTETH_EUSD } = calculateBorrowRate(
        vaultMarketData_WSTETH_EUSD_afterReallocation.state,
        highRateAtTargetWSTETH_EUSD,
        BigInt(Math.floor(Date.now() / 1000)),
      );
      console.log(
        "newRateAtTarget for WSTETH_EUSD after reallocation:",
        newRateAtTarget_WSTETH_EUSD,
      );

      // Calculate actual rate at current utilization, then convert to APY
      const actualRate_WSTETH_EUSD = utilizationToRate(
        WSTETH_EUSD_utilizationAfterReallocation,
        newRateAtTarget_WSTETH_EUSD,
      );
      const apy_WSTETH_EUSD_afterReallocation = rateToApy(actualRate_WSTETH_EUSD);
      console.log(
        "apy for WSTETH_EUSD after reallocation (at current utilization):",
        (Number(apy_WSTETH_EUSD_afterReallocation) / 1e16).toString(),
      );
    });

    // it("should not reallocate when rateAt100Utilization is above or equal to max APY", async () => {
    //   const strategy = new TestableApyRange({
    //     ...TEST_CONFIG_NO_IDLE,
    //     DEFAULT_APY_RANGE: { min: 3, max: 8 },
    //   });

    //   // To get an APY of 9% at 100% utilization (which is > 8%)
    //   const targetApyAt100 = percentToWad(9); // 9% APY
    //   const highRateAt100Util = apyToRate(targetApyAt100);
    //   const highRateAtTarget = highRateAt100Util / 4n;

    //   // Verify our test setup: apyAt100Util should be >= 8%
    //   const apyAt100Util = rateToApy(highRateAt100Util);
    //   expect(apyAt100Util).toBeGreaterThanOrEqual(percentToWad(8));

    //   const market1 = createMockMarketData(
    //     marketId1 as Hex,
    //     parseUnits("10000", 6),
    //     parseUnits("5000", 6), // 50% utilization
    //     parseUnits("5000", 6),
    //     parseUnits("20000", 6),
    //     highRateAtTarget,
    //     MOCK_MARKET_PARAMS,
    //     highRateAt100Util,
    //   );

    //   const vaultData = createVaultData(MOCK_VAULT_ADDRESS, [market1]);
    //   const result = await strategy.findReallocation(vaultData);

    //   // Should not trigger reallocation since utilization is within range
    //   // and rateAt100Util >= max APY
    //   expect(result).toBeUndefined();
    // });
  });
});
