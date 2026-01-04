import { Result, ok, err } from "neverthrow";
import { Address, type Chain, type Client, type Transport } from "viem";
import { multicall, readContract } from "viem/actions";

import { adaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm.js";
import { erc20Abi } from "../../abis/ERC20.js";
import { irmAbi } from "../../abis/IRM.js";
import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { type Config } from "../config";
import { rateToApy } from "../utils/maths";
import { MarketParams, MarketState, VaultData, VaultMarketData } from "../utils/types";

import { accrueInterest, toAssetsDown } from "./helpers";

export class MorphoClient {
  private client: Client<Transport, Chain>;
  private config: Config;

  constructor(client: Client<Transport, Chain>, config: Config) {
    this.config = config;
    this.client = client;
  }

  async fetchVaultData(vaultAddress: Address): Promise<Result<VaultData, Error>> {
    try {
      // Step 1: Get withdraw queue length
      const withdrawQueueLength = await readContract(this.client, {
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
        args: [],
      });

      // Step 2: Get all market IDs from withdraw queue using multicall
      const withdrawQueueCalls = [];
      for (let i = 0; i < Number(withdrawQueueLength); i++) {
        withdrawQueueCalls.push({
          address: vaultAddress,
          abi: metaMorphoAbi,
          functionName: "withdrawQueue",
          args: [BigInt(i)],
        } as const);
      }

      const marketIdsResults = await multicall(this.client, {
        contracts: withdrawQueueCalls,
        allowFailure: false,
      });

      const marketIds = marketIdsResults as `0x${string}`[];

      // Step 3: Batch all market data calls using multicall
      const allMarketCalls = [];
      for (const marketId of marketIds) {
        allMarketCalls.push(
          // market state
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "market",
            args: [marketId],
          } as const,
          // market params
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "idToMarketParams",
            args: [marketId],
          } as const,
          // rate at target
          {
            address: this.config.adaptiveCurveIrm,
            abi: adaptiveCurveIrmAbi,
            functionName: "rateAtTarget",
            args: [marketId],
          } as const,
          // config (supply cap)
          {
            address: vaultAddress,
            abi: metaMorphoAbi,
            functionName: "config",
            args: [marketId],
          } as const,
          // position (supply shares)
          {
            address: this.config.morpho,
            abi: morphoBlueAbi,
            functionName: "position",
            args: [marketId, vaultAddress],
          } as const,
        );
      }

      const allMarketResults = await multicall(this.client, {
        contracts: allMarketCalls,
        allowFailure: false,
      });

      // Step 4: Get decimals for all unique loan tokens using multicall
      const loanTokens = new Set<Address>();
      for (let i = 0; i < marketIds.length; i++) {
        const marketParamsIndex = i * 5 + 1;
        const marketParams = allMarketResults[marketParamsIndex] as readonly [
          Address,
          Address,
          Address,
          Address,
          bigint,
        ];
        loanTokens.add(marketParams[0]);
      }

      const decimalsCalls = Array.from(loanTokens).map(
        (token) =>
          ({
            address: token,
            abi: erc20Abi,
            functionName: "decimals",
            args: [],
          }) as const,
      );

      const decimalsResults = await multicall(this.client, {
        contracts: decimalsCalls,
        allowFailure: false,
      });

      const decimalsMap = new Map<Address, number>();
      Array.from(loanTokens).forEach((token, index) => {
        decimalsMap.set(token, Number(decimalsResults[index]));
      });

      // Step 5: Process results
      const result: VaultData = {
        vaultAddress,
        marketsData: new Map<`0x${string}`, VaultMarketData>(),
      };

      for (let i = 0; i < marketIds.length; i++) {
        const marketId = marketIds[i];
        if (!marketId) continue;
        const baseIndex = i * 5;

        const marketState = allMarketResults[baseIndex] as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const marketParams = allMarketResults[baseIndex + 1] as readonly [
          Address,
          Address,
          Address,
          Address,
          bigint,
        ];
        const rateAtTarget = allMarketResults[baseIndex + 2] as bigint;
        const config = allMarketResults[baseIndex + 3] as readonly [bigint, boolean, bigint];
        const position = allMarketResults[baseIndex + 4] as readonly [bigint, bigint, bigint];

        const marketStateStruct: MarketState = {
          totalSupplyAssets: marketState[0],
          totalSupplyShares: marketState[1],
          totalBorrowAssets: marketState[2],
          totalBorrowShares: marketState[3],
          lastUpdate: marketState[4],
          fee: marketState[5],
        };

        const marketParamsStruct: MarketParams = {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        };

        const supplyCap = config[0];
        const supplyShares = position[0];

        const { marketState: accuredState, rateAtTarget: accuredRateAtTarget } = accrueInterest(
          marketStateStruct,
          rateAtTarget,
          BigInt(Math.round(Date.now() / 1000)),
        );

        const vaultAssets = toAssetsDown(
          supplyShares,
          accuredState.totalSupplyAssets,
          accuredState.totalSupplyShares,
        );

        const loanTokenDecimals = decimalsMap.get(marketParamsStruct.loanToken) ?? 18;

        const vaultMarketData: VaultMarketData = {
          chainId: this.config.chain.id,
          id: marketId,
          params: marketParamsStruct,
          state: accuredState,
          cap: BigInt(supplyCap),
          vaultAssets,
          rateAtTarget: accuredRateAtTarget,
          apyAt100Utilization: 0n,
          loanTokenDecimals,
        };

        const apyResult = await this.calculateAPYAt100Utilization(vaultMarketData);
        if (apyResult.isErr()) {
          throw apyResult.error;
        }
        vaultMarketData.apyAt100Utilization = apyResult.value;

        result.marketsData.set(marketId, vaultMarketData);
      }

      return ok(result);
    } catch (error) {
      return err(new Error(`Failed to fetch vault data for ${vaultAddress}: ${String(error)}`));
    }
  }

  private async fetchRate(vaultMarketData: VaultMarketData): Promise<Result<bigint, Error>> {
    try {
      if (vaultMarketData.params.irm === "0x0000000000000000000000000000000000000000") {
        return ok(0n);
      }

      const borrowRate = await readContract(this.client, {
        address: vaultMarketData.params.irm,
        abi: irmAbi,
        functionName: "borrowRateView",
        args: [
          {
            loanToken: vaultMarketData.params.loanToken,
            collateralToken: vaultMarketData.params.collateralToken,
            oracle: vaultMarketData.params.oracle,
            irm: vaultMarketData.params.irm,
            lltv: vaultMarketData.params.lltv,
          },
          {
            totalSupplyAssets: vaultMarketData.state.totalSupplyAssets,
            totalSupplyShares: vaultMarketData.state.totalSupplyShares,
            totalBorrowAssets: vaultMarketData.state.totalBorrowAssets,
            totalBorrowShares: vaultMarketData.state.totalBorrowShares,
            lastUpdate: vaultMarketData.state.lastUpdate,
            fee: vaultMarketData.state.fee,
          },
        ],
      });

      return ok(borrowRate);
    } catch (error) {
      return err(new Error(`Failed to fetch borrow rate: ${String(error)}`));
    }
  }

  async calculateAPY(vaultMarketData: VaultMarketData): Promise<Result<bigint, Error>> {
    try {
      const borrowRateResult = await this.fetchRate(vaultMarketData);
      if (borrowRateResult.isErr()) {
        return err(borrowRateResult.error);
      }

      const borrowApy = rateToApy(borrowRateResult.value);
      return ok(borrowApy);
    } catch (error) {
      return err(new Error(`Failed to calculate APY: ${String(error)}`));
    }
  }

  async calculateAPYAt100Utilization(
    vaultMarketData: VaultMarketData,
  ): Promise<Result<bigint, Error>> {
    try {
      // we want to remove all excess supply assets, so that utilization is 100%
      const vaultMarketDataCopy = structuredClone(vaultMarketData);
      vaultMarketDataCopy.state.totalSupplyAssets = vaultMarketDataCopy.state.totalBorrowAssets;
      vaultMarketDataCopy.state.totalSupplyShares = vaultMarketDataCopy.state.totalBorrowShares;

      return await this.calculateAPY(vaultMarketDataCopy);
    } catch (error) {
      return err(new Error(`Failed to calculate APY at 100% utilization: ${String(error)}`));
    }
  }
}
