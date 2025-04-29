import type { Address } from "viem";

import type { VaultData, VaultMarketData } from "./types";

export async function fetchVaultData(chainId: number, vaultAddress: Address): Promise<VaultData> {
  const url = `http://localhost:42069/chain/${chainId}/vault/${vaultAddress}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch market data for vault ${vaultAddress}: ${response.statusText}`,
    );
  }

  const markets = (await response.json()) as VaultMarketData[];

  return {
    vaultAddress,
    marketsData: markets.map((market) => ({
      ...market,
      params: {
        ...market.params,
        lltv: BigInt(market.params.lltv),
      },
      state: {
        totalSupplyAssets: BigInt(market.state.totalSupplyAssets),
        totalSupplyShares: BigInt(market.state.totalSupplyShares),
        totalBorrowAssets: BigInt(market.state.totalBorrowAssets),
        totalBorrowShares: BigInt(market.state.totalBorrowShares),
        lastUpdate: BigInt(market.state.lastUpdate),
        fee: BigInt(market.state.fee),
      },
      cap: BigInt(market.cap),
      vaultAssets: BigInt(market.vaultAssets),
      rateAtTarget: BigInt(market.rateAtTarget),
    })),
  };
}
