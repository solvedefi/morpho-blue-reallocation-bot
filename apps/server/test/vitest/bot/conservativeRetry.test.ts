import { Address, Hex, maxUint256, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { applyConservativeRetry } from "../../../../server/src/bot/conservativeRetry.js";
import { defaultRetryPolicy, settingsForAttempt } from "../../../../server/src/bot/retryPolicy.js";
import { marketIdFromParams } from "../../../../server/src/utils/marketId.js";
import {
  MarketAllocation,
  MarketParams,
  VaultData,
  VaultMarketData,
} from "../../../../server/src/utils/types.js";

const LOAN_TOKEN = "0x0000000000000000000000000000000000000001" as Address;
const ORACLE = "0x0000000000000000000000000000000000000002" as Address;
const IRM = "0x0000000000000000000000000000000000000003" as Address;
const VAULT = "0x00000000000000000000000000000000000000aa" as Address;

function createMarketParams(collateralToken: Address): MarketParams {
  return {
    loanToken: LOAN_TOKEN,
    collateralToken,
    oracle: ORACLE,
    irm: IRM,
    lltv: parseUnits("0.8", 18),
  };
}

function createMarket(
  params: MarketParams,
  vaultAssets: bigint,
  totalSupply: bigint,
  totalBorrow: bigint,
): VaultMarketData {
  return {
    chainId: mainnet.id,
    id: marketIdFromParams(params),
    params,
    state: {
      totalSupplyAssets: totalSupply,
      totalSupplyShares: totalSupply,
      totalBorrowAssets: totalBorrow,
      totalBorrowShares: totalBorrow,
      lastUpdate: 1n,
      fee: 0n,
    },
    cap: parseUnits("1000000", 18),
    vaultAssets,
    rateAtTarget: parseUnits("0.05", 18),
    apyAt100Utilization: parseUnits("0.1", 18),
    loanTokenDecimals: 18,
  };
}

function createVaultData(markets: VaultMarketData[]): VaultData {
  const marketsData = new Map<Hex, VaultMarketData>();
  for (const market of markets) {
    marketsData.set(market.id, market);
  }
  return { vaultAddress: VAULT, marketsData };
}

function allocation(params: MarketParams, assets: bigint): MarketAllocation {
  return { marketParams: params, assets };
}

function assetsFor(allocations: MarketAllocation[], params: MarketParams): bigint | undefined {
  const id = marketIdFromParams(params);
  return allocations.find((entry) => marketIdFromParams(entry.marketParams) === id)?.assets;
}

describe("applyConservativeRetry", () => {
  it("haircuts high-usage withdrawals on retry attempts", () => {
    const highUsageParams = createMarketParams(
      "0x0000000000000000000000000000000000000101" as Address,
    );
    const lowUsageParams = createMarketParams(
      "0x0000000000000000000000000000000000000102" as Address,
    );
    const receiverParams = createMarketParams(
      "0x0000000000000000000000000000000000000103" as Address,
    );

    const vaultData = createVaultData([
      createMarket(highUsageParams, 100n, 10_000n, 9_900n),
      createMarket(lowUsageParams, 100n, 10_000n, 7_000n),
      createMarket(receiverParams, 20n, 10_000n, 3_000n),
    ]);

    const initial = [
      allocation(highUsageParams, 20n),
      allocation(lowUsageParams, 20n),
      allocation(receiverParams, 180n),
    ];

    const policy = defaultRetryPolicy();
    const updated = applyConservativeRetry(
      initial,
      vaultData,
      settingsForAttempt(
        {
          ...policy,
          withdrawalHaircuts: [1, 0.5, 0.5, 0.5],
          largeWithdrawalRatio: 0,
          idleFloorRatio: 0,
        },
        2,
      ),
    );

    expect(assetsFor(updated, highUsageParams)).toBe(60n);
    expect(assetsFor(updated, lowUsageParams)).toBe(20n);
    expect(assetsFor(updated, receiverParams)).toBe(140n);
  });

  it("adds an idle floor by reducing deposits", () => {
    const receiverParams = createMarketParams(
      "0x0000000000000000000000000000000000000201" as Address,
    );
    const idleParams = createMarketParams(zeroAddress);
    const vaultData = createVaultData([
      createMarket(receiverParams, 100n, 200n, 40n),
      createMarket(idleParams, 900n, 900n, 0n),
    ]);

    const initial = [allocation(receiverParams, 250n)];
    const policy = defaultRetryPolicy();

    const updated = applyConservativeRetry(
      initial,
      vaultData,
      settingsForAttempt({ ...policy, idleFloorRatio: 0.1 }, 2),
    );

    expect(assetsFor(updated, receiverParams)).toBe(150n);
  });

  it("is more conservative on attempt three than attempt two", () => {
    const highUsageParams = createMarketParams(
      "0x0000000000000000000000000000000000000301" as Address,
    );
    const receiverParams = createMarketParams(
      "0x0000000000000000000000000000000000000302" as Address,
    );

    const vaultData = createVaultData([
      createMarket(highUsageParams, 200n, 10_000n, 9_500n),
      createMarket(receiverParams, 50n, 10_000n, 4_000n),
    ]);

    const initial = [allocation(highUsageParams, 40n), allocation(receiverParams, 210n)];
    const policy = defaultRetryPolicy();

    const attemptTwo = applyConservativeRetry(initial, vaultData, settingsForAttempt(policy, 2));
    const attemptThree = applyConservativeRetry(initial, vaultData, settingsForAttempt(policy, 3));

    const attemptTwoAssets = assetsFor(attemptTwo, highUsageParams);
    const attemptThreeAssets = assetsFor(attemptThree, highUsageParams);
    expect(attemptTwoAssets).toBeDefined();
    expect(attemptThreeAssets).toBeDefined();
    if (!attemptTwoAssets || !attemptThreeAssets) {
      return;
    }
    expect(attemptThreeAssets > attemptTwoAssets).toBe(true);
  });

  it("haircuts large withdrawals even below the usage threshold", () => {
    const withdrawParams = createMarketParams(
      "0x0000000000000000000000000000000000000401" as Address,
    );
    const receiverParams = createMarketParams(
      "0x0000000000000000000000000000000000000402" as Address,
    );
    const idleParams = createMarketParams(zeroAddress);

    const vaultData = createVaultData([
      createMarket(withdrawParams, 200n, 10_000n, 7_000n),
      createMarket(receiverParams, 50n, 10_000n, 4_000n),
      createMarket(idleParams, 750n, 10_000n, 0n),
    ]);

    const initial = [allocation(withdrawParams, 0n), allocation(receiverParams, 250n)];
    const policy = defaultRetryPolicy();

    const updated = applyConservativeRetry(
      initial,
      vaultData,
      settingsForAttempt(
        {
          ...policy,
          withdrawalHaircuts: [1, 0.5, 0.5, 0.5],
          largeWithdrawalRatio: 0.05,
          idleFloorRatio: 0,
        },
        2,
      ),
    );

    expect(assetsFor(updated, withdrawParams)).toBe(100n);
    expect(assetsFor(updated, receiverParams)).toBe(150n);
  });

  it("syncs idle deposits after withdrawal haircuts", () => {
    const withdrawParams = createMarketParams(
      "0x0000000000000000000000000000000000000501" as Address,
    );
    const idleParams = createMarketParams(zeroAddress);

    const vaultData = createVaultData([
      createMarket(withdrawParams, 200n, 10_000n, 9_900n),
      createMarket(idleParams, 50n, 10_000n, 0n),
    ]);

    const initial = [allocation(withdrawParams, 0n), allocation(idleParams, maxUint256)];
    const policy = defaultRetryPolicy();

    const updated = applyConservativeRetry(
      initial,
      vaultData,
      settingsForAttempt(
        {
          ...policy,
          withdrawalHaircuts: [1, 0.5, 0.5, 0.5],
          largeWithdrawalRatio: 0,
          idleFloorRatio: 0,
        },
        2,
      ),
    );

    expect(assetsFor(updated, withdrawParams)).toBe(100n);
    expect(assetsFor(updated, idleParams)).toBe(maxUint256);
  });
});
