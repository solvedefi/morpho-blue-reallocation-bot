import { type Account, type Address, type Chain, type Client, type Transport } from "viem";

import { Config } from "../../config/dist/types.js";

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
    this.client = client;
  }

  /**
   * Update the bot's strategy with new configuration
   */
  updateStrategy(strategy: Strategy) {
    this.strategy = strategy;
    console.log(`Strategy updated for bot on chain ${this.chainId.toString()}`);
  }

  async run() {
    const { vaultWhitelist } = this;
    const vaultsData = await Promise.all(
      vaultWhitelist.map((vault) => this.morphoClient.fetchVaultData(vault)),
    );
    await Promise.all(
      vaultsData.map(async (vaultData) => {
        const reallocation = await this.strategy.findReallocation(vaultData);

        if (!reallocation) {
          console.log(
            `No reallocation found on ${vaultData.vaultAddress} on chain ${this.chainId.toString()}`,
          );
          return;
        }

        console.log(`Reallocating on ${vaultData.vaultAddress}`);

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
