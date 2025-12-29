import { serve } from "@hono/node-server";
import { type Hono } from "hono";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ReallocationBot } from "./bot";
import { chainConfig, chainConfigs, type Config } from "./config";
import { DatabaseClient } from "./database";
import { createServer } from "./server";
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

function logApyConfiguration(
  apyConfig: Awaited<ReturnType<DatabaseClient["loadApyConfiguration"]>>,
) {
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
}

async function main() {
  // Initialize database client and load configuration
  const dbClient = new DatabaseClient();
  await dbClient.connect();

  console.log("Loading APY configuration from database...");
  let apyConfig = await dbClient.loadApyConfiguration();
  console.log("APY configuration loaded successfully");
  logApyConfiguration(apyConfig);

  // Store all bots for configuration reload
  const bots: ReallocationBot[] = [];

  // Create a callback function to reload configuration and update all bots
  const reloadConfiguration = async () => {
    console.log("\n🔄 Configuration change detected. Reloading...");
    try {
      const newApyConfig = await dbClient.loadApyConfiguration();
      apyConfig = newApyConfig;

      console.log("Configuration reloaded successfully");
      logApyConfiguration(apyConfig);

      // Update all bots with new strategy
      for (const bot of bots) {
        const newStrategy = new ApyRange(apyConfig);
        bot.updateStrategy(newStrategy);
      }

      console.log("✅ All bots updated with new configuration\n");
    } catch (error) {
      console.error("❌ Failed to reload configuration:", error);
    }
  };

  // Start the HTTP server with configuration reload callback
  const server: Hono = createServer(dbClient, reloadConfiguration);
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  console.log(`Starting HTTP server on port ${String(port)}...`);
  serve(
    {
      fetch: server.fetch,
      port,
    },
    (info: { port: number; address: string }) => {
      console.log(`Server is running on http://localhost:${String(info.port)}`);
    },
  );

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

    // Store bot reference for configuration updates
    bots.push(bot);

    // Run on startup.
    void bot.run();

    const botTask = runBotInBackground(bot, config.executionInterval);
    botTasks.push(botTask);
  }

  await Promise.all(botTasks);
}

main().catch(console.error);
