import { simulateContract } from "viem/actions";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";

import { vaultV2Abi } from "../../../abis/VaultV2.js";
import { encodeV2Reallocation } from "../../../src/bot/encodeV2Reallocation.js";
import { chainConfigs } from "../../../src/config/config.js";
import { MorphoV2Client } from "../../../src/contracts/MorphoV2Client.js";
import { ApyRangeV2Strategy } from "../../../src/strategies-v2/apyRange/ApyRangeV2Strategy.js";
import {
  buildOptimalApyConfig,
  describeV2Rebalance,
} from "../../helpers/buildMinimalV2Rebalance.js";
import {
  GAUNTLET_USDC_ADAPTER,
  GAUNTLET_USDC_ALLOCATOR,
  GAUNTLET_USDC_MARKET_IDS,
  GAUNTLET_USDC_PRIME,
} from "../../helpers/v2ForkConstants.js";
import { test } from "../../setup.js";

describe.skipIf(!!process.env.CI)("anvil fork V2 reallocation", () => {
  test.sequential(
    "fetches Gauntlet USDC Prime and simulates optimal APY multicall",
    async ({ client }) => {
      const config = chainConfigs[mainnet.id];
      if (!config) {
        throw new Error("Missing mainnet config");
      }

      const morphoV2Client = new MorphoV2Client(client, config);
      const vaultDataResult = await morphoV2Client.fetchVaultData(
        GAUNTLET_USDC_PRIME,
        GAUNTLET_USDC_ADAPTER,
        GAUNTLET_USDC_MARKET_IDS,
      );

      expect(vaultDataResult.isOk()).toBe(true);
      const vaultData = vaultDataResult._unsafeUnwrap();
      expect(vaultData.onChainAdapter.toLowerCase()).toBe(GAUNTLET_USDC_ADAPTER.toLowerCase());
      expect(vaultData.marketsV1Data.markets.length).toBeGreaterThan(0);
      expect(vaultData.totalAssets).toBeGreaterThan(0n);

      const strategy = new ApyRangeV2Strategy(buildOptimalApyConfig(vaultData));
      const strategyResult = strategy.findReallocation(vaultData);
      expect(strategyResult.isOk()).toBe(true);

      const reallocation = strategyResult._unsafeUnwrap();
      expect(reallocation).toBeDefined();
      if (!reallocation) {
        throw new Error("ApyRangeV2Strategy should produce an optimal reallocation on fork state");
      }
      expect(reallocation.allocations.length).toBeGreaterThan(0);
      expect(reallocation.deallocations.length).toBeGreaterThan(0);

      console.log(describeV2Rebalance(GAUNTLET_USDC_PRIME, reallocation));

      const calls = encodeV2Reallocation(reallocation);
      await simulateContract(client, {
        address: GAUNTLET_USDC_PRIME,
        abi: vaultV2Abi,
        functionName: "multicall",
        args: [calls],
        account: GAUNTLET_USDC_ALLOCATOR,
      });
    },
    120_000,
  );
});
