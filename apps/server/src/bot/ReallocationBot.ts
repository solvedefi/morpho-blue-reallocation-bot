import type { Logger } from "pino";
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

import { type Config } from "../config";
import { getChainName } from "../constants.js";
import { MorphoClient } from "../contracts/MorphoClient.js";
import { logger } from "../logger";
import { MinGasThresholds } from "../services/MinGasThresholds";
import { Strategy } from "../strategies/strategy.js";
import { freeMarketLiquidity, marketsSnapshot } from "../utils/marketLiquidity";
import { VaultData } from "../utils/types";
import { type MorphoVaultType } from "../utils/vaultsCsv";

import { isVaultHalted } from "./emergencyHalt";
import { planEmergencyWithdraw } from "./emergencyWithdraw";
import { isLiquiditySimulationFailure } from "./liquidityErrors";
import { reallocateCall } from "./reallocateArgs";
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
  private log: Logger;
  private v2Vaults: Set<string>;

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    config: Config,
    thresholds: MinGasThresholds,
    v2Vaults: Address[] = [],
  ) {
    this.v2Vaults = new Set(v2Vaults.map((v) => v.toLowerCase()));
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoClient = new MorphoClient(publicClient, config);
    this.config = config;
    this.thresholds = thresholds;
    this.log = logger.child({ chainId, chain: getChainName(chainId) });
  }

  /**
   * Update the bot's strategy with new configuration
   */
  updateStrategy(strategy: Strategy) {
    this.strategy = strategy;
    this.log.info("Strategy updated");
  }

  async run() {
    const { vaultWhitelist } = this;
    const vaultsDataResults = await Promise.all(
      vaultWhitelist.map((vault) =>
        this.fetchVaultData(
          vault,
          this.v2Vaults.has(vault.toLowerCase()) ? "morpho-v2" : "morpho-v1",
        ),
      ),
    );

    // Filter out errors and log them
    const vaultsData = vaultsDataResults
      .filter((result) => {
        if (result.isErr()) {
          this.log.error({ err: result.error }, "Failed to fetch vault data");
          return false;
        }
        return true;
      })
      .map((result) => result._unsafeUnwrap());

    if (vaultsData.length === 0) {
      this.log.warn("No vault data available");
      return;
    }

    await Promise.all(
      vaultsData.map((vaultData) =>
        withVaultRunLock(vaultData.vaultAddress, () => this.reallocateVault(vaultData)),
      ),
    );
  }

  private fetchVaultData(vault: Address, vaultType: MorphoVaultType) {
    return vaultType === "morpho-v2"
      ? this.morphoClient.fetchVaultV2Data(vault)
      : this.morphoClient.fetchVaultData(vault);
  }

  /**
   * Pull everything possible from `marketId` into the vault's idle market, retrying
   * until the market's free liquidity is exhausted (~100% utilization) or attempts run out.
   */
  async emergencyWithdrawToIdle(
    vaultAddress: Address,
    marketId: Hex,
    maxAttempts: number,
    vaultType: MorphoVaultType = "morpho-v1",
  ) {
    const log = this.log.child({ evt: "emergency_withdraw", vault: vaultAddress, marketId });
    log.info("Waiting for vault lock");
    return withVaultRunLock(vaultAddress, async () => {
      log.info({ maxAttempts }, "Lock acquired, starting");
      const txs: Hex[] = [];
      const errors: string[] = [];

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const at = log.child({ attempt, maxAttempts });
        const vaultResult = await this.fetchVaultData(vaultAddress, vaultType);
        if (vaultResult.isErr()) {
          at.error({ err: vaultResult.error }, "Failed to fetch vault data");
          errors.push(`attempt ${String(attempt)}: ${vaultResult.error.message}`);
          await sleepSeconds(this.retryPolicy.retryDelaySeconds);
          continue;
        }
        const markets = [...vaultResult.value.marketsData.values()];
        const market = markets.find((m) => m.id.toLowerCase() === marketId.toLowerCase());
        const idle = markets.find((m) => m.params.collateralToken === zeroAddress);
        if (!market) {
          at.error("Market is not in the vault's withdraw queue");
          throw new Error(`Market ${marketId} is not in vault ${vaultAddress}`);
        }
        if (!idle) {
          at.error("Vault has no idle market");
          throw new Error(`Vault ${vaultAddress} has no idle market`);
        }

        const { totalSupplyAssets, totalBorrowAssets } = market.state;
        const utilization =
          totalSupplyAssets === 0n
            ? 1
            : Number((totalBorrowAssets * 10_000n) / totalSupplyAssets) / 10_000;
        const idleRoom = idle.cap > idle.vaultAssets ? idle.cap - idle.vaultAssets : 0n;
        at.info(
          {
            utilization,
            freeLiquidity: String(freeMarketLiquidity(market.state)),
            vaultAssets: String(market.vaultAssets),
            idleRoom: String(idleRoom),
          },
          "Market state",
        );

        const allocations = planEmergencyWithdraw(market, idle);
        if (!allocations) {
          at.info({ txs, errors: errors.length }, "Done, nothing more to pull");
          if (idleRoom === 0n && market.vaultAssets > 0n) {
            at.warn("Stopped because idle market cap is full");
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
        at.info(
          { target: String(target), withdraw: String(market.vaultAssets - target) },
          "Planned, simulating",
        );

        try {
          const call = reallocateCall(vaultResult.value, allocations);
          await simulateContract(this.publicClient, {
            ...call,
            address: vaultAddress,
            account: this.walletClient.account,
          } as Parameters<typeof simulateContract>[1]);
          const txHash = await sendTransaction(this.walletClient, {
            to: vaultAddress,
            data: encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]),
          });
          txs.push(txHash);
          at.info({ txHash }, "Tx sent, waiting for receipt");
          const receipt = await waitForTransactionReceipt(this.publicClient, { hash: txHash });
          at.info(
            {
              txHash,
              status: receipt.status,
              block: String(receipt.blockNumber),
              gasUsed: String(receipt.gasUsed),
            },
            "Tx mined",
          );
          if (receipt.status === "success") {
            this.thresholds.record(this.chainId, receipt.gasUsed, receipt.effectiveGasPrice);
            continue; // re-read immediately: borrowers may have repaid, freeing more
          }
          at.error({ txHash }, "Tx reverted");
          errors.push(`attempt ${String(attempt)}: tx ${txHash} reverted`);
        } catch (err) {
          const msg =
            err instanceof Error
              ? ((err as { shortMessage?: string }).shortMessage ?? err.message)
              : String(err);
          at.error({ err }, msg);
          errors.push(`attempt ${String(attempt)}: ${msg}`);
        }
        await sleepSeconds(this.retryPolicy.retryDelaySeconds);
      }

      log.error({ maxAttempts, txs, errors }, "Gave up");
      return { done: false, attempts: maxAttempts, txs, errors };
    });
  }

  private async reallocateVault(vaultData: VaultData) {
    const log = this.log.child({ vault: vaultData.vaultAddress });
    if (isVaultHalted(this.chainId, vaultData.vaultAddress)) {
      log.warn("Skipping regular reallocation of halted vault");
      return;
    }

    const reallocationResult = await this.strategy.findReallocation(vaultData);

    // Handle error case - filter out errors

    if (reallocationResult.isErr()) {
      log.error(
        { err: reallocationResult.error, markets: marketsSnapshot(vaultData) },
        "Failed to find reallocation",
      );
      return;
    }

    // Extract reallocation (safe after isErr() check)

    const initialReallocation = reallocationResult.value;

    if (!initialReallocation) {
      log.info("No reallocation found");
      return;
    }

    try {
      // Simulate transaction first to catch errors before sending
      log.info("Reallocation found, simulating");

      const simulation = await simulateReallocateWithRetry(
        this.publicClient,
        vaultData.vaultAddress,
        this.walletClient.account,
        initialReallocation,
        vaultData,
        this.retryPolicy,
      );

      if (!simulation) {
        log.error(
          { markets: marketsSnapshot(vaultData, initialReallocation) },
          "Simulation failed after all retry attempts",
        );
        return;
      }

      const { allocations: reallocation, attempt } = simulation;
      log.info({ attempt, maxAttempts: this.retryPolicy.maxAttempts }, "Simulation succeeded");

      const call = reallocateCall(vaultData, reallocation);
      if (call.functionName === "multicall" && call.args[0].length === 0) {
        log.info("Reallocation only moves idle funds on a v2 vault, nothing to send");
        return;
      }

      // Execute transaction
      const calldata = encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]);

      const txHash = await sendTransaction(this.walletClient, {
        to: vaultData.vaultAddress,
        data: calldata,
      });

      log.info({ txHash }, "Tx sent");
      const receipt = await waitForTransactionReceipt(this.publicClient, {
        hash: txHash,
      });
      log.info({ evt: "reallocated", txHash, status: receipt.status }, "Reallocated");
      if (receipt.status !== "success") {
        log.error(
          { txHash, markets: marketsSnapshot(vaultData, reallocation) },
          "Reallocation tx reverted",
        );
      }

      if (receipt.status === "success") {
        this.thresholds.record(this.chainId, receipt.gasUsed, receipt.effectiveGasPrice);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      let reason: string | undefined;
      // Name known Morpho contract errors
      if (message.includes("NotAllocatorRole") || message.includes("Unauthorized")) {
        reason = "The account is not an allocator for this vault";
      } else if (message.includes("InconsistentReallocation")) {
        reason = "Reallocation amounts are inconsistent (withdrawals != deposits)";
      } else if (isLiquiditySimulationFailure(err)) {
        reason = "Not enough liquidity in one of the markets after retries";
      } else if (message.includes("MarketNotEnabled")) {
        reason = "One of the markets is not enabled for this vault";
      } else if (
        message.includes("SupplyCapExceeded") ||
        message.includes("AbsoluteCapExceeded") ||
        message.includes("RelativeCapExceeded")
      ) {
        reason = "Supply cap would be exceeded";
      }
      // targets are the strategy's plan; a retry may have sent a more conservative one
      log.error(
        { err, reason, markets: marketsSnapshot(vaultData, initialReallocation) },
        "Failed to reallocate",
      );
    }
  }
}
