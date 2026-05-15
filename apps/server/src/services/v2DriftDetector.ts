import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { readContract } from "viem/actions";

import { morphoBlueAbi } from "../../abis/MorphoBlue";
import { vaultV2Abi } from "../../abis/VaultV2";
import { chainConfigs } from "../config/config";
import { marketV1CapId } from "../contracts/MorphoV2Client";
import { type DatabaseClient } from "../database";

import { driftDetectedAlert, type SlackNotifier } from "./SlackNotifier";

/**
 * Diff between the bot's `vault_v2_markets` cache and on-chain state for
 * one V2 vault.
 *
 * Detected:
 *   - `adapterChanged`: on-chain `adapters(0)` differs from the DB row's
 *     `adapter_address` for any market of the vault.
 *   - `marketsToRemove`: markets currently in the DB whose on-chain
 *     `absoluteCap` is 0 (cap removed by the curator).
 *
 * NOT detected (would need an indexer or `IncreaseAbsoluteCap` event scan):
 *   - New markets that received a non-zero cap on-chain but aren't in the
 *     DB. Phase 1.5 picks this up once Morpho's blue-api indexes TAC, or
 *     via a self-hosted event scan.
 */
export interface VaultV2Diff {
  chainId: number;
  vaultAddress: Address;
  vaultName?: string;
  onChainAdapter: Address;
  dbAdapter: Address;
  adapterChanged: boolean;
  marketsToRemove: Hex[];
}

/**
 * Read on-chain state for every whitelisted V2 vault and compare against
 * the DB. Returns one entry per vault that has drift; vaults whose DB
 * cache matches on-chain are omitted from the result.
 *
 * Used by:
 *   - `apps/server/scripts/sync-v2-markets.ts` (operator CLI, dry-run +
 *     `--apply` modes).
 *   - Phase 1.5's periodic scheduler + HTTP `GET /chains/:chainId/v2-markets/diff`
 *     endpoint (will reuse this same function — no extraction needed
 *     when that PR lands).
 */
export async function diffV2Vaults(dbClient: DatabaseClient): Promise<VaultV2Diff[]> {
  const chainsResult = await dbClient.getAllChainConfigs();
  if (chainsResult.isErr()) {
    throw new Error(`Failed to load chains: ${chainsResult.error.message}`);
  }

  const diffs: VaultV2Diff[] = [];

  for (const chainCfg of chainsResult.value) {
    const v2Vaults = chainCfg.vaultWhitelist.filter((v) => v.vaultVersion === "V2");
    if (v2Vaults.length === 0) continue;

    const infraConfig = chainConfigs[chainCfg.chainId];
    if (!infraConfig) {
      console.warn(`[v2 drift] No infraConfig for chain ${String(chainCfg.chainId)}, skipping`);
      continue;
    }
    const rpcUrl =
      process.env[`RPC_URL_${String(chainCfg.chainId)}`] ??
      infraConfig.chain.rpcUrls.default.http[0];
    const publicClient = createPublicClient({ chain: infraConfig.chain, transport: http(rpcUrl) });

    const dbEntriesResult = await dbClient.getV2VaultMarkets(chainCfg.chainId);
    if (dbEntriesResult.isErr()) {
      console.error(
        `[v2 drift] Failed to load V2 markets for chain ${String(chainCfg.chainId)}:`,
        dbEntriesResult.error.message,
      );
      continue;
    }
    const dbEntries = dbEntriesResult.value;

    for (const vault of v2Vaults) {
      const dbEntry = dbEntries.find(
        (e) => e.vaultAddress.toLowerCase() === vault.address.toLowerCase(),
      );
      if (!dbEntry) {
        console.warn(
          `[v2 drift] [${String(chainCfg.chainId)}] ${vault.address} is V2 but has no rows in vault_v2_markets — skipping`,
        );
        continue;
      }

      const diff = await diffOneVault({
        client: publicClient,
        morphoAddress: infraConfig.morpho,
        chainId: chainCfg.chainId,
        vaultAddress: vault.address,
        vaultName: vault.name ?? vault.address,
        dbAdapter: dbEntry.adapterAddress,
        dbMarketIds: dbEntry.marketIds,
      });
      if (diff) diffs.push(diff);
    }
  }

  return diffs;
}

/**
 * Apply a list of `VaultV2Diff` to the DB:
 *   - For each diff with `adapterChanged`, bulk-update the vault's adapter.
 *   - For each `marketsToRemove[i]`, delete the corresponding row.
 *
 * Caller is responsible for any logging or alerting around the apply
 * (the function only returns counts of what it did).
 */
export async function applyV2Diffs(
  dbClient: DatabaseClient,
  diffs: VaultV2Diff[],
): Promise<{ adaptersUpdated: number; marketsRemoved: number; errors: string[] }> {
  let adaptersUpdated = 0;
  let marketsRemoved = 0;
  const errors: string[] = [];

  for (const d of diffs) {
    if (d.adapterChanged) {
      const r = await dbClient.updateV2VaultAdapter(d.chainId, d.vaultAddress, d.onChainAdapter);
      if (r.isErr()) errors.push(`adapter update for ${d.vaultAddress}: ${r.error.message}`);
      else adaptersUpdated++;
    }
    for (const marketId of d.marketsToRemove) {
      const r = await dbClient.removeV2VaultMarket(d.chainId, d.vaultAddress, marketId);
      if (r.isErr()) errors.push(`remove ${marketId} from ${d.vaultAddress}: ${r.error.message}`);
      else marketsRemoved++;
    }
  }

  return { adaptersUpdated, marketsRemoved, errors };
}

async function diffOneVault(args: {
  client: Client<Transport, Chain>;
  morphoAddress: Address;
  chainId: number;
  vaultAddress: Address;
  vaultName: string;
  dbAdapter: Address;
  dbMarketIds: Hex[];
}): Promise<VaultV2Diff | null> {
  const { client, morphoAddress, chainId, vaultAddress, vaultName, dbAdapter, dbMarketIds } = args;

  let onChainAdapter: Address;
  try {
    const length = await readContract(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
    });
    if (length === 0n) {
      console.warn(`[v2 drift] [${String(chainId)}] ${vaultAddress}: adaptersLength=0, skipping`);
      return null;
    }
    onChainAdapter = await readContract(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "adapters",
      args: [0n],
    });
  } catch (err) {
    console.error(`[v2 drift] [${String(chainId)}] ${vaultAddress}: failed to read adapter:`, err);
    return null;
  }

  const adapterChanged = onChainAdapter.toLowerCase() !== dbAdapter.toLowerCase();
  const marketsToRemove: Hex[] = [];

  for (const marketId of dbMarketIds) {
    try {
      const params = await readContract(client, {
        address: morphoAddress,
        abi: morphoBlueAbi,
        functionName: "idToMarketParams",
        args: [marketId],
      });
      const marketParams = {
        loanToken: params[0],
        collateralToken: params[1],
        oracle: params[2],
        irm: params[3],
        lltv: params[4],
      };
      const capId = marketV1CapId(marketParams, onChainAdapter);
      const cap = await readContract(client, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "absoluteCap",
        args: [capId],
      });
      if (cap === 0n) marketsToRemove.push(marketId);
    } catch (err) {
      console.error(
        `[v2 drift] [${String(chainId)}] ${vaultAddress}: cap read failed for ${marketId}:`,
        (err as Error).message.split("\n")[0] ?? "?",
      );
    }
  }

  if (!adapterChanged && marketsToRemove.length === 0) return null;

  return {
    chainId,
    vaultAddress,
    vaultName,
    onChainAdapter,
    dbAdapter,
    adapterChanged,
    marketsToRemove,
  };
}

// ---------------------------------------------------------------------------
// Drift alert dispatch — emits a structured JSON line and a Slack message.
// Called from `ReallocationBotV2` after `applyV2Diffs`. Severity flips to
// "critical" when the DB apply failed or when the adapter changed.
// ---------------------------------------------------------------------------

export interface DriftAlertPayload {
  chainId: number;
  vaultAddress: Address;
  /** What the diff would do — present whether or not the apply succeeded. */
  adapterUpdate?: { from: Address; to: Address };
  marketsRemoved: Hex[];
  /** Populated when the DB write failed; consumer should escalate severity. */
  applyErrors?: string[];
}

export function alertDriftDetected(slack: SlackNotifier, payload: DriftAlertPayload): void {
  const applyFailed = (payload.applyErrors?.length ?? 0) > 0;
  const severity = applyFailed || payload.adapterUpdate ? "critical" : "warning";
  console.log(
    JSON.stringify({
      evt: "v2_drift_alert",
      chainId: payload.chainId,
      vault: payload.vaultAddress,
      adapterUpdate: payload.adapterUpdate,
      marketsRemoved: payload.marketsRemoved,
      applyErrors: payload.applyErrors,
      severity,
    }),
  );
  void slack.send(driftDetectedAlert(payload));
}
