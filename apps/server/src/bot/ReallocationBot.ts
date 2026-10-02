import {
  encodeFunctionData,
  zeroAddress,
  type Account,
  type Hex,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { sendTransaction, simulateContract, waitForTransactionReceipt } from "viem/actions";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { type Config } from "../config";
import { getChainName } from "../constants.js";
import { MorphoClient } from "../contracts/MorphoClient.js";
import { MinGasThresholds } from "../services/MinGasThresholds";
import { Strategy } from "../strategies/strategy.js";
import { freeMarketLiquidity } from "../utils/marketLiquidity";
import { VaultData } from "../utils/types";

import { isVaultHalted } from "./emergencyHalt";
import { planEmergencyWithdraw } from "./emergencyWithdraw";
import { isLiquiditySimulationFailure } from "./liquidityErrors";
import { toReallocateArgs } from "./reallocateArgs";
import { loadRetryPolicyFromEnv, sleepSeconds } from "./retryPolicy";
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

  /**
   * Pull everything possible from `marketId` into the vault's idle market, retrying
   * until the market's free liquidity is exhausted (~100% utilization) or attempts run out.
   */
  async emergencyWithdrawToIdle(vaultAddress: Address, marketId: Hex, maxAttempts: number) {
    const tag = `[EMERGENCY] chain=${getChainName(this.chainId)} vault=${vaultAddress} market=${marketId}`;
    console.log(`${tag} waiting for vault lock`);
    return withVaultRunLock(vaultAddress, async () => {
      console.log(`${tag} lock acquired, starting (maxAttempts=${String(maxAttempts)})`);
      const txs: Hex[] = [];
      const errors: string[] = [];

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const at = `${tag} attempt ${String(attempt)}/${String(maxAttempts)}`;
        const vaultResult = await this.morphoClient.fetchVaultData(vaultAddress);
        if (vaultResult.isErr()) {
          console.error(`${at}: failed to fetch vault data:`, vaultResult.error.message);
          errors.push(`attempt ${String(attempt)}: ${vaultResult.error.message}`);
          await sleepSeconds(this.retryPolicy.retryDelaySeconds);
          continue;
        }
        const markets = [...vaultResult.value.marketsData.values()];
        const market = markets.find((m) => m.id.toLowerCase() === marketId.toLowerCase());
        const idle = markets.find((m) => m.params.collateralToken === zeroAddress);
        if (!market) {
          console.error(`${at}: market is not in the vault's withdraw queue`);
          throw new Error(`Market ${marketId} is not in vault ${vaultAddress}`);
        }
        if (!idle) {
          console.error(`${at}: vault has no idle market`);
          throw new Error(`Vault ${vaultAddress} has no idle market`);
        }

        const { totalSupplyAssets, totalBorrowAssets } = market.state;
        const utilization =
          totalSupplyAssets === 0n
            ? 1
            : Number((totalBorrowAssets * 10_000n) / totalSupplyAssets) / 10_000;
        const idleRoom = idle.cap > idle.vaultAssets ? idle.cap - idle.vaultAssets : 0n;
        console.log(
          `${at}: utilization=${(utilization * 100).toFixed(2)}% freeLiquidity=${String(freeMarketLiquidity(market.state))} vaultAssets=${String(market.vaultAssets)} idleRoom=${String(idleRoom)}`,
        );

        const allocations = planEmergencyWithdraw(market, idle);
        if (!allocations) {
          console.log(
            `${at}: DONE, nothing more to pull (txs=${String(txs.length)}, errors=${String(errors.length)})`,
          );
          if (idleRoom === 0n && market.vaultAssets > 0n) {
            console.warn(`${at}: stopped because idle market cap is full`);
          }
          return {
            done: true,
            attempts: attempt,
            txs,
            errors,
            vaultAssetsLeft: market.vaultAssets.toString(),
            freeLiquidity: freeMarketLiquidity(market.state).toString(),
            utilization,
            idleRoom: idleRoom.toString(),
          };
        }

        const target = allocations[0]?.assets ?? 0n;
        console.log(
          `${at}: plan target=${String(target)} (${target === 0n ? "full exit" : `withdraw ${String(market.vaultAssets - target)}`}), simulating...`,
        );

        try {
          const args = toReallocateArgs(allocations);
          await simulateContract(this.publicClient, {
            address: vaultAddress,
            abi: metaMorphoAbi,
            functionName: "reallocate",
            args,
            account: this.walletClient.account,
          });
          const txHash = await sendTransaction(this.walletClient, {
            to: vaultAddress,
            data: encodeFunctionData({ abi: metaMorphoAbi, functionName: "reallocate", args }),
          });
          txs.push(txHash);
          console.log(`${at}: tx sent ${txHash}, waiting for receipt...`);
          const receipt = await waitForTransactionReceipt(this.publicClient, { hash: txHash });
          console.log(
            `${at}: tx ${txHash} ${receipt.status} (block ${String(receipt.blockNumber)}, gasUsed ${String(receipt.gasUsed)})`,
          );
          if (receipt.status === "success") {
            this.thresholds.record(this.chainId, receipt.gasUsed, receipt.effectiveGasPrice);
            continue; // re-read immediately: borrowers may have repaid, freeing more
          }
          console.error(`${at}: tx ${txHash} reverted`);
          errors.push(`attempt ${String(attempt)}: tx ${txHash} reverted`);
        } catch (err) {
          const msg =
            err instanceof Error
              ? ((err as { shortMessage?: string }).shortMessage ?? err.message)
              : String(err);
          console.error(`${at}: failed: ${msg}`, err);
          errors.push(`attempt ${String(attempt)}: ${msg}`);
        }
        await sleepSeconds(this.retryPolicy.retryDelaySeconds);
      }

      console.error(
        `${tag} GAVE UP after ${String(maxAttempts)} attempts (txs=${String(txs.length)}): ${errors.join(" | ")}`,
      );
      return { done: false, attempts: maxAttempts, txs, errors };
    });
  }

  private async reallocateVault(vaultData: VaultData) {
    if (isVaultHalted(this.chainId, vaultData.vaultAddress)) {
      console.warn(
        `[EMERGENCY] skipping regular reallocation of halted vault ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}`,
      );
      return;
    }

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
