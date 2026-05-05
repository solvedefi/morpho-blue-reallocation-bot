import { Result, err, ok } from "neverthrow";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { multicall } from "viem/actions";

import { adaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm.js";
import { erc20Abi } from "../../abis/ERC20.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { vaultV2Abi } from "../../abis/VaultV2.js";
import { type Config } from "../config";
import { MarketParams, MarketState } from "../utils/types";

import { accrueInterest, toAssetsDown } from "./helpers";
import { Caps, MarketV1Data, VaultV2Data, VaultV2MarketV1Data } from "./typesV2";

export class MorphoV2Client {
  private client: Client<Transport, Chain>;
  private config: Config;

  constructor(client: Client<Transport, Chain>, config: Config) {
    this.client = client;
    this.config = config;
  }

  /**
   * Fetch full V2 vault state for the given operator-curated market list.
   *
   * Reads (all RPC, batched via multicall where possible):
   *   - VaultV2: totalAssets + per-market absoluteCap/relativeCap
   *   - MorphoBlue: market state + idToMarketParams + position(adapter) per market
   *   - AdaptiveCurveIRM: rateAtTarget per market
   *
   * Position is held by the adapter (not the vault) in V2 — that's the key
   * difference from V1.
   */
  async fetchVaultData(
    vaultAddress: Address,
    adapterAddress: Address,
    marketIds: Hex[],
  ): Promise<Result<VaultV2Data, Error>> {
    try {
      if (marketIds.length === 0) {
        return ok({
          vaultAddress,
          totalAssets: 0n,
          idleAssets: 0n,
          marketsV1Data: { adapterAddress, markets: [] },
        });
      }

      const calls = [
        { address: vaultAddress, abi: vaultV2Abi, functionName: "totalAssets" } as const,
        { address: vaultAddress, abi: vaultV2Abi, functionName: "asset" } as const,
        ...marketIds.flatMap(
          (marketId) =>
            [
              {
                address: this.config.morpho,
                abi: morphoBlueAbi,
                functionName: "market",
                args: [marketId],
              },
              {
                address: this.config.morpho,
                abi: morphoBlueAbi,
                functionName: "idToMarketParams",
                args: [marketId],
              },
              {
                address: this.config.morpho,
                abi: morphoBlueAbi,
                functionName: "position",
                args: [marketId, adapterAddress],
              },
              {
                address: this.config.adaptiveCurveIrm,
                abi: adaptiveCurveIrmAbi,
                functionName: "rateAtTarget",
                args: [marketId],
              },
            ] as const,
        ),
      ];

      const results = await multicall(this.client, { contracts: calls, allowFailure: false });

      const totalAssets = results[0] as bigint;
      const assetAddress = results[1] as Address;

      // Per-market reads start at index 2, 4 calls per market, plus 2 cap reads
      // that we issue as a follow-up multicall once we know the marketParams
      // (cap IDs depend on params + adapter).
      const markets: MarketV1Data[] = [];
      const capCalls: { absId: Hex; relId: Hex }[] = [];

      for (let i = 0; i < marketIds.length; i++) {
        const marketId = marketIds[i];
        if (!marketId) continue;
        const baseIdx = 2 + i * 4;
        const marketTuple = results[baseIdx] as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const paramsTuple = results[baseIdx + 1] as readonly [
          Address,
          Address,
          Address,
          Address,
          bigint,
        ];
        const positionTuple = results[baseIdx + 2] as readonly [bigint, bigint, bigint];
        const rateAtTarget = results[baseIdx + 3] as bigint;

        const params: MarketParams = {
          loanToken: paramsTuple[0],
          collateralToken: paramsTuple[1],
          oracle: paramsTuple[2],
          irm: paramsTuple[3],
          lltv: paramsTuple[4],
        };
        const state: MarketState = {
          totalSupplyAssets: marketTuple[0],
          totalSupplyShares: marketTuple[1],
          totalBorrowAssets: marketTuple[2],
          totalBorrowShares: marketTuple[3],
          lastUpdate: marketTuple[4],
          fee: marketTuple[5],
        };

        const { marketState: accruedState, rateAtTarget: accruedRate } = accrueInterest(
          state,
          rateAtTarget,
          BigInt(Math.round(Date.now() / 1000)),
        );

        // Adapter's supply position in this market → vault's effective assets
        const adapterShares = positionTuple[0];
        const vaultAssets = toAssetsDown(
          adapterShares,
          accruedState.totalSupplyAssets,
          accruedState.totalSupplyShares,
        );

        const capId = marketV1CapId(params, adapterAddress);
        capCalls.push({ absId: capId, relId: capId });

        // Caps are filled in below after the second multicall.
        markets.push({
          chainId: this.config.chain.id,
          id: marketId,
          params,
          state: accruedState,
          caps: { absolute: 0n, relative: 0n },
          vaultAssets,
          rateAtTarget: accruedRate,
        });
      }

      // Second multicall: caps per market + idle assets (vault's underlying ERC20
      // balance held outside any adapter).
      const secondCalls = [
        ...capCalls.flatMap(
          ({ absId, relId }) =>
            [
              {
                address: vaultAddress,
                abi: vaultV2Abi,
                functionName: "absoluteCap",
                args: [absId],
              },
              {
                address: vaultAddress,
                abi: vaultV2Abi,
                functionName: "relativeCap",
                args: [relId],
              },
            ] as const,
        ),
        {
          address: assetAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [vaultAddress],
        } as const,
      ];

      const secondResults = await multicall(this.client, {
        contracts: secondCalls,
        allowFailure: false,
      });

      const idleAssets = secondResults[secondResults.length - 1] as bigint;

      for (let i = 0; i < markets.length; i++) {
        const market = markets[i];
        const absolute = secondResults[i * 2];
        const relative = secondResults[i * 2 + 1];
        if (!market || absolute === undefined || relative === undefined) continue;
        const caps: Caps = {
          absolute: absolute as bigint,
          relative: relative as bigint,
        };
        market.caps = caps;
      }

      const marketsV1Data: VaultV2MarketV1Data = { adapterAddress, markets };

      return ok({
        vaultAddress,
        totalAssets,
        idleAssets,
        marketsV1Data,
      });
    } catch (error) {
      return err(new Error(`Failed to fetch V2 vault data for ${vaultAddress}: ${String(error)}`));
    }
  }
}

/**
 * Compute the V2 vault's storage key for a (market V1, adapter) cap.
 * Mirrors `morpho-org/vault-v2-reallocation-bot:apps/client/src/utils/capsIds.ts`.
 */
export function marketV1CapId(params: MarketParams, adapterAddress: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("string,address,(address,address,address,address,uint256)"),
      [
        "this/marketParams",
        adapterAddress,
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
      ],
    ),
  );
}
