import { type Address } from "viem";
import { simulateContract } from "viem/actions";
import { describe, expect } from "vitest";

import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { isLiquiditySimulationFailure } from "../../../src/bot/liquidityErrors.js";
import { toReallocateArgs } from "../../../src/bot/reallocateArgs.js";
import { defaultRetryPolicy } from "../../../src/bot/retryPolicy.js";
import { simulateReallocateWithRetry } from "../../../src/bot/simulateWithRetry.js";
import { chainConfigs } from "../../../src/config/config.js";
import { MorphoClient } from "../../../src/contracts/MorphoClient.js";
import {
  buildAggressiveReallocation,
  describeAggressivePlan,
} from "../../helpers/aggressiveReallocation.js";
import { test } from "../../setup.js";

const STEAKHOUSE_USDC = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB" as Address;
const CURATOR = "0x827e86072B06674a077f592A531dcE4590aDeCdB" as Address;

describe("anvil fork reallocation retry", () => {
  test.sequential(
    "retries after over-withdrawing from Steakhouse USDC",
    async ({ client }) => {
      const config = chainConfigs[1];
      if (!config) {
        throw new Error("Missing mainnet config");
      }

      const morphoClient = new MorphoClient(client, config);
      const vaultDataResult = await morphoClient.fetchVaultData(STEAKHOUSE_USDC);
      expect(vaultDataResult.isOk()).toBe(true);

      const vaultData = vaultDataResult._unsafeUnwrap();
      const aggressivePlan = buildAggressiveReallocation(vaultData);
      expect(aggressivePlan).not.toBeNull();

      if (!aggressivePlan) {
        throw new Error("No aggressive reallocation plan could be built");
      }

      console.log(`Aggressive plan: ${describeAggressivePlan(vaultData, aggressivePlan)}`);

      let firstAttemptError: unknown;
      try {
        await simulateContract(client, {
          address: STEAKHOUSE_USDC,
          abi: metaMorphoAbi,
          functionName: "reallocate",
          args: toReallocateArgs(aggressivePlan),
          account: CURATOR,
        });
      } catch (err) {
        firstAttemptError = err;
      }

      expect(firstAttemptError).toBeDefined();
      expect(isLiquiditySimulationFailure(firstAttemptError)).toBe(true);

      const retryPolicy = {
        ...defaultRetryPolicy(),
        retryDelaySeconds: 0,
      };

      const result = await simulateReallocateWithRetry(
        client,
        STEAKHOUSE_USDC,
        { address: CURATOR, type: "json-rpc" },
        aggressivePlan,
        vaultData,
        retryPolicy,
      );

      expect(result).not.toBeNull();
      if (!result) {
        return;
      }
      expect(result.attempt).toBeGreaterThan(1);
      console.log(
        `Retry succeeded on attempt ${String(result.attempt)}/${String(retryPolicy.maxAttempts)}`,
      );
    },
    120_000,
  );
});
