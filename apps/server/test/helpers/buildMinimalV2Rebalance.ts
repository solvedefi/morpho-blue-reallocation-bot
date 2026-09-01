import { type Address } from "viem";
import { mainnet } from "viem/chains";

import { Reallocation, VaultV2Data } from "../../src/contracts/typesV2.js";
import { ApyConfiguration, MarketApyRanges } from "../../src/database/index.js";
import { encodeMarketParamsV1 } from "../../src/strategies-v2/helpers/encoding.js";
import { getUtilization, rateToApy, utilizationToRate, WAD } from "../../src/utils/maths.js";

const USDC_REBALANCE_AMOUNT = 1_000_000_000n;

function marketApyPercent(market: VaultV2Data["marketsV1Data"]["markets"][number]): number {
  const util = getUtilization(market.state);
  const rate = utilizationToRate(util, market.rateAtTarget);
  return Number((rateToApy(rate) * 100n) / WAD);
}

export function buildOptimalApyConfig(vaultData: VaultV2Data): ApyConfiguration {
  const sorted = [...vaultData.marketsV1Data.markets].sort((a, b) =>
    Number(b.vaultAssets - a.vaultAssets),
  );

  const depositMarket = sorted[0];
  const withdrawMarket = sorted[1];
  if (!depositMarket || !withdrawMarket || depositMarket.id === withdrawMarket.id) {
    throw new Error("Need at least two markets for optimal APY config");
  }

  const depositApy = marketApyPercent(depositMarket);
  const withdrawApy = marketApyPercent(withdrawMarket);
  const depositTargetMax = Math.max(0.01, depositApy - 0.5);
  const withdrawTargetMin = Math.min(99, withdrawApy + 2);

  const marketRanges: MarketApyRanges = {
    [depositMarket.id]: {
      min: 2,
      max: depositTargetMax,
      collateralSymbol: "?",
      loanSymbol: "USDC",
    },
    [withdrawMarket.id]: {
      min: withdrawTargetMin,
      max: 100,
      collateralSymbol: "?",
      loanSymbol: "USDC",
    },
  };

  return {
    vaultRanges: {},
    marketRanges: { [mainnet.id]: marketRanges },
    allowIdleReallocation: true,
    defaultMinApy: 3,
    defaultMaxApy: 8,
  };
}

export function buildMinimalV2Rebalance(vaultData: VaultV2Data): Reallocation {
  const adapterAddress = vaultData.marketsV1Data.adapterAddress;
  const sorted = [...vaultData.marketsV1Data.markets].sort((a, b) =>
    Number(b.vaultAssets - a.vaultAssets),
  );

  const fromMarket = sorted[0];
  const toMarket = sorted[1];
  if (!fromMarket || !toMarket) {
    throw new Error("Need at least two markets to build a minimal V2 rebalance");
  }

  const amount =
    fromMarket.vaultAssets < USDC_REBALANCE_AMOUNT
      ? fromMarket.vaultAssets / 10n
      : USDC_REBALANCE_AMOUNT;

  if (amount === 0n) {
    throw new Error("Source market has no withdrawable assets for minimal rebalance");
  }

  return {
    deallocations: [
      {
        adapterAddress,
        data: encodeMarketParamsV1(fromMarket.params),
        assets: amount,
      },
    ],
    allocations: [
      {
        adapterAddress,
        data: encodeMarketParamsV1(toMarket.params),
        assets: amount,
      },
    ],
  };
}

export function describeV2Rebalance(vault: Address, reallocation: Reallocation): string {
  const deallocAssets = reallocation.deallocations.reduce((sum, a) => sum + a.assets, 0n);
  const allocAssets = reallocation.allocations.reduce((sum, a) => sum + a.assets, 0n);
  return `${vault}: ${String(reallocation.deallocations.length)} deallocate(s) (${String(deallocAssets)} assets), ${String(reallocation.allocations.length)} allocate(s) (${String(allocAssets)} assets)`;
}
