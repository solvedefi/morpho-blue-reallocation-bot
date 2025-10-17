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
import { VaultData } from "./utils/types.js";

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

    const vaultData = vaultsData[0];
    if (!vaultData) {
      throw new Error("Vault data not found");
    }

    await testWorkingReallocationForWBTCHONEY(this.client, vaultData);

    // await Promise.all(
    //   vaultsData.map(async (vaultData) => {
    //     const reallocation = await this.strategy.findReallocation(vaultData);

    //     if (!reallocation) return;

    //     try {
    //       /// TX SIMULATION
    //       const populatedTx = {
    //         to: vaultData.vaultAddress,
    //         data: encodeFunctionData({
    //           abi: metaMorphoAbi,
    //           functionName: "reallocate",
    //           args: [reallocation],
    //         }),
    //         value: 0n, // TODO: find a way to get encoder value
    //       };
    //       await estimateGas(this.client, populatedTx);
    //       // // TX EXECUTION
    //       // await writeContract(this.client, {
    //       //   address: vaultData.vaultAddress,
    //       //   abi: metaMorphoAbi,
    //       //   functionName: "reallocate",
    //       //   args: [
    //       //     reallocation as unknown as readonly {
    //       //       marketParams: {
    //       //         loanToken: `0x${string}`;
    //       //         collateralToken: `0x${string}`;
    //       //         oracle: `0x${string}`;
    //       //         irm: `0x${string}`;
    //       //         lltv: bigint;
    //       //       };
    //       //       assets: bigint;
    //       //     }[],
    //       //   ],
    //       // });
    //       // console.log(`Reallocated on ${vaultData.vaultAddress}`);
    //     } catch (error) {
    //       console.log(`Failed to reallocate on ${vaultData.vaultAddress}`);
    //       console.error("reallocation error", error);
    //     }
    //   }),
    // );
  }
}

async function testWorkingReallocationForWBTCHONEY(
  client: Client<Transport, Chain, Account>,
  vaultData: VaultData,
) {
  const currentWBTCSupply = BigInt("999999072601630715955723");
  const oneHoney = BigInt(1) * 10n ** 18n;
  const maxCatcher =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

  const reallocation = [
    {
      marketParams: {
        loanToken: "0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce",
        collateralToken: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
        oracle: "0x7473Be21793d12ccEc17CE17fD95ba1cB114C9EB",
        irm: "0xcf247Df3A2322Dea0D408f011c194906E77a6f62",
        lltv: "860000000000000000",
      },
      assets: currentWBTCSupply - oneHoney,
    },
    {
      marketParams: {
        loanToken: "0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce",
        collateralToken: "0x0000000000000000000000000000000000000000",
        oracle: "0x0000000000000000000000000000000000000000",
        irm: "0x0000000000000000000000000000000000000000",
        lltv: "0",
      },
      assets: oneHoney,
    },
    {
      marketParams: {
        loanToken: "0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce",
        collateralToken: "0x0000000000000000000000000000000000000000",
        oracle: "0x0000000000000000000000000000000000000000",
        irm: "0x0000000000000000000000000000000000000000",
        lltv: "0",
      },
      assets: maxCatcher,
    },
  ];

  /// TX SIMULATION
  const populatedTx = {
    to: vaultData.vaultAddress,
    data: encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [
        reallocation as unknown as readonly {
          marketParams: {
            loanToken: `0x${string}`;
            collateralToken: `0x${string}`;
            oracle: `0x${string}`;
            irm: `0x${string}`;
            lltv: bigint;
          };
          assets: bigint;
        }[],
      ],
    }),
    value: 0n, // TODO: find a way to get encoder value
  };
  await estimateGas(client, populatedTx);
  // TX EXECUTION
  await writeContract(client, {
    address: vaultData.vaultAddress,
    abi: metaMorphoAbi,
    functionName: "reallocate",
    args: [
      reallocation as unknown as readonly {
        marketParams: {
          loanToken: `0x${string}`;
          collateralToken: `0x${string}`;
          oracle: `0x${string}`;
          irm: `0x${string}`;
          lltv: bigint;
        };
        assets: bigint;
      }[],
    ],
  });

  console.log(`Reallocated on ${vaultData.vaultAddress}`);
}
