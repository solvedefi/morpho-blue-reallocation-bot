import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { sendTransaction, simulateContract, waitForTransactionReceipt } from "viem/actions";

import { vaultV2Abi } from "../../abis/VaultV2.js";
import { type Config } from "../config";
import { getChainName } from "../constants.js";
import { MorphoV2Client } from "../contracts/MorphoV2Client.js";
import { Reallocation, ReallocationAction, VaultV2Data } from "../contracts/typesV2";
import { type DatabaseClient } from "../database";
import { MinGasThresholds } from "../services/MinGasThresholds";
import { type SlackNotifier } from "../services/SlackNotifier";
import { alertDriftDetected, applyV2Diffs, type VaultV2Diff } from "../services/v2DriftDetector.js";
import { StrategyV2 } from "../strategies-v2/strategy.js";

import { emitReallocationEvent } from "./events";

/**
 * One V2 vault the bot manages on a chain. Each entry carries the adapter
 * address and the curated market list (from `vault_v2_markets` in the DB).
 */
export interface V2VaultEntry {
  vaultAddress: Address;
  adapterAddress: Address;
  marketIds: Hex[];
}

/**
 * V2 reallocation bot — sister of `ReallocationBot` (V1).
 *
 * For each whitelisted V2 vault: fetch state via `MorphoV2Client`, ask the
 * V2 strategy what to do, encode `deallocate(...)` + `allocate(...)` calls
 * and submit them as a single `VaultV2.multicall(bytes[])` tx.
 *
 * Stays close to our V1 pattern (split public/wallet clients,
 * `simulateContract` pre-flight for richer revert messages,
 * `waitForTransactionReceipt` for status logging) rather than the template's
 * combined client + `estimateGas` + fire-and-forget — both deliver the same
 * tx but the V1 pattern gives operators better diagnostics.
 *
 * Encoding order mirrors the upstream template:
 * `multicall([deallocate..., allocate...])` — deallocate first to free up
 * funds before allocating elsewhere.
 */
export class ReallocationBotV2 {
  private chainId: number;
  private publicClient: Client<Transport, Chain>;
  private walletClient: Client<Transport, Chain, Account>;
  private vaultEntries: V2VaultEntry[];
  private strategy: StrategyV2;
  private morphoV2Client: MorphoV2Client;
  private dbClient: DatabaseClient;
  private slack: SlackNotifier;
  private thresholds: MinGasThresholds;

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultEntries: V2VaultEntry[],
    strategy: StrategyV2,
    config: Config,
    dbClient: DatabaseClient,
    slack: SlackNotifier,
    thresholds: MinGasThresholds,
  ) {
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultEntries = vaultEntries;
    this.strategy = strategy;
    this.morphoV2Client = new MorphoV2Client(publicClient, config);
    this.dbClient = dbClient;
    this.slack = slack;
    this.thresholds = thresholds;
  }

  updateStrategy(strategy: StrategyV2) {
    this.strategy = strategy;
    console.log(`V2 strategy updated for bot on chain ${getChainName(this.chainId)}`);
  }

  async run() {
    const chainName = getChainName(this.chainId);

    const pairs = await Promise.all(
      this.vaultEntries.map(async (entry) => {
        const result = await this.morphoV2Client.fetchVaultData(
          entry.vaultAddress,
          entry.adapterAddress,
          entry.marketIds,
        );
        if (result.isErr()) {
          console.error(
            `Failed to fetch V2 vault data for ${entry.vaultAddress} on chain ${chainName}:`,
            result.error.message,
          );
          return null;
        }
        return { entry, vaultData: result.value };
      }),
    );

    const validPairs = pairs.filter(
      (p): p is { entry: V2VaultEntry; vaultData: VaultV2Data } => p !== null,
    );
    if (validPairs.length === 0) {
      console.warn(`No V2 vault data available on chain ${chainName}`);
      return;
    }

    await Promise.all(
      validPairs.map(async ({ entry, vaultData }) => {
        // Pre-flight drift check against the DB cache, using data already
        // fetched in the multicall above (zero extra RPC). On drift we
        // persist first, then mutate in-memory only if the DB write
        // succeeded — otherwise the next bot restart would reload the
        // pre-drift state from DB and we'd silently revert the fix.
        const drift = detectDrift(this.chainId, entry, vaultData);
        if (drift) {
          const applyResult = await applyV2Diffs(this.dbClient, [drift]);
          const applySucceeded = applyResult.errors.length === 0;

          if (applySucceeded) {
            if (drift.adapterChanged) entry.adapterAddress = drift.onChainAdapter;
            if (drift.marketsToRemove.length > 0) {
              const toRemove = new Set(drift.marketsToRemove.map((m) => m.toLowerCase()));
              entry.marketIds = entry.marketIds.filter((m) => !toRemove.has(m.toLowerCase()));
            }
          } else {
            console.error(
              `V2 drift apply errors on ${entry.vaultAddress}:`,
              applyResult.errors.join("; "),
            );
          }

          alertDriftDetected(this.slack, {
            chainId: this.chainId,
            vaultAddress: entry.vaultAddress,
            adapterUpdate: drift.adapterChanged
              ? { from: drift.dbAdapter, to: drift.onChainAdapter }
              : undefined,
            marketsRemoved: drift.marketsToRemove,
            applyErrors: applySucceeded ? undefined : applyResult.errors,
          });

          emitReallocationEvent({
            chainId: this.chainId,
            version: "V2",
            vault: entry.vaultAddress,
            status: "skipped",
            reason: applySucceeded
              ? drift.adapterChanged
                ? "adapter_drift"
                : "cap_drift"
              : "drift_apply_failed",
          });
          return;
        }

        const reallocationResult = this.strategy.findReallocation(vaultData);

        if (reallocationResult.isErr()) {
          console.error(
            `Failed to find V2 reallocation for vault ${vaultData.vaultAddress} on chain ${chainName}:`,
            reallocationResult.error,
          );
          emitReallocationEvent({
            chainId: this.chainId,
            version: "V2",
            vault: vaultData.vaultAddress,
            status: "skipped",
            reason: "strategy_error",
            error: reallocationResult.error.message,
          });
          return;
        }

        const reallocation = reallocationResult.value;
        if (!reallocation) {
          console.log(
            `No V2 reallocation found on ${vaultData.vaultAddress} on chain ${chainName}`,
          );
          emitReallocationEvent({
            chainId: this.chainId,
            version: "V2",
            vault: vaultData.vaultAddress,
            status: "skipped",
            reason: "in_range_or_below_threshold",
          });
          return;
        }

        const calls = encodeReallocation(reallocation);
        console.log(
          `V2 reallocating on ${vaultData.vaultAddress} on chain ${chainName} — ${String(reallocation.deallocations.length)} deallocate(s) + ${String(reallocation.allocations.length)} allocate(s)`,
        );

        try {
          await simulateContract(this.publicClient, {
            address: vaultData.vaultAddress,
            abi: vaultV2Abi,
            functionName: "multicall",
            args: [calls],
            account: this.walletClient.account,
          });

          console.log(
            `V2 simulation successful for ${vaultData.vaultAddress}, executing transaction...`,
          );

          const txHash = await sendTransaction(this.walletClient, {
            to: vaultData.vaultAddress,
            data: encodeFunctionData({
              abi: vaultV2Abi,
              functionName: "multicall",
              args: [calls],
            }),
          });

          console.log(
            `V2 tx sent for ${vaultData.vaultAddress} on chain ${chainName}, tx: ${txHash}`,
          );
          const receipt = await waitForTransactionReceipt(this.publicClient, { hash: txHash });
          console.log(
            `V2 reallocated on ${vaultData.vaultAddress} on chain ${chainName}, tx: ${txHash}, status: ${receipt.status}`,
          );

          if (receipt.status === "success") {
            this.thresholds.record(this.chainId, receipt.gasUsed, receipt.effectiveGasPrice);
          }

          emitReallocationEvent({
            chainId: this.chainId,
            version: "V2",
            vault: vaultData.vaultAddress,
            status: receipt.status === "success" ? "executed" : "reverted",
            allocationsCount: reallocation.allocations.length,
            deallocationsCount: reallocation.deallocations.length,
            txHash,
          });
        } catch (err) {
          console.error(`V2 reallocation failed on ${vaultData.vaultAddress}`);
          if (err instanceof Error && err.message.includes("NotAllocator")) {
            console.error("Hint: the EOA does not have the allocator role on this V2 vault");
          }
          console.error("V2 reallocation error:", err);
          emitReallocationEvent({
            chainId: this.chainId,
            version: "V2",
            vault: vaultData.vaultAddress,
            status: "failed",
            allocationsCount: reallocation.allocations.length,
            deallocationsCount: reallocation.deallocations.length,
            error: err instanceof Error ? err.message.split("\n")[0] : String(err),
          });
        }
      }),
    );
  }
}

/**
 * Encode a `Reallocation` into the `bytes[]` payload of `VaultV2.multicall`.
 * Order: deallocations first (free up funds), then allocations. Mirrors the
 * upstream template's `encodeReallocation`.
 */
function encodeReallocation(reallocation: Reallocation): Hex[] {
  return [
    ...reallocation.deallocations.map(encodeDeallocation),
    ...reallocation.allocations.map(encodeAllocation),
  ];
}

function encodeAllocation(action: ReallocationAction): Hex {
  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName: "allocate",
    args: [action.adapterAddress, action.data, action.assets],
  });
}

function encodeDeallocation(action: ReallocationAction): Hex {
  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName: "deallocate",
    args: [action.adapterAddress, action.data, action.assets],
  });
}

/**
 * Compare the data we just fetched against the DB-cached entry. Returns a
 * `VaultV2Diff` if drift is present, or `null` if everything matches.
 *
 * Built from data already in hand (no RPC). Two drift kinds are detected:
 *   - adapter swap: `onChainAdapter` differs from `entry.adapterAddress`
 *   - cap removal: any market with `caps.absolute === 0n` was previously
 *     in the DB list but has had its on-chain cap zeroed by the curator
 *
 * Reuses the `VaultV2Diff` shape from `services/v2DriftDetector.ts` so the
 * same `applyV2Diffs` function persists the result.
 */
function detectDrift(
  chainId: number,
  entry: V2VaultEntry,
  vaultData: VaultV2Data,
): VaultV2Diff | null {
  // Single-adapter assumption: `vaultData.onChainAdapter` is `adapters(0)`.
  // Re7's V2 vaults run a single MorphoMarketV1AdapterV2; if Re7 ever adds
  // a second adapter we need to compare against adapters[1..] too and
  // partition `marketsV1Data.markets` by adapter.
  const adapterChanged =
    vaultData.onChainAdapter.toLowerCase() !== entry.adapterAddress.toLowerCase();

  const marketsToRemove: Hex[] = vaultData.marketsV1Data.markets
    .filter((m) => m.caps.absolute === 0n)
    .map((m) => m.id);

  if (!adapterChanged && marketsToRemove.length === 0) return null;

  return {
    chainId,
    vaultAddress: entry.vaultAddress,
    onChainAdapter: vaultData.onChainAdapter,
    dbAdapter: entry.adapterAddress,
    adapterChanged,
    marketsToRemove,
  };
}
