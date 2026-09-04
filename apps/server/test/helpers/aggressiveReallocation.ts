import { maxUint256, zeroAddress } from "viem";

import { freeMarketLiquidity } from "../../src/utils/marketLiquidity.js";
import { getUtilization } from "../../src/utils/maths.js";
import { MarketAllocation, VaultData, VaultMarketData } from "../../src/utils/types.js";

function pickWithdrawMarket(markets: VaultMarketData[]): VaultMarketData | null {
  let best: VaultMarketData | null = null;
  let bestExcess = 0n;

  for (const market of markets) {
    if (market.params.collateralToken === zeroAddress || market.vaultAssets === 0n) {
      continue;
    }
    const excess = market.vaultAssets - freeMarketLiquidity(market.state);
    if (excess <= 0n) {
      continue;
    }
    if (!best || excess > bestExcess) {
      best = market;
      bestExcess = excess;
    }
  }

  return best;
}

function pickDepositMarket(
  markets: VaultMarketData[],
  withdrawMarket: VaultMarketData,
): VaultMarketData | null {
  const idle = markets.find((market) => market.params.collateralToken === zeroAddress);
  if (idle) {
    return idle;
  }

  let best: VaultMarketData | null = null;
  let lowestUtil = 2n ** 256n - 1n;

  for (const market of markets) {
    if (market.id === withdrawMarket.id || market.vaultAssets === 0n) {
      continue;
    }
    const util = getUtilization(market.state);
    if (util < lowestUtil) {
      best = market;
      lowestUtil = util;
    }
  }

  return best;
}

export function buildAggressiveReallocation(vaultData: VaultData): MarketAllocation[] | null {
  const markets = Array.from(vaultData.marketsData.values());
  const withdrawMarket = pickWithdrawMarket(markets);
  if (!withdrawMarket) {
    return null;
  }

  const depositMarket = pickDepositMarket(markets, withdrawMarket);
  if (!depositMarket) {
    return null;
  }

  return [
    {
      marketParams: withdrawMarket.params,
      assets: 0n,
    },
    {
      marketParams: depositMarket.params,
      assets: maxUint256,
    },
  ];
}

export function describeAggressivePlan(vaultData: VaultData, plan: MarketAllocation[]): string {
  const withdrawMarket = plan[0];
  if (!withdrawMarket) {
    return "empty plan";
  }

  const market = Array.from(vaultData.marketsData.values()).find(
    (entry) =>
      entry.params.loanToken === withdrawMarket.marketParams.loanToken &&
      entry.params.collateralToken === withdrawMarket.marketParams.collateralToken,
  );
  if (!market) {
    return "unknown market";
  }

  const excess = market.vaultAssets - freeMarketLiquidity(market.state);
  const util = Number(getUtilization(market.state)) / 1e18;
  return `withdraw ${market.vaultAssets.toString()} assets (excess over free liquidity: ${excess.toString()}, util ${(util * 100).toFixed(2)}%)`;
}
