import { DEFAULT_MIN_GAS_WEI } from "../constants.js";

const SAFETY_MULTIPLIER = 20n;

function maxBigint(...values: bigint[]): bigint {
  return values.reduce((a, b) => (a > b ? a : b), 0n);
}

/**
 * Tracks per-chain minimum gas balance thresholds for the reallocator EOA.
 *
 * The effective threshold for a chain is the max of three sources:
 *   1. Bot-observed: `gasUsed × gasPrice × SAFETY_MULTIPLIER` from the most
 *      recent successful reallocation on that chain. Updated via `record(...)`.
 *   2. Admin override: `chain_config.min_gas_wei` from the DB, passed per
 *      tick (operator-tunable via UI without redeploy).
 *   3. Hardcoded default: `DEFAULT_MIN_GAS_WEI[chainId]`, the safety floor.
 *
 * Observed values live only in memory — on process restart we reseed from
 * admin + default and rebuild observations as reallocations happen.
 */
export class MinGasThresholds {
  private observed = new Map<number, bigint>();

  /**
   * Record the gas cost of a successful reallocation. Called from
   * `ReallocationBot` after each `waitForTransactionReceipt`.
   */
  record(chainId: number, gasUsed: bigint, gasPrice: bigint): void {
    this.observed.set(chainId, gasUsed * gasPrice * SAFETY_MULTIPLIER);
  }

  /**
   * Effective minimum-gas threshold for a chain, taking the max of the
   * bot-observed value, the admin override (DB), and the hardcoded default.
   */
  get(chainId: number, adminOverride: bigint | null): bigint {
    return maxBigint(
      this.observed.get(chainId) ?? 0n,
      adminOverride ?? 0n,
      DEFAULT_MIN_GAS_WEI[chainId] ?? 0n,
    );
  }
}
