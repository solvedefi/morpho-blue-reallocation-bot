import { Address, type Account, type Chain, type Client, type Transport } from "viem";
import { readContract } from "viem/actions";

import { Config } from "../../../config/dist/types";
import { irmAbi } from "../../abis/IRM";
import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { adaptiveCurveIrmAbi } from "../../test/abis/AdaptiveCurveIrm";
import { morphoBlueAbi } from "../../test/abis/MorphoBlue";
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
        rate: 0,
        rateAt100Utilization: 0,
      };

      vaultMarketData.rate = await this.calculateRate(vaultMarketData);
      vaultMarketData.rateAt100Utilization =
        await this.calculateRateAt100Utilization(vaultMarketData);

      result.marketsData.set(marketId as `0x${string}`, vaultMarketData);
    }

    return result;
  }

  private async fetchRate(vaultMarketData: VaultMarketData): Promise<bigint> {
    if (vaultMarketData.params.irm === "0x0000000000000000000000000000000000000000") {
      return 0n;
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

    return borrowRate;
  }

  // returns borrow apy decimal (e.g. 0.05 for 5%)
  async calculateRate(vaultMarketData: VaultMarketData): Promise<number> {
    const borrowRate = await this.fetchRate(vaultMarketData);
    const borrowApy = rateToApy(borrowRate);

    return (Number(borrowApy) / 1e18) * 100;
  }

  // returns borrow apy decimal (e.g. 0.05 for 5%)
  async calculateRateAt100Utilization(vaultMarketData: VaultMarketData): Promise<number> {
    // we want to remove all excess supply assets, so that utilization is 100%

    const vaultMarketDataCopy = structuredClone(vaultMarketData);
    vaultMarketDataCopy.state.totalSupplyAssets = vaultMarketDataCopy.state.totalBorrowAssets;
    vaultMarketDataCopy.state.totalSupplyShares = vaultMarketDataCopy.state.totalBorrowShares;

    console.log("======");
    console.log(
      "vaultMarketData.state.totalSupplyAssets:",
      vaultMarketDataCopy.state.totalSupplyAssets,
    );
    console.log(
      "vaultMarketData.state.totalSupplyShares:",
      vaultMarketDataCopy.state.totalSupplyShares,
    );
    console.log(
      "vaultMarketData.state.totalBorrowAssets:",
      vaultMarketDataCopy.state.totalBorrowAssets,
    );
    console.log(
      "vaultMarketData.state.totalBorrowShares:",
      vaultMarketDataCopy.state.totalBorrowShares,
    );
    console.log("vaultMarketData.state.lastUpdate:", vaultMarketDataCopy.state.lastUpdate);
    console.log("vaultMarketData.state.fee:", vaultMarketDataCopy.state.fee);
    console.log("vaultMarketData.params.irm:", vaultMarketDataCopy.params.irm);
    console.log("vaultMarketData.params.loanToken:", vaultMarketDataCopy.params.loanToken);
    console.log(
      "vaultMarketData.params.collateralToken:",
      vaultMarketDataCopy.params.collateralToken,
    );
    console.log("vaultMarketData.params.oracle:", vaultMarketDataCopy.params.oracle);
    console.log("vaultMarketData.params.lltv:", vaultMarketDataCopy.params.lltv);
    console.log("vaultMarketData.id:", vaultMarketDataCopy.id);
    console.log("rateAt100Utilization:", await this.calculateRate(vaultMarketDataCopy));
    console.log("======");
    return await this.calculateRate(vaultMarketDataCopy);
  }
}
