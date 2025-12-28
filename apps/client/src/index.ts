import { chainConfig, chainConfigs } from "@morpho-blue-reallocation-bot/config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Config } from "../../config/dist/types";

import { ReallocationBot } from "./bot";
import { DatabaseClient } from "./database";
import { ApyRange } from "./strategies";

async function runBotInBackground(bot: ReallocationBot, executionInterval: number): Promise<void> {
  setInterval(() => {
    try {
      void bot.run();
    } catch (err) {
      console.error("Bot run failed:", err);
    }
  }, executionInterval * 1000);

  // Keep the promise pending forever
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return new Promise<void>(() => {});
}

async function main() {
  // Initialize database client and load configuration
  const dbClient = new DatabaseClient();
  await dbClient.connect();

  console.log("Loading APY configuration from database...");
  const apyConfig = await dbClient.loadApyConfiguration();
  console.log("APY configuration loaded successfully");
  // Log all the configuration for debugging/inspection
  console.log("--- APY Configuration ---");
  console.log(`Allow idle reallocation: ${String(apyConfig.allowIdleReallocation)}`);
  console.log(
    `Default APY range: min = ${String(apyConfig.defaultMinApy)}, max = ${String(apyConfig.defaultMaxApy)}`,
  );

  const vaultChainIds = Object.keys(apyConfig.vaultRanges);
  const marketChainIds = Object.keys(apyConfig.marketRanges);
  console.log(
    `Vault APY ranges configured for ${String(vaultChainIds.length)} chain(s):`,
    vaultChainIds,
  );
  for (const chainId of vaultChainIds) {
    const vaults = apyConfig.vaultRanges[parseInt(chainId)];
    if (!vaults) continue;
    console.log(`  ChainId ${chainId}:`);
    for (const [vaultAddr, range] of Object.entries(vaults)) {
      console.log(`    Vault ${vaultAddr}: min=${String(range.min)}, max=${String(range.max)}`);
    }
  }
  console.log(
    `Market APY ranges configured for ${String(marketChainIds.length)} chain(s):`,
    marketChainIds,
  );
  for (const chainId of marketChainIds) {
    const markets = apyConfig.marketRanges[parseInt(chainId)];
    if (!markets) continue;
    console.log(`  ChainId ${chainId}:`);
    for (const [marketId, range] of Object.entries(markets)) {
      console.log(`    Market ${marketId}: min=${String(range.min)}, max=${String(range.max)}`);
    }
  }

  const botTasks: Promise<void>[] = [];

  for (const chainId of Object.keys(chainConfigs)) {
    const conf: Config | undefined = chainConfigs[chainId as unknown as number];
    if (!conf) {
      throw new Error("Chain config not found for chainId " + chainId);
    }

    const config = await chainConfig(conf.chain.id);

    const client = createWalletClient({
      chain: conf.chain,
      transport: http(config.rpcUrl),
      account: privateKeyToAccount(config.reallocatorPrivateKey),
    });

    // Create strategy with database configuration
    const strategy = new ApyRange(apyConfig);

    const bot = new ReallocationBot(config.chainId, client, config.vaultWhitelist, strategy, conf);

    // Run on startup.
    void bot.run();

    const botTask = runBotInBackground(bot, config.executionInterval);
    botTasks.push(botTask);
  }

  await Promise.all(botTasks);
}

main().catch(console.error);
