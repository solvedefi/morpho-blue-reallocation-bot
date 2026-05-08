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
import { Reallocation, ReallocationAction } from "../contracts/typesV2";
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

  constructor(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    walletClient: Client<Transport, Chain, Account>,
    vaultEntries: V2VaultEntry[],
    strategy: StrategyV2,
    config: Config,
  ) {
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultEntries = vaultEntries;
    this.strategy = strategy;
    this.morphoV2Client = new MorphoV2Client(publicClient, config);
  }

  updateStrategy(strategy: StrategyV2) {
    this.strategy = strategy;
    console.log(`V2 strategy updated for bot on chain ${getChainName(this.chainId)}`);
  }

  async run() {
    const chainName = getChainName(this.chainId);

    const vaultsData = await Promise.all(
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
        return result.value;
      }),
    );

    const validVaultsData = vaultsData.filter((v) => v !== null);
    if (validVaultsData.length === 0) {
      console.warn(`No V2 vault data available on chain ${chainName}`);
      return;
    }

    await Promise.all(
      validVaultsData.map(async (vaultData) => {
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
