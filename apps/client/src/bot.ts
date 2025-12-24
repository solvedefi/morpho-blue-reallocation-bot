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
    this.client = client;
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
          /// TX SIMULATION
          const populatedTx = {
            to: vaultData.vaultAddress,
            data: encodeFunctionData({
              abi: metaMorphoAbi,
              functionName: "reallocate",
              args: [reallocation],
            }),
            value: 0n, // TODO: find a way to get encoder value
          };
          await estimateGas(this.client, populatedTx);
          // TX EXECUTION
          await writeContract(this.client, {
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
        } catch (error) {
          console.log(`Failed to reallocate on ${vaultData.vaultAddress}`);
          console.error("reallocation error", error);
        }
      }),
    );
  }
}

// marketId: 0x3a5bdf0be8d820c1303654b078b14f8fc6d715efaeca56cec150b934bdcbff31
// collateralToken: 0xCc7FF230365bD730eE4B352cC2492CEdAC49383e
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0xD93F135Cbe98338bD8b7cA043AAD8FB1d86ACAEE
// irm: 0x46415998764C29aB2a25CbeA6254146D50D22687
// lltv: 860000000000000000n
// assets: 18952561818174292293592n | 18952 from the reallocation and 18952 from the ui
// cap: 250000000000000000000000n

// marketId: 0xc9658cac13a9b9b5c1ebaa8ce19c735283cc761ff528d149a7221047bb7fab45
// collateralToken: 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0x2dD12a50b4f60e09Ab1b6B42fBcD241AEf36C78e
// irm: 0x46415998764C29aB2a25CbeA6254146D50D22687
// lltv: 860000000000000000n
// assets: 245180197549818466564775n | 245180 from the reallocation and 245180 from the ui
// cap: 1500000000000000000000000n

// marketId: 0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf
// collateralToken: 0xCb327b99fF831bF8223cCEd12B1338FF3aA322Ff
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0xc866447b4C254E2029f1bfB700F5AA43ce27b1BE
// irm: 0x46415998764C29aB2a25CbeA6254146D50D22687
// lltv: 860000000000000000n
// assets: 813925447587750164412525n | 813925 from the reallocation and 813925 (borrowed) + 650917 (liq) = 1464842 (totalAssets) from the ui
// cap: 2000000000000000000000000n

// marketId: 0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d
// collateralToken: 0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0xc3Fa71D77d80f671F366DAA6812C8bD6C7749cEc
// irm: 0x46415998764C29aB2a25CbeA6254146D50D22687
// lltv: 860000000000000000n
// assets: 676086912042146285752119n | 676086 from the reallocation and 676086 (borrowed) + 557715 (liq) = 1233801 (totalAssets) from the ui
// cap: 2000000000000000000000000n

// marketId: 0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea
// collateralToken: 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0xa79e9EC3458fEd729E7A0A1A1573e6a29E875d5E
// irm: 0x46415998764C29aB2a25CbeA6254146D50D22687
// lltv: 860000000000000000n
// assets: 1165602481556296200255379n / 1165602 from the reallocation and 1165602 (borrowed) + 1165602 (liq) = 1991973 (totalAssets) from the ui
// cap: 2000000000000000000000000n

// marketId: 0x4a858e4426a2132c7090021abe5939a8afcd6644429e138e677104530be1e547
// collateralToken: 0x0000000000000000000000000000000000000000
// loanToken: 0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4
// oracle: 0x0000000000000000000000000000000000000000
// irm: 0x0000000000000000000000000000000000000000
// lltv: 0n
// assets: 115792089237316195423570985008687907853269984665640564039457584007913129639935n
// cap: 1000000000000000000000000000n
