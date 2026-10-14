import { type Account, type Address, type Chain, type Client, type Transport } from "viem";
import { simulateContract } from "viem/actions";

import { logger } from "../logger";
import { MarketAllocation, VaultData } from "../utils/types";

import { applyConservativeRetry } from "./conservativeRetry";
import { isLiquiditySimulationFailure } from "./liquidityErrors";
import { reallocateCall, type ReallocateCall } from "./reallocateArgs";
import {
  loadRetryPolicyFromEnv,
  settingsForAttempt,
  sleepSeconds,
  type RetryPolicyConfig,
} from "./retryPolicy";

export interface SimulateWithRetryResult {
  allocations: MarketAllocation[];
  attempt: number;
}

type SimulateReallocate = (
  publicClient: Client<Transport, Chain>,
  params: ReallocateCall & { address: Address; account: Account },
) => Promise<unknown>;

export async function simulateReallocateWithRetry(
  publicClient: Client<Transport, Chain>,
  vaultAddress: Address,
  account: Account,
  initialAllocations: MarketAllocation[],
  vaultData: VaultData,
  policy: RetryPolicyConfig = loadRetryPolicyFromEnv(),
  simulate: SimulateReallocate = simulateContract as SimulateReallocate,
): Promise<SimulateWithRetryResult | null> {
  let allocations = initialAllocations;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (attempt > 1) {
      allocations = applyConservativeRetry(
        initialAllocations,
        vaultData,
        settingsForAttempt(policy, attempt),
      );
    }

    try {
      await simulate(publicClient, {
        ...reallocateCall(vaultData, allocations),
        address: vaultAddress,
        account,
      });
      return { allocations, attempt };
    } catch (err) {
      if (!isLiquiditySimulationFailure(err) || attempt >= policy.maxAttempts) {
        throw err;
      }
      logger.warn(
        { vault: vaultAddress, attempt, maxAttempts: policy.maxAttempts },
        "Liquidity simulation failed, retrying",
      );
      await sleepSeconds(policy.retryDelaySeconds);
    }
  }

  return null;
}
