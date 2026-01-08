import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { estimateGas, sendTransaction, waitForTransactionReceipt } from "viem/actions";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { type Config } from "../config";
import { getChainName } from "../constants.js";
import { MorphoClient } from "../contracts/MorphoClient.js";
import { Strategy } from "../strategies/strategy.js";

export class ReallocationBot {
  private chainId: number;
  private publicClient: Client<Transport, Chain>;
  private walletClient: Client<Transport, Chain, Account>;
  private vaultWhitelist: Address[];
  private strategy: Strategy;
  private morphoClient: MorphoClient;
  private config: Config;

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    config: Config,
  ) {
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoClient = new MorphoClient(publicClient, config);
    this.config = config;
  }

  /**
   * Update the bot's strategy with new configuration
   */
  updateStrategy(strategy: Strategy) {
    this.strategy = strategy;
    console.log(`Strategy updated for bot on chain ${getChainName(this.chainId)}`);
  }

  async run() {
    const { vaultWhitelist } = this;
    const vaultsDataResults = await Promise.all(
      vaultWhitelist.map((vault) => this.morphoClient.fetchVaultData(vault)),
    );

    // Filter out errors and log them
    const vaultsData = vaultsDataResults
      .filter((result) => {
        if (result.isErr()) {
          console.error(
            `Failed to fetch vault data on chain ${getChainName(this.chainId)}:`,
            result.error.message,
          );
          return false;
        }
        return true;
      })
      .map((result) => result._unsafeUnwrap());

    if (vaultsData.length === 0) {
      console.warn(`No vault data available on chain ${getChainName(this.chainId)}`);
      return;
    }

    await Promise.all(
      vaultsData.map(async (vaultData) => {
        const reallocationResult = await this.strategy.findReallocation(vaultData);

        // Handle error case - filter out errors

        if (reallocationResult.isErr()) {
          console.error(
            `Failed to find reallocation for vault ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}:`,
          );
          console.error(reallocationResult.error);
          return;
        }

        // Extract reallocation (safe after isErr() check)

        const reallocation = reallocationResult.value;

        if (!reallocation) {
          console.log(
            `No reallocation found on ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}`,
          );
          return;
        }

        console.log(`Reallocating on ${vaultData.vaultAddress}`);

        try {
          // Simulate transaction first to catch errors before sending
          const calldata = encodeFunctionData({
            abi: metaMorphoAbi,
            functionName: "reallocate",
            args: [reallocation],
          });

          await estimateGas(this.walletClient, {
            to: vaultData.vaultAddress,
            data: calldata,
          });

          // Execute transaction - use calldata directly to avoid type inference issues with writeContract
          const txHash = await sendTransaction(this.walletClient, {
            to: vaultData.vaultAddress,
            data: calldata,
          });

          console.log(
            `Transaction sent for ${vaultData.vaultAddress}, on chain ${getChainName(this.chainId)}, tx: ${txHash}`,
          );
          const receipt = await waitForTransactionReceipt(this.publicClient, {
            hash: txHash,
          });
          console.log(
            `Reallocated on ${vaultData.vaultAddress}, on chain ${getChainName(this.chainId)}, tx: ${txHash}, status: ${receipt.status}`,
          );
        } catch (err) {
          console.log(`Failed to reallocate on ${vaultData.vaultAddress}`);
          console.error("reallocation error", err);
        }
      }),
    );
  }
}
