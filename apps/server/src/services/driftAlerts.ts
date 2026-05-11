import type { Address, Hex } from "viem";

export interface DriftAlertPayload {
  chainId: number;
  vaultAddress: Address;
  /** What the diff would do — present whether or not the apply succeeded. */
  adapterUpdate?: { from: Address; to: Address };
  marketsRemoved: Hex[];
  /** Populated when the DB write failed; consumer should escalate severity. */
  applyErrors?: string[];
}

// #TODO: slack alert
export function alertDriftDetected(payload: DriftAlertPayload): void {
  const applyFailed = (payload.applyErrors?.length ?? 0) > 0;
  const severity = applyFailed || payload.adapterUpdate ? "critical" : "warning";
  console.log(
    JSON.stringify({
      evt: "v2_drift_alert",
      chainId: payload.chainId,
      vault: payload.vaultAddress,
      adapterUpdate: payload.adapterUpdate,
      marketsRemoved: payload.marketsRemoved,
      applyErrors: payload.applyErrors,
      severity,
    }),
  );
}
