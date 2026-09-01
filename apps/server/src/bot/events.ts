import type { Address, Hex } from "viem";

/**
 * Per-vault reallocation outcome event, emitted as a single-line JSON log
 * by both `ReallocationBot` (V1) and `ReallocationBotV2`. Same shape as
 * the gas-monitor's `gas_check` ticks — log shippers and the Phase 1.6
 * action-summary aggregator can consume both versions through one shape.
 */
export interface ReallocationEvent {
  chainId: number;
  version: "V1" | "V2";
  vault: Address;
  status: "executed" | "reverted" | "skipped" | "failed";
  /** Why the bot skipped (only set when `status === "skipped"`). */
  reason?: string;
  /** Number of `allocate` calls in the proposed reallocation. */
  allocationsCount?: number;
  /** Number of `deallocate` calls — V2 only (V1 has no separate dealloc list). */
  deallocationsCount?: number;
  /** Tx hash if the bot actually broadcast a tx. */
  txHash?: Hex;
  /** First line of the error message if `status === "failed"` or `"skipped"` due to error. */
  error?: string;
}

export function emitReallocationEvent(payload: ReallocationEvent): void {
  console.log(JSON.stringify({ evt: "reallocation", ...payload }));
}
