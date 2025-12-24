import { parseUnits } from "viem";

import { MarketState, VaultMarketData } from "./types";

export const WAD = parseUnits("1", 18);
export const YEAR = 60n * 60n * 24n * 365n;

const VIRTUAL_ASSETS = 1n;
const VIRTUAL_SHARES = 10n ** 6n;

const CURVE_STEEPNESS = 4n;
const TARGET_UTILIZATION = parseUnits("0.9", 18);

export const min = (a: bigint, b: bigint) => (a < b ? a : b);

export const mulDivDown = (x: bigint, y: bigint, d: bigint): bigint => (x * y) / d;
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

const wTaylorCompounded = (x: bigint, n: bigint): bigint => {
  const firstTerm = x * n;
  const secondTerm = mulDivDown(firstTerm, firstTerm, 2n * WAD);
  const thirdTerm = mulDivDown(secondTerm, firstTerm, 3n * WAD);
  return firstTerm + secondTerm + thirdTerm;
};

export const getUtilization = (marketState: MarketState) => {
  return wDivDown(marketState.totalBorrowAssets, marketState.totalSupplyAssets);
};

function getWithdrawalToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    WAD - wDivDown(getUtilization(marketState), targetUtilization),
  );
}

function getDepositToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    wDivDown(getUtilization(marketState), targetUtilization) - WAD,
  );
}

export function getWithdrawableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getWithdrawalToUtilization(marketData.state, targetUtilization),
    marketData.vaultAssets,
  );
}

export function getDepositableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getDepositToUtilization(marketData.state, targetUtilization),
    marketData.cap - marketData.vaultAssets,
  );
}

// Approximation of the natural logarithm with the first three terms of the Taylor series
export const apyToRate = (apy: bigint): bigint => {
  const firstTerm = apy;
  const secondTerm = wMulDown(firstTerm, firstTerm);
  const thirdTerm = wMulDown(secondTerm, firstTerm);
  const apr = firstTerm - secondTerm / 2n + thirdTerm / 3n;
  return apr / YEAR;
};

export const rateToUtilization = (rate: bigint, rateAtTarget: bigint): bigint => {
  const maxRate = CURVE_STEEPNESS * rateAtTarget;
  const minRate = rateAtTarget / CURVE_STEEPNESS;
  let utilization = 0n;

  if (rate >= maxRate) {
    utilization = WAD;
  } else if (rate >= rateAtTarget) {
    utilization =
      TARGET_UTILIZATION +
      mulDivDown(WAD - TARGET_UTILIZATION, rate - rateAtTarget, maxRate - rateAtTarget);
  } else if (rate > minRate) {
    utilization = mulDivDown(TARGET_UTILIZATION, rate - minRate, rateAtTarget - minRate);
  }
  return utilization;
};

export const utilizationToRate = (utilization: bigint, rateAtTarget: bigint): bigint => {
  const maxRate = CURVE_STEEPNESS * rateAtTarget;
  const minRate = rateAtTarget / CURVE_STEEPNESS;
  let rate = minRate;

  if (utilization >= WAD) {
    rate = maxRate;
  } else if (utilization >= TARGET_UTILIZATION) {
    rate =
      rateAtTarget +
      mulDivDown(
        maxRate - rateAtTarget,
        utilization - TARGET_UTILIZATION,
        WAD - TARGET_UTILIZATION,
      );
  } else if (utilization > 0n) {
    rate = minRate + mulDivDown(rateAtTarget - minRate, utilization, TARGET_UTILIZATION);
  }
  return rate;
};

export const percentToWad = (percent: number): bigint => {
  return parseUnits(percent.toString(), 16);
};

export const rateToApy = (rate: bigint): bigint => wTaylorCompounded(rate, YEAR);

// IRM Adaptive Curve Constants
const ADJUSTMENT_SPEED = parseUnits("50", 18) / YEAR;
const INITIAL_RATE_AT_TARGET = parseUnits("0.04", 18) / YEAR;
const MIN_RATE_AT_TARGET = parseUnits("0.001", 18) / YEAR;
const MAX_RATE_AT_TARGET = parseUnits("2", 18) / YEAR;

// Exponential constants for wExp function
const LN_2_INT = parseUnits("0.693147180559945309", 18);
const LN_WEI_INT = -parseUnits("41.446531673892822312", 18);
const WEXP_UPPER_BOUND = parseUnits("93.859467695000404319", 18);
const WEXP_UPPER_VALUE = parseUnits(
  "57716089161558943949701069502944508345128.422502756744429568",
  18,
);

const wMulToZero = (x: bigint, y: bigint): bigint => {
  return (x * y) / WAD;
};

const wDivToZero = (x: bigint, y: bigint): bigint => {
  return (x * WAD) / y;
};

const wExp = (x: bigint): bigint => {
  if (x < LN_WEI_INT) return 0n;
  if (x >= WEXP_UPPER_BOUND) return WEXP_UPPER_VALUE;
  const roundingAdjustment = x < 0n ? -(LN_2_INT / 2n) : LN_2_INT / 2n;
  const q = (x + roundingAdjustment) / LN_2_INT;
  const r = x - q * LN_2_INT;
  const expR = WAD + r + (r * r) / WAD / 2n;
  if (q >= 0) return expR << q;
  return expR >> -q;
};

const curve = (rateAtTarget: bigint, err: bigint): bigint => {
  const coeff = err < 0n ? WAD - wDivToZero(WAD, CURVE_STEEPNESS) : CURVE_STEEPNESS - WAD;
  return wMulToZero(wMulToZero(coeff, err) + WAD, rateAtTarget);
};

const calculateNewRateAtTarget = (startRateAtTarget: bigint, linearAdaptation: bigint): bigint => {
  return bound(
    wMulToZero(startRateAtTarget, wExp(linearAdaptation)),
    MIN_RATE_AT_TARGET,
    MAX_RATE_AT_TARGET,
  );
};

/**
 * Calculates the borrow rate and new rateAtTarget based on current market state.
 * The rateAtTarget adapts over time based on how far the utilization is from the target (90%).
 *
 * @param market - Current market state
 * @param startRateAtTarget - Previous rateAtTarget value
 * @param timestamp - Current timestamp
 * @returns Object containing avgRate (current borrow rate) and newRateAtTarget (updated rate at target)
 */
export function calculateBorrowRate(
  market: MarketState,
  startRateAtTarget: bigint,
  timestamp: bigint,
): { avgRate: bigint; newRateAtTarget: bigint } {
  const utilization =
    market.totalSupplyAssets > 0n
      ? wDivDown(market.totalBorrowAssets, market.totalSupplyAssets)
      : 0n;

  const errNormFactor =
    utilization > TARGET_UTILIZATION ? WAD - TARGET_UTILIZATION : TARGET_UTILIZATION;

  const err = wDivToZero(utilization - TARGET_UTILIZATION, errNormFactor);

  let avgRateAtTarget = 0n;
  let endRateAtTarget = 0n;

  if (startRateAtTarget === 0n) {
    avgRateAtTarget = INITIAL_RATE_AT_TARGET;
    endRateAtTarget = INITIAL_RATE_AT_TARGET;
  } else {
    const speed = wMulToZero(ADJUSTMENT_SPEED, err);
    const elapsed = timestamp - market.lastUpdate;
    const linearAdaptation = speed * elapsed;

    if (linearAdaptation === 0n) {
      avgRateAtTarget = startRateAtTarget;
      endRateAtTarget = startRateAtTarget;
    } else {
      endRateAtTarget = calculateNewRateAtTarget(startRateAtTarget, linearAdaptation);
      const midRateAtTarget = calculateNewRateAtTarget(startRateAtTarget, linearAdaptation / 2n);
      avgRateAtTarget = (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n;
    }
  }

  return { avgRate: curve(avgRateAtTarget, err), newRateAtTarget: endRateAtTarget };
}
