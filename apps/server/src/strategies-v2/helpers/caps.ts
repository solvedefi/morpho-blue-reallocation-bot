import type { MarketV1Data } from "../../contracts/typesV2";
import {
  getDepositToUtilization,
  getWithdrawalToUtilization,
  min,
  percentToWad,
  wMulDown,
  wMulUp,
} from "../../utils/maths";

// Percent (0..100) of a cap we're willing to use. 99 = use up to 99% of
// cap; the remaining 1% is buffer to avoid revert at the rounding boundary.
// Note: this number is passed to `percentToWad` which expects 0..100, NOT
// a fraction 0..1 — `percentToWad(99) === 0.99 in WAD`. Mirrors the
// upstream template's CAP_BUFFER_PERCENT.
export const CAP_BUFFER_PERCENT = 99;

/**
 * Maximum amount the vault can withdraw from a market while keeping
 * utilization >= `targetUtilization`, bounded by the vault's current
 * position in that market.
 *
 * Verbatim port of `morpho-org/vault-v2-reallocation-bot:apps/client/src/utils/maths.ts:getWithdrawableAmount`.
 */
export function getWithdrawableAmountV2(market: MarketV1Data, targetUtilization: bigint): bigint {
  return min(getWithdrawalToUtilization(market.state, targetUtilization), market.vaultAssets);
}

/**
 * Maximum amount the vault can deposit into a market while keeping
 * utilization <= `targetUtilization`, bounded by both the V2 vault's
 * absolute and relative caps (each multiplied by `capBufferPercent`).
 *
 * Verbatim port of `morpho-org/vault-v2-reallocation-bot:apps/client/src/utils/maths.ts:getDepositableAmount`.
 *
 * `capBufferPercent` is the percent (0..100) of cap we're willing to use,
 * NOT the buffer to leave (so 99 means "use 99%, leave 1%"). Passed to
 * `percentToWad` internally — that helper takes 0..100, not 0..1.
 */
export function getDepositableAmountV2(
  market: MarketV1Data,
  totalAssets: bigint,
  targetUtilization: bigint,
  capBufferPercent: number = CAP_BUFFER_PERCENT,
): bigint {
  const bufferWad = percentToWad(capBufferPercent);

  const bufferedAbsoluteCap = wMulDown(market.caps.absolute, bufferWad);
  const amountToAbsoluteCap =
    bufferedAbsoluteCap > market.vaultAssets ? bufferedAbsoluteCap - market.vaultAssets : 0n;

  const bufferedRelativeCap = wMulDown(wMulUp(totalAssets, market.caps.relative), bufferWad);
  const amountToRelativeCap =
    bufferedRelativeCap > market.vaultAssets ? bufferedRelativeCap - market.vaultAssets : 0n;

  return min(
    getDepositToUtilization(market.state, targetUtilization),
    min(amountToAbsoluteCap, amountToRelativeCap),
  );
}
