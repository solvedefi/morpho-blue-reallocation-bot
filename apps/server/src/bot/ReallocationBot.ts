import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { sendTransaction, waitForTransactionReceipt } from "viem/actions";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { type Config } from "../config";
import { getChainName } from "../constants.js";
import { MorphoClient } from "../contracts/MorphoClient.js";
import { MinGasThresholds } from "../services/MinGasThresholds";
import { Strategy } from "../strategies/strategy.js";
import { VaultData } from "../utils/types";

import { isLiquiditySimulationFailure } from "./liquidityErrors";
import { toReallocateArgs } from "./reallocateArgs";
import { loadRetryPolicyFromEnv } from "./retryPolicy";
import { simulateReallocateWithRetry } from "./simulateWithRetry";
import { withVaultRunLock } from "./vaultRunLock";

export class ReallocationBot {
  private chainId: number;
  private publicClient: Client<Transport, Chain>;
  private walletClient: Client<Transport, Chain, Account>;
  private vaultWhitelist: Address[];
  private strategy: Strategy;
  private morphoClient: MorphoClient;
  private config: Config;
  private thresholds: MinGasThresholds;
  private retryPolicy = loadRetryPolicyFromEnv();

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    config: Config,
    thresholds: MinGasThresholds,
  ) {
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoClient = new MorphoClient(publicClient, config);
    this.config = config;
    this.thresholds = thresholds;
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
      vaultsData.map((vaultData) =>
        withVaultRunLock(vaultData.vaultAddress, () => this.reallocateVault(vaultData)),
      ),
    );
  }

  private async reallocateVault(vaultData: VaultData) {
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

    const initialReallocation = reallocationResult.value;

    if (!initialReallocation) {
      console.log(
        `No reallocation found on ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}`,
      );
      return;
    }

    console.log(`Reallocating on ${vaultData.vaultAddress}`);

    try {
      // Simulate transaction first to catch errors before sending
      console.log(
        `Simulating reallocation for ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}...`,
      );

      const simulation = await simulateReallocateWithRetry(
        this.publicClient,
        vaultData.vaultAddress,
        this.walletClient.account,
        initialReallocation,
        vaultData,
        this.retryPolicy,
      );

      if (!simulation) {
        console.error(`Simulation failed for ${vaultData.vaultAddress} after all retry attempts`);
        return;
      }

      const { allocations: reallocation, attempt } = simulation;
      if (attempt > 1) {
        console.log(
          `Simulation succeeded for ${vaultData.vaultAddress} on attempt ${String(attempt)}/${String(this.retryPolicy.maxAttempts)}`,
        );
      } else {
        console.log(
          `Simulation successful for ${vaultData.vaultAddress}, executing transaction...`,
        );
      }

      // Execute transaction
      const calldata = encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "reallocate",
        // Type assertion needed due to viem's strict readonly type inference from ABI
        args: toReallocateArgs(reallocation),
      });

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

      if (receipt.status === "success") {
        this.thresholds.record(this.chainId, receipt.gasUsed, receipt.effectiveGasPrice);
      }
    } catch (err) {
      console.error(`Failed to reallocate on ${vaultData.vaultAddress}`);

      if (err instanceof Error) {
        const errorMessage = err.message;

        // Log specific Morpho contract errors
        if (errorMessage.includes("NotAllocatorRole")) {
          console.error("Error: The account is not an allocator for this vault");
        } else if (errorMessage.includes("InconsistentReallocation")) {
          console.error("Error: Reallocation amounts are inconsistent (withdrawals != deposits)");
        } else if (isLiquiditySimulationFailure(err)) {
          console.error("Error: Not enough liquidity in one of the markets after retries");
        } else if (errorMessage.includes("MarketNotEnabled")) {
          console.error("Error: One of the markets is not enabled for this vault");
        } else if (errorMessage.includes("SupplyCapExceeded")) {
          console.error("Error: Supply cap would be exceeded");
        }
      }

      console.error("Reallocation error:", err);
    }
  }
}
