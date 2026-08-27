import { type Account, type Address, type Chain, type Client, type Transport } from "viem";
import { describe, expect, it, vi } from "vitest";

import { isLiquiditySimulationFailure } from "../../../../server/src/bot/liquidityErrors.js";
import { defaultRetryPolicy } from "../../../../server/src/bot/retryPolicy.js";
import { simulateReallocateWithRetry } from "../../../../server/src/bot/simulateWithRetry.js";
import { MarketAllocation, VaultData } from "../../../../server/src/utils/types.js";

const VAULT = "0x00000000000000000000000000000000000000bb" as Address;
const ACCOUNT = {
  address: "0x00000000000000000000000000000000000000cc",
  type: "json-rpc",
} as Account;
const PUBLIC_CLIENT = {} as Client<Transport, Chain>;

const EMPTY_VAULT_DATA: VaultData = {
  vaultAddress: VAULT,
  marketsData: new Map(),
};

const INITIAL_ALLOCATIONS: MarketAllocation[] = [];

describe("isLiquiditySimulationFailure", () => {
  it("detects known liquidity revert messages", () => {
    expect(isLiquiditySimulationFailure(new Error("NotEnoughLiquidity()"))).toBe(true);
    expect(isLiquiditySimulationFailure(new Error("not enough liquidity in market"))).toBe(true);
    expect(isLiquiditySimulationFailure(new Error("insufficient liquidity"))).toBe(true);
    expect(isLiquiditySimulationFailure(new Error("SupplyCapExceeded()"))).toBe(false);
  });
});

describe("simulateReallocateWithRetry", () => {
  it("returns on the first successful simulation", async () => {
    const simulate = vi.fn().mockResolvedValue(undefined);

    const result = await simulateReallocateWithRetry(
      PUBLIC_CLIENT,
      VAULT,
      ACCOUNT,
      INITIAL_ALLOCATIONS,
      EMPTY_VAULT_DATA,
      { ...defaultRetryPolicy(), retryDelaySeconds: 0 },
      simulate,
    );

    expect(result).toEqual({ allocations: INITIAL_ALLOCATIONS, attempt: 1 });
    expect(simulate).toHaveBeenCalledTimes(1);
  });

  it("retries liquidity failures with conservative replanning", async () => {
    const simulate = vi
      .fn()
      .mockRejectedValueOnce(new Error("NotEnoughLiquidity()"))
      .mockResolvedValueOnce(undefined);

    const result = await simulateReallocateWithRetry(
      PUBLIC_CLIENT,
      VAULT,
      ACCOUNT,
      INITIAL_ALLOCATIONS,
      EMPTY_VAULT_DATA,
      { ...defaultRetryPolicy(), retryDelaySeconds: 0 },
      simulate,
    );

    expect(result?.attempt).toBe(2);
    expect(simulate).toHaveBeenCalledTimes(2);
  });

  it("throws non-liquidity simulation errors immediately", async () => {
    const simulate = vi.fn().mockRejectedValue(new Error("NotAllocatorRole()"));

    await expect(
      simulateReallocateWithRetry(
        PUBLIC_CLIENT,
        VAULT,
        ACCOUNT,
        INITIAL_ALLOCATIONS,
        EMPTY_VAULT_DATA,
        { ...defaultRetryPolicy(), retryDelaySeconds: 0 },
        simulate,
      ),
    ).rejects.toThrow("NotAllocatorRole()");
  });
});
