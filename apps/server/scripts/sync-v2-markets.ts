/**
 * V2 vault market sync — operator CLI for reconciling the bot's
 * `vault_v2_markets` cache with on-chain state.
 *
 * Logic lives in `apps/server/src/services/v2DriftDetector.ts`. This
 * script is just argv parsing + console formatting; Phase 1.5's periodic
 * scheduler and HTTP endpoint will reuse the same `diffV2Vaults` /
 * `applyV2Diffs` helpers without touching this file.
 *
 * What's detected:
 *   - On-chain `adapters(0)` differs from DB row's `adapter_address`.
 *   - Markets currently in DB whose on-chain `absoluteCap` is 0.
 *
 * What's NOT detected :
 *   - New markets that received a non-zero cap on-chain but aren't in the DB.
 *
 * Usage (from apps/server):
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/sync-v2-markets.ts          # dry run
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/sync-v2-markets.ts --apply  # execute
 */
import { DatabaseClient } from "../src/database";
import { applyV2Diffs, diffV2Vaults, type VaultV2Diff } from "../src/services/v2DriftDetector";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const dbClient = new DatabaseClient();
  const connectResult = await dbClient.connect();
  if (connectResult.isErr()) {
    console.error("DB connect failed:", connectResult.error.message);
    process.exit(1);
  }

  const diffs = await diffV2Vaults(dbClient);
  printDiffs(diffs);

  if (!apply) {
    console.log("\n(dry run — pass --apply to execute)");
    await dbClient.disconnect();
    return;
  }

  if (diffs.length === 0) {
    await dbClient.disconnect();
    return;
  }

  console.log("\nApplying...");
  const { adaptersUpdated, marketsRemoved, errors } = await applyV2Diffs(dbClient, diffs);
  console.log(
    `  ✓ ${String(adaptersUpdated)} adapter update(s), ${String(marketsRemoved)} market(s) removed`,
  );
  for (const e of errors) console.error(`  ✗ ${e}`);

  await dbClient.disconnect();
}

function printDiffs(diffs: VaultV2Diff[]): void {
  if (diffs.length === 0) {
    console.log("\nNo drift detected — all V2 vaults' DB caches match on-chain.");
    return;
  }
  console.log("\nDrift detected:\n");
  for (const d of diffs) {
    console.log(
      `  ${d.vaultName ?? d.vaultAddress} (chain ${String(d.chainId)} ${d.vaultAddress}):`,
    );
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
