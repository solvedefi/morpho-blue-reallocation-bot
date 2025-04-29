import { mulDivDown, WAD, YEAR } from "../../src/utils/maths";
import { MarketState } from "../../src/utils/types";

export const apyFromRate = (apy: bigint): bigint => wTaylorCompounded(apy, YEAR);

const wTaylorCompounded = (x: bigint, n: bigint): bigint => {
  const firstTerm = x * n;
  const secondTerm = mulDivDown(firstTerm, firstTerm, 2n * WAD);
  const thirdTerm = mulDivDown(secondTerm, firstTerm, 3n * WAD);
  return firstTerm + secondTerm + thirdTerm;
};

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
