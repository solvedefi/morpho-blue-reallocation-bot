import { parseUnits } from "viem";
import { MarketState } from "./types";

export const WAD = parseUnits("1", 18);

const VIRTUAL_ASSETS = 1n;
const VIRTUAL_SHARES = 10n ** 6n;

export const min = (a: bigint, b: bigint) => (a < b ? a : b);

const mulDivDown = (x: bigint, y: bigint, d: bigint): bigint => (x * y) / d;
export const mulDivUp = (x: bigint, y: bigint, d: bigint): bigint => (x * y + (d - 1n)) / d;
export const wDivDown = (x: bigint, y: bigint): bigint => mulDivDown(x, WAD, y);
export const wDivUp = (x: bigint, y: bigint): bigint => mulDivUp(x, WAD, y);
export const wMulDown = (x: bigint, y: bigint): bigint => mulDivDown(x, y, WAD);

export const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivUp(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
};
export const toAssetsDown = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivDown(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
};
export const toSharesUp = (assets: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivUp(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);
};
export const toSharesDown = (assets: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivDown(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);
};

export const bound = (x: bigint, min: bigint, max: bigint): bigint => {
  if (x < min) return min;
  if (x > max) return max;
  return x;
};

export const getUtilization = (marketState: MarketState) => {
  return wDivDown(marketState.totalBorrowAssets, marketState.totalSupplyAssets);
};

export function getWithdrawalToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    WAD - wDivDown(getUtilization(marketState), targetUtilization),
  );
}

export function getDepositToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    wDivDown(getUtilization(marketState), targetUtilization) - WAD,
  );
}
