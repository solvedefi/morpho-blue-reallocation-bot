import { type Account, type Address, type Chain, type Client, type Transport } from "viem";
import { simulateContract } from "viem/actions";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { MarketAllocation, VaultData } from "../utils/types";

import { applyConservativeRetry } from "./conservativeRetry";
import { isLiquiditySimulationFailure } from "./liquidityErrors";
import { ReallocateArgs, toReallocateArgs } from "./reallocateArgs";
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
  params: {
    address: Address;
    abi: typeof metaMorphoAbi;
    functionName: "reallocate";
    args: ReallocateArgs;
    account: Account;
  },
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
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "reallocate",
        args: toReallocateArgs(allocations),
        account,
      });
      return { allocations, attempt };
    } catch (err) {
      if (!isLiquiditySimulationFailure(err) || attempt >= policy.maxAttempts) {
        throw err;
      }
      console.warn(
        `Liquidity simulation failed for ${vaultAddress} on attempt ${String(attempt)}/${String(policy.maxAttempts)}, retrying...`,
      );
      await sleepSeconds(policy.retryDelaySeconds);
    }
  }

  return null;
}
