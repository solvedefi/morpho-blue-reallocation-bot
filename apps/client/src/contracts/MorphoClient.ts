import { Address, type Account, type Chain, type Client, type Transport } from "viem";
import { readContract } from "viem/actions";

import { Config } from "../../../config/dist/types";
import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { adaptiveCurveIrmAbi } from "../../test/abis/AdaptiveCurveIrm";
import { morphoBlueAbi } from "../../test/abis/MorphoBlue";
import { MarketParams, MarketState, VaultData, VaultMarketData } from "../utils/types";

import { accrueInterest, toAssetsDown } from "./helpers";

export class MorphoClient {
  private client: Client<Transport, Chain, Account>;
  private config: Config;

  constructor(client: Client<Transport, Chain, Account>, config: Config) {
    this.config = config;
    this.client = client;
  }

  async fetchVaultData(vaultAddress: Address): Promise<VaultData> {
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
        address: this.config.morpho.address,
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
        address: this.config.morpho.address,
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
        address: this.config.adaptiveCurveIrm.address,
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
        address: this.config.morpho.address,
        abi: morphoBlueAbi,
        functionName: "position",
        args: [marketId as `0x${string}`, vaultAddress], // marketId is bytes32, vaultAddress is the vault
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

      const vaultMarketData: VaultMarketData = {
        chainId: this.config.chain.id,
        id: marketId as `0x${string}`,
        params: marketParamsStruct,
        state: accuredState,
        cap: BigInt(supplyCap),
        vaultAssets,
        rateAtTarget: accuredRateAtTarget,
      };

      result.marketsData.set(marketId as `0x${string}`, vaultMarketData);
    }

    return result;
  }
}
