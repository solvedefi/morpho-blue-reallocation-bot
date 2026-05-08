/**
 * V2 vault market sync — manual operator stopgap until Phase 1.5 ships the
 * proper drift-detector endpoint.
 *
 * For each V2 vault in `vault_whitelist` (across all enabled chains):
 *  1. Read the current adapter on-chain (`VaultV2.adapters(0)`).
 *  2. For each market currently in `vault_v2_markets` for the vault:
 *     - Read `MorphoBlue.idToMarketParams(marketId)` to get the params.
 *     - Compute `marketV1CapId(params, on-chain adapter)`.
 *     - Read `VaultV2.absoluteCap(capId)`.
 *     - If cap is 0, flag the row for removal.
 *  3. If the on-chain adapter differs from the DB-stored adapter, flag a
 *     bulk adapter update.
 *  4. Print the diff. With `--apply`, execute the deletes + adapter updates
 *     atomically per vault.
 *
 * What this script does NOT detect (deferred to Phase 1.5):
 *  - **New** markets that got a non-zero cap on-chain but aren't in the DB.
 *    Detecting those without a candidate-universe config requires either an
 *    indexer or an event scan (Morpho's blue-api doesn't index TAC yet).
 *
 * Usage (from apps/server):
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/sync-v2-markets.ts          # dry run
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/sync-v2-markets.ts --apply  # execute
 */
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

import { morphoBlueAbi } from "../abis/MorphoBlue";
import { vaultV2Abi } from "../abis/VaultV2";
import { chainConfigs } from "../src/config/config";
import { marketV1CapId } from "../src/contracts/MorphoV2Client";
import { DatabaseClient } from "../src/database";

interface MarketDiff {
  chainId: number;
  vaultAddress: Address;
  vaultName: string;
  onChainAdapter: Address;
  dbAdapter: Address;
  adapterChanged: boolean;
  marketsToRemove: Hex[]; // markets with cap=0 on-chain
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const dbClient = new DatabaseClient();
  const connectResult = await dbClient.connect();
  if (connectResult.isErr()) {
    console.error("DB connect failed:", connectResult.error.message);
    process.exit(1);
  }

  const chainsResult = await dbClient.getAllChainConfigs();
  if (chainsResult.isErr()) {
    console.error("Failed to load chains:", chainsResult.error.message);
    process.exit(1);
  }

  const diffs: MarketDiff[] = [];

  for (const chainCfg of chainsResult.value) {
    const v2Vaults = chainCfg.vaultWhitelist.filter((v) => v.vaultVersion === "V2");
    if (v2Vaults.length === 0) continue;

    const infraConfig = chainConfigs[chainCfg.chainId];
    if (!infraConfig) {
      console.warn(`No infraConfig for chain ${String(chainCfg.chainId)}, skipping`);
      continue;
    }
    const rpcUrl =
      process.env[`RPC_URL_${String(chainCfg.chainId)}`] ??
      infraConfig.chain.rpcUrls.default.http[0];
    const publicClient = createPublicClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl),
    });

    const dbEntriesResult = await dbClient.getV2VaultMarkets(chainCfg.chainId);
    if (dbEntriesResult.isErr()) {
      console.error(
        `Failed to load V2 markets for chain ${String(chainCfg.chainId)}:`,
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
        // Vault is whitelisted as V2 but has no market list yet — out of
        // this script's scope (would need new-cap discovery, deferred to
        // Phase 1.5). Just warn.
        console.warn(
          `[${String(chainCfg.chainId)}] ${vault.address} is V2 but has no rows in vault_v2_markets — skipping`,
        );
        continue;
      }

      const diff = await diffVault(
        publicClient,
        infraConfig.morpho,
        chainCfg.chainId,
        vault.address,
        vault.name ?? vault.address,
        dbEntry.adapterAddress,
        dbEntry.marketIds,
      );
      if (diff) diffs.push(diff);
    }
  }

  printDiffs(diffs);

  if (!apply) {
    console.log("\n(dry run — pass --apply to execute)");
    await dbClient.disconnect();
    return;
  }

  console.log("\nApplying...");
  for (const d of diffs) {
    if (d.adapterChanged) {
      const r = await dbClient.updateV2VaultAdapter(d.chainId, d.vaultAddress, d.onChainAdapter);
      if (r.isErr())
        console.error(`  adapter update failed for ${d.vaultAddress}:`, r.error.message);
      else console.log(`  ✓ adapter updated for ${d.vaultName}`);
    }
    for (const marketId of d.marketsToRemove) {
      const r = await dbClient.removeV2VaultMarket(d.chainId, d.vaultAddress, marketId);
      if (r.isErr()) console.error(`  remove ${marketId} failed:`, r.error.message);
      else console.log(`  ✓ removed ${marketId} from ${d.vaultName}`);
    }
  }

  await dbClient.disconnect();
}

async function diffVault(
  client: Client<Transport, Chain>,
  morphoAddress: Address,
  chainId: number,
  vaultAddress: Address,
  vaultName: string,
  dbAdapter: Address,
  dbMarketIds: Hex[],
): Promise<MarketDiff | null> {
  let onChainAdapter: Address;
  try {
    const length = await readContract(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
    });
    if (length === 0n) {
      console.warn(`[${String(chainId)}] ${vaultAddress}: adaptersLength=0, skipping`);
      return null;
    }
    onChainAdapter = await readContract(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "adapters",
      args: [0n],
    });
  } catch (err) {
    console.error(`[${String(chainId)}] ${vaultAddress}: failed to read adapter:`, err);
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
        `[${String(chainId)}] ${vaultAddress}: cap read failed for ${marketId}:`,
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

function printDiffs(diffs: MarketDiff[]): void {
  if (diffs.length === 0) {
    console.log("\nNo drift detected — all V2 vaults' DB caches match on-chain.");
    return;
  }
  console.log("\nDrift detected:\n");
  for (const d of diffs) {
    console.log(`  ${d.vaultName} (chain ${String(d.chainId)} ${d.vaultAddress}):`);
    if (d.adapterChanged) {
      console.log(`    ~ adapter changed: ${d.dbAdapter} → ${d.onChainAdapter}`);
    }
    for (const mid of d.marketsToRemove) {
      console.log(`    - market ${mid}  (cap=0 on-chain)`);
    }
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
