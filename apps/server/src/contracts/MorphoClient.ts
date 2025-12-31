import { Result, ok, err } from "neverthrow";
import { Address, type Account, type Chain, type Client, type Transport } from "viem";
import { readContract } from "viem/actions";

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
  private client: Client<Transport, Chain, Account>;
  private config: Config;

  constructor(client: Client<Transport, Chain, Account>, config: Config) {
    this.config = config;
    this.client = client;
  }

  async fetchVaultData(vaultAddress: Address): Promise<Result<VaultData, Error>> {
    try {
      const withdrawQueueLength = await readContract(this.client, {
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
        args: [],
      });

      const withdrawQueueCalls: Promise<string>[] = [];
      for (let i = 0; i < Number(withdrawQueueLength); i++) {
        withdrawQueueCalls.push(
          readContract(this.client, {
            address: vaultAddress,
            abi: metaMorphoAbi,
            functionName: "withdrawQueue",
            args: [BigInt(i)],
          }),
        );
      }

      const marketIdsFromWithdrawQueue = await Promise.all(withdrawQueueCalls);
      const result: VaultData = {
        vaultAddress,
        marketsData: new Map<`0x${string}`, VaultMarketData>(),
      };

      for (const marketId of marketIdsFromWithdrawQueue) {
        const marketState = await readContract(this.client, {
          address: this.config.morpho,
          abi: morphoBlueAbi,
          functionName: "market",
          args: [marketId as `0x${string}`],
        });

        const marketStateStruct: MarketState = {
          totalSupplyAssets: marketState[0],
          totalSupplyShares: marketState[1],
          totalBorrowAssets: marketState[2],
          totalBorrowShares: marketState[3],
          lastUpdate: marketState[4],
          fee: marketState[5],
        };

        const marketParams = await readContract(this.client, {
          address: this.config.morpho,
          abi: morphoBlueAbi,
          functionName: "idToMarketParams",
          args: [marketId as `0x${string}`],
        });

        const marketParamsStruct: MarketParams = {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        };

        const rateAtTarget = await readContract(this.client, {
          address: this.config.adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId as `0x${string}`],
        });

        const config = await readContract(this.client, {
          address: vaultAddress,
          abi: metaMorphoAbi,
          functionName: "config",
          args: [marketId as `0x${string}`],
        });

        const supplyCap = config[0];

        const position = await readContract(this.client, {
          address: this.config.morpho,
          abi: morphoBlueAbi,
          functionName: "position",
          args: [marketId as `0x${string}`, vaultAddress],
        });

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

        const loanTokenDecimals = await readContract(this.client, {
          address: marketParamsStruct.loanToken,
          abi: erc20Abi,
          functionName: "decimals",
          args: [],
        });

        const vaultMarketData: VaultMarketData = {
          chainId: this.config.chain.id,
          id: marketId as `0x${string}`,
          params: marketParamsStruct,
          state: accuredState,
          cap: BigInt(supplyCap),
          vaultAssets,
          rateAtTarget: accuredRateAtTarget,
          apyAt100Utilization: 0n,
          loanTokenDecimals: Number(loanTokenDecimals),
        };

        const apyResult = await this.calculateAPYAt100Utilization(vaultMarketData);
        if (apyResult.isErr()) {
          return err(apyResult.error);
        }
        vaultMarketData.apyAt100Utilization = apyResult.value;

        result.marketsData.set(marketId as `0x${string}`, vaultMarketData);
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
