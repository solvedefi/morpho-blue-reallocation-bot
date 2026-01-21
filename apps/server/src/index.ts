import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { type Hono } from "hono";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ReallocationBot } from "./bot";
import { chainConfigs, type Config } from "./config";
import { getChainName } from "./constants";
import { DatabaseClient, type ChainOperationalConfig } from "./database";
import { createServer } from "./server";
import { MetadataService } from "./services/MetadataService";
import { ApyRange } from "./strategies";

interface RunningBotInfo {
  bot: ReallocationBot;
  abortController: AbortController;
  task: Promise<void>;
  // Store the config the bot was started with for comparison
  startedWithConfig: {
    executionInterval: number;
    vaultWhitelist: Address[];
  };
}

dotenvConfig();

async function getSecretsFromAWS(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({
    region: "eu-west-2",
  });

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await client.send(command);
    return response.SecretString ?? "";
  } catch (error) {
    console.error("Error retrieving secret:", error);
    throw error;
  }
}

function getRpcUrl(chainId: number, defaultRpcUrl?: string): string {
  const rpcUrl = process.env[`RPC_URL_${String(chainId)}`] ?? defaultRpcUrl;
  if (!rpcUrl) {
    throw new Error(`No RPC URL found for chainId ${String(chainId)}`);
  }
  return rpcUrl;
}

async function getPrivateKey(): Promise<Hex> {
  const useAWSSecretManager = process.env.USE_AWS_SECRETS ?? false;

  let reallocatorPrivateKey: string;
  if (useAWSSecretManager) {
    const reallocatorPrivateKeySecretName = process.env.REALLOCATOR_PRIVATE_KEY;
    if (!reallocatorPrivateKeySecretName) {
      throw new Error("No reallocator private key secret name found");
    }

    reallocatorPrivateKey = await getSecretsFromAWS(reallocatorPrivateKeySecretName);
    if (!reallocatorPrivateKey) {
      throw new Error(`No reallocator private key found for ${reallocatorPrivateKeySecretName}`);
    }
  } else {
    reallocatorPrivateKey = process.env.REALLOCATOR_PRIVATE_KEY ?? "";
  }

  if (!reallocatorPrivateKey) {
    throw new Error("No reallocator private key found");
  }

  return reallocatorPrivateKey as Hex;
}

async function runBotInBackgroundWithAbort(
  bot: ReallocationBot,
  executionInterval: number,
  abortController: AbortController,
): Promise<void> {
  const intervalId = setInterval(() => {
    try {
      void bot.run();
    } catch (err) {
      console.error("Bot run failed:", err);
    }
  }, executionInterval * 1000);

  // Listen for abort signal
  abortController.signal.addEventListener("abort", () => {
    clearInterval(intervalId);
    console.log("Bot execution stopped");
  });

  // Keep the promise pending until aborted
  return new Promise<void>((resolve) => {
    abortController.signal.addEventListener("abort", () => {
      resolve();
    });
  });
}

function logApyConfiguration(apyConfig: {
  vaultRanges: Record<number, Record<string, { min: number; max: number }>>;
  marketRanges: Record<number, Record<string, { min: number; max: number }>>;
  allowIdleReallocation: boolean;
  defaultMinApy: number;
  defaultMaxApy: number;
}) {
  const vaultChainIds = Object.keys(apyConfig.vaultRanges);
  const marketChainIds = Object.keys(apyConfig.marketRanges);

  for (const chainId of vaultChainIds) {
    const vaults = apyConfig.vaultRanges[parseInt(chainId)];
    if (!vaults) continue;
  }

  for (const chainId of marketChainIds) {
    const markets = apyConfig.marketRanges[parseInt(chainId)];
    if (!markets) continue;
  }
}

async function main() {
  const dbClient = new DatabaseClient();

  const connectResult = await dbClient.connect();
  if (connectResult.isErr()) {
    console.error("Failed to connect to database:", connectResult.error.message);
    process.exit(1);
  }

  const apyConfigResult = await dbClient.loadApyConfiguration();
  if (apyConfigResult.isErr()) {
    console.error("Failed to load APY configuration:", apyConfigResult.error.message);
    process.exit(1);
  }

  let apyConfig = apyConfigResult.value;
  logApyConfiguration(apyConfig);

  // Track running bots and their abort controllers
  const runningBots = new Map<number, RunningBotInfo>();

  /**
   * Helper function to check if bot config has changed
   */
  const hasConfigChanged = (
    runningConfig: { executionInterval: number; vaultWhitelist: Address[] },
    newConfig: ChainOperationalConfig,
  ): boolean => {
    // Check execution interval
    if (runningConfig.executionInterval !== newConfig.executionInterval) {
      return true;
    }

    // Check vault whitelist - compare sorted arrays
    const newVaultAddresses = newConfig.vaultWhitelist.map((v) => v.address.toLowerCase()).sort();
    const oldVaultAddresses = runningConfig.vaultWhitelist.map((v) => v.toLowerCase()).sort();

    if (newVaultAddresses.length !== oldVaultAddresses.length) {
      return true;
    }

    for (let i = 0; i < newVaultAddresses.length; i++) {
      if (newVaultAddresses[i] !== oldVaultAddresses[i]) {
        return true;
      }
    }

    return false;
  };

  const reloadConfiguration = async () => {
    console.log("\nConfiguration change detected. Reloading...");
    const newApyConfigResult = await dbClient.loadApyConfiguration();

    if (newApyConfigResult.isErr()) {
      console.error("❌ Failed to reload configuration:", newApyConfigResult.error.message);
      return;
    }

    apyConfig = newApyConfigResult.value;
    console.log("Configuration reloaded successfully");
    logApyConfiguration(apyConfig);

    // Reload chain configs to handle all changes
    const chainConfigsResult = await dbClient.getAllChainConfigs();
    if (chainConfigsResult.isErr()) {
      console.error("❌ Failed to reload chain configs:", chainConfigsResult.error.message);
      return;
    }

    const newChainConfigs = chainConfigsResult.value;
    const enabledChainIds = new Set(newChainConfigs.map((c) => c.chainId));

    // Stop bots for disabled chains
    for (const [botChainId, botInfo] of runningBots) {
      if (!enabledChainIds.has(botChainId)) {
        console.log(`Stopping bot for disabled chain ${getChainName(botChainId)}...`);
        botInfo.abortController.abort();
        runningBots.delete(botChainId);
      }
    }

    // Check each enabled chain config for changes
    for (const opConfig of newChainConfigs) {
      const existingBot = runningBots.get(opConfig.chainId);

      if (!existingBot) {
        // New chain - start bot
        console.log(`Starting bot for newly enabled chain ${getChainName(opConfig.chainId)}...`);
        startBotForChain(opConfig, privateKey, apyConfig);
      } else if (hasConfigChanged(existingBot.startedWithConfig, opConfig)) {
        // Config changed - restart bot
        console.log(
          `Configuration changed for chain ${getChainName(opConfig.chainId)}, restarting bot...`,
        );
        console.log(
          `  Old config: interval=${String(existingBot.startedWithConfig.executionInterval)}s, vaults=${String(existingBot.startedWithConfig.vaultWhitelist.length)}`,
        );
        console.log(
          `  New config: interval=${String(opConfig.executionInterval)}s, vaults=${String(opConfig.vaultWhitelist.length)}`,
        );

        // Stop existing bot
        existingBot.abortController.abort();
        runningBots.delete(opConfig.chainId);

        // Start new bot with updated config
        startBotForChain(opConfig, privateKey, apyConfig);
      } else {
        // Only strategy/APY config changed - update in place
        const newStrategy = new ApyRange(apyConfig);
        existingBot.bot.updateStrategy(newStrategy);
      }
    }

    console.log("All bots updated with new configuration\n");
  };

  const startBotForChain = (
    opConfig: ChainOperationalConfig,
    pk: Hex,
    config: typeof apyConfig,
  ) => {
    const infraConfig: Config | undefined = chainConfigs[opConfig.chainId];
    if (!infraConfig) {
      console.warn(
        `No infrastructure config found for chainId ${String(opConfig.chainId)}, skipping...`,
      );
      return;
    }

    const rpcUrl = getRpcUrl(opConfig.chainId, infraConfig.chain.rpcUrls.default.http[0]);

    // Create public client for reading contract data
    const publicClient = createPublicClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl, {
        timeout: 60_000, // 60 second timeout
        retryCount: 3, // Retry failed requests 3 times
        retryDelay: 1000, // Wait 1 second between retries
      }),
    });

    // Create wallet client for writing transactions
    const walletClient = createWalletClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl, {
        timeout: 60_000,
        retryCount: 3,
        retryDelay: 1000,
      }),
      account: privateKeyToAccount(pk),
    });

    // Extract addresses from vault whitelist
    const vaultAddresses = opConfig.vaultWhitelist.map((v) => v.address);

    const strategy = new ApyRange(config);
    const bot = new ReallocationBot(
      opConfig.chainId,
      publicClient,
      walletClient,
      vaultAddresses,
      strategy,
      infraConfig,
    );

    const abortController = new AbortController();
    void bot.run();

    const botTask = runBotInBackgroundWithAbort(bot, opConfig.executionInterval, abortController);

    runningBots.set(opConfig.chainId, {
      bot,
      abortController,
      task: botTask,
      // Store the config for comparison on reload
      startedWithConfig: {
        executionInterval: opConfig.executionInterval,
        vaultWhitelist: vaultAddresses,
      },
    });
  };

  // Start the HTTP server with configuration reload callback
  const metadataService = new MetadataService();
  const server: Hono = createServer(dbClient, metadataService, reloadConfiguration);
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

  // Load operational configs from database
  const chainConfigsResult = await dbClient.getAllChainConfigs();
  if (chainConfigsResult.isErr()) {
    console.error("Failed to load chain configs:", chainConfigsResult.error.message);
    process.exit(1);
  }

  const chainOperationalConfigs = chainConfigsResult.value;
  console.log(`Found ${String(chainOperationalConfigs.length)} enabled chain(s):`);
  for (const opConfig of chainOperationalConfigs) {
    console.log(
      `  Chain ${String(opConfig.chainId)}: ${String(opConfig.vaultWhitelist.length)} vault(s), interval: ${String(opConfig.executionInterval)}s`,
    );
  }

  if (chainOperationalConfigs.length === 0) {
    console.warn(
      "No chain configs found in database. Please add chain configs before running the bot.",
    );
    return;
  }

  // Get private key (shared across all chains)
  const privateKey = await getPrivateKey();

  // Start bots for all enabled chains
  for (const opConfig of chainOperationalConfigs) {
    console.log(`\nStarting bot for chain ${getChainName(opConfig.chainId)}...`);
    startBotForChain(opConfig, privateKey, apyConfig);
  }

  console.log("\nAll bots started successfully!\n");

  // Keep the process running
  await new Promise(() => {
    // This promise never resolves, keeping the process alive
  });
}

main().catch(console.error);
