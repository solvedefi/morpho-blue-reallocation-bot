import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { estimateGas, writeContract } from "viem/actions";

import { Config } from "../../config/dist/types.js";
import { metaMorphoAbi } from "../abis/MetaMorpho.js";

import { MorphoClient } from "./contracts/MorphoClient.js";
import { Strategy } from "./strategies/strategy.js";

export class ReallocationBot {
  private chainId: number;
  private client: Client<Transport, Chain, Account>;
  private vaultWhitelist: Address[];
  private strategy: Strategy;
  private morphoClient: MorphoClient;
  private config: Config;

  constructor(
    chainId: number,
    client: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    config: Config,
  ) {
    this.chainId = chainId;
    this.client = client;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoClient = new MorphoClient(client, config);
    this.config = config;
  }

  async run() {
    const { vaultWhitelist } = this;
    const vaultsData = await Promise.all(
      vaultWhitelist.map((vault) => this.morphoClient.fetchVaultData(vault)),
    );

    console.log("vaultsData");
    vaultsData.forEach((vaultData) => {
      console.log("vaultAddress", vaultData.vaultAddress);
      vaultData.marketsData.forEach((marketData) => {
        console.log("chainId", marketData.chainId);
        console.log("Id", marketData.id);
        console.log("marketsData.params.collateralToken", marketData.params.collateralToken);
        console.log("marketsData.params.loanToken", marketData.params.loanToken);
        console.log("marketsData.params.oracle", marketData.params.oracle);
        console.log("marketsData.params.irm", marketData.params.irm);
        console.log("marketsData.params.lltv", marketData.params.lltv);
        console.log("marketsData.state.totalSupplyAssets", marketData.state.totalSupplyAssets);
        console.log("marketsData.state.totalSupplyShares", marketData.state.totalSupplyShares);
        console.log("marketsData.state.totalBorrowAssets", marketData.state.totalBorrowAssets);
        console.log("marketsData.state.totalBorrowShares", marketData.state.totalBorrowShares);
        console.log("marketsData.state.lastUpdate", marketData.state.lastUpdate);
        console.log("marketsData.state.fee", marketData.state.fee);
        console.log("marketsData.cap", marketData.cap);
        console.log("marketsData.vaultAssets", marketData.vaultAssets);
        console.log("marketsData.rateAtTarget", marketData.rateAtTarget);
        console.log();
        console.log();
      });
    });

    await Promise.all(
      vaultsData.map(async (vaultData) => {
        const reallocation = await this.strategy.findReallocation(vaultData);

        if (!reallocation) return;

        try {
          // /// TX SIMULATION
          // const populatedTx = {
          //   to: vaultData.vaultAddress,
          //   data: encodeFunctionData({
          //     abi: metaMorphoAbi,
          //     functionName: "reallocate",
          //     args: [reallocation],
          //   }),
          //   value: 0n, // TODO: find a way to get encoder value
          // };
          // await estimateGas(this.client, populatedTx);
          // // TX EXECUTION
          // await writeContract(this.client, {
          //   address: vaultData.vaultAddress,
          //   abi: metaMorphoAbi,
          //   functionName: "reallocate",
          //   args: [
          //     reallocation as unknown as readonly {
          //       marketParams: {
          //         loanToken: `0x${string}`;
          //         collateralToken: `0x${string}`;
          //         oracle: `0x${string}`;
          //         irm: `0x${string}`;
          //         lltv: bigint;
          //       };
          //       assets: bigint;
          //     }[],
          //   ],
          // });
          // console.log(`Reallocated on ${vaultData.vaultAddress}`);
        } catch (error) {
          console.log(`Failed to reallocate on ${vaultData.vaultAddress}`);
          console.error("reallocation error", error);
        }
      }),
    );
  }
}
