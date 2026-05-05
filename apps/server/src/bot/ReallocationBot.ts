import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import {
  getBalance,
  getGasPrice,
  sendTransaction,
  simulateContract,
  waitForTransactionReceipt,
} from "viem/actions";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { type Config } from "../config";
import { getChainName, getNativeSymbol } from "../constants.js";
import { MorphoClient } from "../contracts/MorphoClient.js";
import { type DatabaseClient } from "../database";
import { type GasSample, avgGasUsed, txsRemaining } from "../services/GasMonitor";
import { lowBalancePreTxAlert, type SlackNotifier } from "../services/SlackNotifier";
import { Strategy } from "../strategies/strategy.js";

const PRE_TX_RECENT_SAMPLES = 20;
// Recommended balance is `estimatedTxCost × 1.5` — encoded as a 15/10 ratio
// so we can compute it in bigint without losing precision.
const SAFETY_FACTOR_NUM = 15n;
const SAFETY_FACTOR_DEN = 10n;
const applySafetyFactor = (cost: bigint) => (cost * SAFETY_FACTOR_NUM) / SAFETY_FACTOR_DEN;

export class ReallocationBot {
  private chainId: number;
  private publicClient: Client<Transport, Chain>;
  private walletClient: Client<Transport, Chain, Account>;
  private vaultWhitelist: Address[];
  private strategy: Strategy;
  private morphoClient: MorphoClient;
  private config: Config;
  private dbClient: DatabaseClient;
  private slack: SlackNotifier;

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    config: Config,
    dbClient: DatabaseClient,
    slack: SlackNotifier,
  ) {
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoClient = new MorphoClient(publicClient, config);
    this.config = config;
    this.dbClient = dbClient;
    this.slack = slack;
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
          console.log(
            `Simulating reallocation for ${vaultData.vaultAddress} on chain ${getChainName(this.chainId)}...`,
          );

          // Fire-and-forget: alert if balance is below the safety cushion,
          // but never block the reallocation attempt.
          void this.alertIfLowBalance();

          await simulateContract(this.publicClient, {
            address: vaultData.vaultAddress,
            abi: metaMorphoAbi,
            functionName: "reallocate",
            // Type assertion needed due to viem's strict readonly type inference from ABI
            args: [reallocation] as unknown as readonly [
              readonly {
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
            account: this.walletClient.account,
          });

          console.log(
            `Simulation successful for ${vaultData.vaultAddress}, executing transaction...`,
          );

          // Execute transaction
          const calldata = encodeFunctionData({
            abi: metaMorphoAbi,
            functionName: "reallocate",
            // Type assertion needed due to viem's strict readonly type inference from ABI
            args: [reallocation] as unknown as readonly [
              readonly {
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

          const logResult = await this.dbClient.recordTxGasUsage(
            this.chainId,
            txHash,
            receipt.gasUsed,
            receipt.effectiveGasPrice,
            receipt.blockNumber,
          );
          if (logResult.isErr()) {
            console.error("Failed to record tx gas usage:", logResult.error.message);
          }
        } catch (err) {
          console.error(`Failed to reallocate on ${vaultData.vaultAddress}`);

          if (err instanceof Error) {
            const errorMessage = err.message;

            // Log specific Morpho contract errors
            if (errorMessage.includes("NotAllocatorRole")) {
              console.error("Error: The account is not an allocator for this vault");
            } else if (errorMessage.includes("InconsistentReallocation")) {
              console.error(
                "Error: Reallocation amounts are inconsistent (withdrawals != deposits)",
              );
            } else if (errorMessage.includes("NotEnoughLiquidity")) {
              console.error("Error: Not enough liquidity in one of the markets");
            } else if (errorMessage.includes("MarketNotEnabled")) {
              console.error("Error: One of the markets is not enabled for this vault");
            } else if (errorMessage.includes("SupplyCapExceeded")) {
              console.error("Error: Supply cap would be exceeded");
            }
          }

          console.error("Reallocation error:", err);
        }
      }),
    );
  }

  private async alertIfLowBalance(): Promise<void> {
    const account = this.walletClient.account.address;
    const chainName = getChainName(this.chainId);

    let balance: bigint;
    let gasPrice: bigint;
    try {
      [balance, gasPrice] = await Promise.all([
        getBalance(this.publicClient, { address: account }),
        getGasPrice(this.publicClient),
      ]);
    } catch (err) {
      console.error(`Pre-tx balance check failed on ${chainName}:`, err);
      return;
    }

    const samplesResult = await this.dbClient.getRecentGasSamples(
      this.chainId,
      PRE_TX_RECENT_SAMPLES,
    );
    const samples: GasSample[] = samplesResult.isOk() ? samplesResult.value : [];
    const avg = avgGasUsed(samples);
    const required = applySafetyFactor(avg * gasPrice);

    if (balance >= required) return;

    const txsLeft = txsRemaining(balance, samples, gasPrice);
    const message = lowBalancePreTxAlert({
      chainName,
      chainId: this.chainId,
      account,
      nativeSymbol: getNativeSymbol(this.chainId),
      balance,
      requiredWei: required,
      gasPrice,
      avgGasUsed: avg,
      sampleCount: samples.length,
      txsLeft,
    });
    await this.slack.send(message);
  }
}
