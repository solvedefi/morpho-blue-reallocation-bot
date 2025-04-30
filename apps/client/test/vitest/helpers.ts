import { MarketState } from "../../src/utils/types";

export function formatMarketState(
  marketStateArray: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
): MarketState {
  return {
    totalSupplyAssets: marketStateArray[0],
    totalSupplyShares: marketStateArray[1],
    totalBorrowAssets: marketStateArray[2],
    totalBorrowShares: marketStateArray[3],
    lastUpdate: marketStateArray[4],
    fee: marketStateArray[5],
  };
}

export const abs = (x: bigint) => (x < 0n ? -x : x);
