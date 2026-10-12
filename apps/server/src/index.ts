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
import { logger } from "./logger";
import { createServer } from "./server";
import { GasMonitor } from "./services/GasMonitor";
import { MetadataService } from "./services/MetadataService";
import { MinGasThresholds } from "./services/MinGasThresholds";
import { SlackNotifier } from "./services/SlackNotifier";
import { VaultStrategies } from "./strategies";
import { loadVaultsCsv } from "./utils/vaultsCsv";

interface RunningBotInfo {
  bot: ReallocationBot;
  abortController: AbortController;
  task: Promise<void>;
  // Store the config the bot was started with for comparison
  startedWithConfig: {
    executionInterval: number;
    vaultWhitelist: Address[];
    minGasWei: bigint | null;
    gasCheckIntervalSec: number;
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
    logger.error({ err: error }, "Error retrieving secret");
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

function createChainClients(chainId: number, infraConfig: Config, pk: Hex) {
  const rpcUrl = getRpcUrl(chainId, infraConfig.chain.rpcUrls.default.http[0]);

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

  return { publicClient, walletClient };
}

async function runBotInBackgroundWithAbort(
  bot: ReallocationBot,
  executionInterval: number,
  abortController: AbortController,
): Promise<void> {
  const intervalId = setInterval(() => {
    bot.run().catch((err: unknown) => {
      logger.error({ err }, "Bot run failed");
    });
  }, executionInterval * 1000);

  // Listen for abort signal
  abortController.signal.addEventListener("abort", () => {
    clearInterval(intervalId);
    logger.info("Bot execution stopped");
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
    logger.fatal({ err: connectResult.error }, "Failed to connect to database");
    process.exit(1);
  }

  const { vaults: csvVaults, warnings: csvWarnings } = loadVaultsCsv();
  for (const warning of csvWarnings) logger.warn(`vaults.csv: ${warning}`);
  const syncResult = await dbClient.syncVaultsFromCsv(csvVaults);
  if (syncResult.isErr()) {
    logger.fatal({ err: syncResult.error }, "Failed to sync vaults.csv");
    process.exit(1);
  }
  logger.info({ count: csvVaults.length }, "Synced vaults from vaults.csv");
  for (const v of syncResult.value) {
    logger.info({ vault: v.vaultAddress, chainId: v.chainId }, "Removed vault not in vaults.csv");
  }

  const apyConfigResult = await dbClient.loadApyConfiguration();
  if (apyConfigResult.isErr()) {
    logger.fatal({ err: apyConfigResult.error }, "Failed to load APY configuration");
    process.exit(1);
  }

  let apyConfig = apyConfigResult.value;
  logApyConfiguration(apyConfig);

  const slack = new SlackNotifier();
  const minGasThresholds = new MinGasThresholds();
  const gasMonitor = new GasMonitor(slack, minGasThresholds);

  // Track running bots and their abort controllers
  const runningBots = new Map<number, RunningBotInfo>();

  /**
   * Helper function to check if bot config has changed
   */
  const hasConfigChanged = (
    runningConfig: {
      executionInterval: number;
      vaultWhitelist: Address[];
      minGasWei: bigint | null;
      gasCheckIntervalSec: number;
    },
    newConfig: ChainOperationalConfig,
  ): boolean => {
    // Check execution interval
    if (runningConfig.executionInterval !== newConfig.executionInterval) {
      return true;
    }
    if (runningConfig.minGasWei !== newConfig.minGasWei) {
      return true;
    }
    if (runningConfig.gasCheckIntervalSec !== newConfig.gasCheckIntervalSec) {
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
    logger.info("Configuration change detected, reloading");
    const newApyConfigResult = await dbClient.loadApyConfiguration();

    if (newApyConfigResult.isErr()) {
      logger.error({ err: newApyConfigResult.error }, "Failed to reload configuration");
      return;
    }

    apyConfig = newApyConfigResult.value;
    logger.info("Configuration reloaded");
    logApyConfiguration(apyConfig);

    // Reload chain configs to handle all changes
    const chainConfigsResult = await dbClient.getAllChainConfigs();
    if (chainConfigsResult.isErr()) {
      logger.error({ err: chainConfigsResult.error }, "Failed to reload chain configs");
      return;
    }

    const newChainConfigs = chainConfigsResult.value;
    const enabledChainIds = new Set(newChainConfigs.map((c) => c.chainId));

    // Stop bots for disabled chains
    for (const [botChainId, botInfo] of runningBots) {
      if (!enabledChainIds.has(botChainId)) {
        logger.info(
          { chainId: botChainId, chain: getChainName(botChainId) },
          "Stopping bot for disabled chain",
        );
        botInfo.abortController.abort();
        gasMonitor.stop(botChainId);
        runningBots.delete(botChainId);
      }
    }

    // Check each enabled chain config for changes
    for (const opConfig of newChainConfigs) {
      const existingBot = runningBots.get(opConfig.chainId);

      if (!existingBot) {
        // New chain - start bot
        logger.info(
          { chainId: opConfig.chainId, chain: getChainName(opConfig.chainId) },
          "Starting bot for newly enabled chain",
        );
        startBotForChain(opConfig, privateKey, apyConfig);
      } else if (hasConfigChanged(existingBot.startedWithConfig, opConfig)) {
        // Config changed - restart bot
        logger.info(
          {
            chainId: opConfig.chainId,
            chain: getChainName(opConfig.chainId),
            old: {
              interval: existingBot.startedWithConfig.executionInterval,
              vaults: existingBot.startedWithConfig.vaultWhitelist.length,
            },
            new: { interval: opConfig.executionInterval, vaults: opConfig.vaultWhitelist.length },
          },
          "Chain configuration changed, restarting bot",
        );

        // Stop existing bot
        existingBot.abortController.abort();
        gasMonitor.stop(opConfig.chainId);
        runningBots.delete(opConfig.chainId);

        // Start new bot with updated config
        startBotForChain(opConfig, privateKey, apyConfig);
      } else {
        // Only strategy/APY config changed - update in place
        const newStrategy = new VaultStrategies(apyConfig, opConfig.vaultWhitelist);
        existingBot.bot.updateStrategy(newStrategy);
      }
    }

    logger.info("All bots updated with new configuration");
  };

  const startBotForChain = (
    opConfig: ChainOperationalConfig,
    pk: Hex,
    config: typeof apyConfig,
  ) => {
    const infraConfig: Config | undefined = chainConfigs[opConfig.chainId];
    if (!infraConfig) {
      logger.warn({ chainId: opConfig.chainId }, "No infrastructure config found, skipping");
      return;
    }
    if (opConfig.vaultWhitelist.length === 0) {
      logger.info(
        { chainId: opConfig.chainId, chain: getChainName(opConfig.chainId) },
        "No morpho-v1 vaults, skipping",
      );
      return;
    }

    const { publicClient, walletClient } = createChainClients(opConfig.chainId, infraConfig, pk);

    // Extract addresses from vault whitelist
    const vaultAddresses = opConfig.vaultWhitelist.map((v) => v.address);

    const strategy = new VaultStrategies(config, opConfig.vaultWhitelist);
    const bot = new ReallocationBot(
      opConfig.chainId,
      publicClient,
      walletClient,
      vaultAddresses,
      strategy,
      infraConfig,
      minGasThresholds,
    );

    const abortController = new AbortController();
    void bot.run();

    const botTask = runBotInBackgroundWithAbort(bot, opConfig.executionInterval, abortController);

    gasMonitor.start(
      opConfig.chainId,
      publicClient,
      walletClient.account.address,
      opConfig.minGasWei,
      opConfig.gasCheckIntervalSec,
    );

    runningBots.set(opConfig.chainId, {
      bot,
      abortController,
      task: botTask,
      // Store the config for comparison on reload
      startedWithConfig: {
        executionInterval: opConfig.executionInterval,
        vaultWhitelist: vaultAddresses,
        minGasWei: opConfig.minGasWei,
        gasCheckIntervalSec: opConfig.gasCheckIntervalSec,
      },
    });
  };

  // Emergency withdrawals must work for vaults the regular bot no longer runs (they are
  // disabled on the first emergency call), so fall back to a standalone, never-scheduled bot.
  const emergencyKey: { pk?: Hex } = {}; // pk set once the private key is loaded below
  const emergencyBots = new Map<number, ReallocationBot>();
  const getEmergencyBot = (chainId: number): ReallocationBot | undefined => {
    const running = runningBots.get(chainId)?.bot;
    if (running) return running;
    const infraConfig: Config | undefined = chainConfigs[chainId];
    if (!infraConfig || !emergencyKey.pk) return undefined;
    let bot = emergencyBots.get(chainId);
    if (!bot) {
      const { publicClient, walletClient } = createChainClients(
        chainId,
        infraConfig,
        emergencyKey.pk,
      );
      bot = new ReallocationBot(
        chainId,
        publicClient,
        walletClient,
        [],
        new VaultStrategies(apyConfig, []),
        infraConfig,
        minGasThresholds,
      );
      emergencyBots.set(chainId, bot);
    }
    return bot;
  };

  // Start the HTTP server with configuration reload callback
  const metadataService = new MetadataService();
  const server: Hono = createServer(
    dbClient,
    metadataService,
    reloadConfiguration,
    getEmergencyBot,
  );
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  logger.info({ port }, "Starting HTTP server");
  serve(
    {
      fetch: server.fetch,
      port,
    },
    (info: { port: number; address: string }) => {
      logger.info({ port: info.port }, "Server is running");
    },
  );

  // Load operational configs from database
  const chainConfigsResult = await dbClient.getAllChainConfigs();
  if (chainConfigsResult.isErr()) {
    logger.fatal({ err: chainConfigsResult.error }, "Failed to load chain configs");
    process.exit(1);
  }

  const chainOperationalConfigs = chainConfigsResult.value;
  for (const opConfig of chainOperationalConfigs) {
    logger.info(
      {
        chainId: opConfig.chainId,
        vaults: opConfig.vaultWhitelist.length,
        interval: opConfig.executionInterval,
      },
      "Enabled chain",
    );
  }

  if (chainOperationalConfigs.length === 0) {
    logger.warn(
      "No chain configs found in database. Please add chain configs before running the bot.",
    );
    return;
  }

  // Get private key (shared across all chains)
  const privateKey = await getPrivateKey();
  emergencyKey.pk = privateKey;

  // Start bots for all enabled chains
  for (const opConfig of chainOperationalConfigs) {
    logger.info(
      { chainId: opConfig.chainId, chain: getChainName(opConfig.chainId) },
      "Starting bot",
    );
    startBotForChain(opConfig, privateKey, apyConfig);
  }

  logger.info("All bots started");

  // Keep the process running
  await new Promise(() => {
    // This promise never resolves, keeping the process alive
  });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Fatal error");
  process.exit(1);
});
