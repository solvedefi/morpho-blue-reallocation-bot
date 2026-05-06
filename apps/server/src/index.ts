import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { type Hono } from "hono";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ReallocationBot, ReallocationBotV2, type V2VaultEntry } from "./bot";
import { chainConfigs, type Config } from "./config";
import { getChainName } from "./constants";
import { DatabaseClient, type ChainOperationalConfig } from "./database";
import { createServer } from "./server";
import { GasMonitor } from "./services/GasMonitor";
import { MetadataService } from "./services/MetadataService";
import { MinGasThresholds } from "./services/MinGasThresholds";
import { SlackNotifier } from "./services/SlackNotifier";
import { ApyRange } from "./strategies";
import { ApyRangeV2Strategy } from "./strategies-v2";

interface RunningBotInfo {
  v1Bot?: ReallocationBot;
  v2Bot?: ReallocationBotV2;
  abortController: AbortController;
  task: Promise<void>;
  // Snapshot of the config the bots were started with — used to decide
  // whether a reload requires a restart vs. an in-place strategy update.
  startedWithConfig: {
    executionInterval: number;
    v1VaultAddresses: Address[];
    v2Entries: V2VaultEntry[];
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

interface RunnableBot {
  run: () => Promise<void>;
}

function runBotsInBackgroundWithAbort(
  bots: RunnableBot[],
  executionInterval: number,
  abortController: AbortController,
): Promise<void> {
  const intervalId = setInterval(() => {
    for (const bot of bots) {
      try {
        void bot.run();
      } catch (err) {
        console.error("Bot run failed:", err);
      }
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

  const slack = new SlackNotifier();
  const minGasThresholds = new MinGasThresholds();
  const gasMonitor = new GasMonitor(slack, minGasThresholds);

  // Track running bots and their abort controllers
  const runningBots = new Map<number, RunningBotInfo>();

  /**
   * Helper function to check if bot config has changed (interval, V1 vault
   * set, or V2 entry set including market lists).
   */
  const hasConfigChanged = (
    runningConfig: {
      executionInterval: number;
      v1VaultAddresses: Address[];
      v2Entries: V2VaultEntry[];
      minGasWei: bigint | null;
      gasCheckIntervalSec: number;
    },
    newConfig: ChainOperationalConfig,
    newV2Entries: V2VaultEntry[],
  ): boolean => {
    if (runningConfig.executionInterval !== newConfig.executionInterval) {
      return true;
    }
    if (runningConfig.minGasWei !== newConfig.minGasWei) {
      return true;
    }
    if (runningConfig.gasCheckIntervalSec !== newConfig.gasCheckIntervalSec) {
      return true;
    }

    const newV1 = newConfig.vaultWhitelist
      .filter((v) => v.vaultVersion === "V1")
      .map((v) => v.address.toLowerCase())
      .sort();
    const oldV1 = runningConfig.v1VaultAddresses.map((a) => a.toLowerCase()).sort();
    if (!stringArraysEqual(newV1, oldV1)) return true;

    return !v2EntriesEqual(runningConfig.v2Entries, newV2Entries);
  };

  const stringArraysEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const v2EntriesEqual = (a: V2VaultEntry[], b: V2VaultEntry[]): boolean => {
    if (a.length !== b.length) return false;
    const norm = (entries: V2VaultEntry[]) =>
      entries
        .map((e) => ({
          v: e.vaultAddress.toLowerCase(),
          ad: e.adapterAddress.toLowerCase(),
          m: [...e.marketIds]
            .map((x) => x.toLowerCase())
            .sort()
            .join(","),
        }))
        .sort((x, y) => x.v.localeCompare(y.v));
    const aN = norm(a);
    const bN = norm(b);
    for (let i = 0; i < aN.length; i++) {
      const ai = aN[i];
      const bi = bN[i];
      if (!ai || !bi) return false;
      if (ai.v !== bi.v || ai.ad !== bi.ad || ai.m !== bi.m) return false;
    }
    return true;
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
        gasMonitor.stop(botChainId);
        runningBots.delete(botChainId);
      }
    }

    // Check each enabled chain config for changes
    for (const opConfig of newChainConfigs) {
      const existingBot = runningBots.get(opConfig.chainId);

      // Load V2 entries for this chain (needed both for change detection
      // and for restarting if changed).
      const v2EntriesResult = await dbClient.getV2VaultMarkets(opConfig.chainId);
      if (v2EntriesResult.isErr()) {
        console.error(
          `❌ Failed to load V2 entries for chain ${getChainName(opConfig.chainId)}:`,
          v2EntriesResult.error.message,
        );
        continue;
      }
      const v2Entries = v2EntriesResult.value;

      if (!existingBot) {
        console.log(`Starting bot for newly enabled chain ${getChainName(opConfig.chainId)}...`);
        startBotForChain(opConfig, privateKey, apyConfig, v2Entries);
      } else if (hasConfigChanged(existingBot.startedWithConfig, opConfig, v2Entries)) {
        console.log(
          `Configuration changed for chain ${getChainName(opConfig.chainId)}, restarting bot...`,
        );

        existingBot.abortController.abort();
        gasMonitor.stop(opConfig.chainId);
        runningBots.delete(opConfig.chainId);

        startBotForChain(opConfig, privateKey, apyConfig, v2Entries);
      } else {
        // Only strategy/APY config changed — update in place on whichever
        // bots are running.
        if (existingBot.v1Bot) {
          existingBot.v1Bot.updateStrategy(new ApyRange(apyConfig));
        }
        if (existingBot.v2Bot) {
          existingBot.v2Bot.updateStrategy(new ApyRangeV2Strategy(apyConfig));
        }
      }
    }

    console.log("All bots updated with new configuration\n");
  };

  const startBotForChain = (
    opConfig: ChainOperationalConfig,
    pk: Hex,
    config: typeof apyConfig,
    v2Entries: V2VaultEntry[],
  ): void => {
    const infraConfig: Config | undefined = chainConfigs[opConfig.chainId];
    if (!infraConfig) {
      console.warn(
        `No infrastructure config found for chainId ${String(opConfig.chainId)}, skipping...`,
      );
      return;
    }

    const rpcUrl = getRpcUrl(opConfig.chainId, infraConfig.chain.rpcUrls.default.http[0]);

    const publicClient = createPublicClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl, { timeout: 60_000, retryCount: 3, retryDelay: 1000 }),
    });

    const walletClient = createWalletClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl, { timeout: 60_000, retryCount: 3, retryDelay: 1000 }),
      account: privateKeyToAccount(pk),
    });

    // Partition vaults by version. The same chain can run a V1 bot AND a
    // V2 bot in the same process, sharing one wallet/public client.
    const v1VaultAddresses = opConfig.vaultWhitelist
      .filter((v) => v.vaultVersion === "V1")
      .map((v) => v.address);

    const chainName = getChainName(opConfig.chainId);
    const runnableBots: RunnableBot[] = [];
    let v1Bot: ReallocationBot | undefined;
    let v2Bot: ReallocationBotV2 | undefined;

    if (v1VaultAddresses.length > 0) {
      v1Bot = new ReallocationBot(
        opConfig.chainId,
        publicClient,
        walletClient,
        v1VaultAddresses,
        new ApyRange(config),
        infraConfig,
        minGasThresholds,
      );
      runnableBots.push(v1Bot);
      console.log(
        `  V1 bot started for ${chainName} (${String(v1VaultAddresses.length)} vault(s))`,
      );
    }

    if (v2Entries.length > 0) {
      v2Bot = new ReallocationBotV2(
        opConfig.chainId,
        publicClient,
        walletClient,
        v2Entries,
        new ApyRangeV2Strategy(config),
        infraConfig,
      );
      runnableBots.push(v2Bot);
      console.log(`  V2 bot started for ${chainName} (${String(v2Entries.length)} vault(s))`);
    }

    if (runnableBots.length === 0) {
      console.log(`No bots to start for ${chainName} (no V1 vaults, no V2 entries)`);
      return;
    }

    const abortController = new AbortController();
    // Kick off an immediate first run on each so we don't wait one full
    // interval before the first reallocation.
    for (const b of runnableBots) void b.run();

    const botTask = runBotsInBackgroundWithAbort(
      runnableBots,
      opConfig.executionInterval,
      abortController,
    );

    gasMonitor.start(
      opConfig.chainId,
      publicClient,
      walletClient.account.address,
      opConfig.minGasWei,
      opConfig.gasCheckIntervalSec,
    );

    runningBots.set(opConfig.chainId, {
      v1Bot,
      v2Bot,
      abortController,
      task: botTask,
      startedWithConfig: {
        executionInterval: opConfig.executionInterval,
        v1VaultAddresses,
        v2Entries,
        minGasWei: opConfig.minGasWei,
        gasCheckIntervalSec: opConfig.gasCheckIntervalSec,
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

  // Start bots for all enabled chains. Each chain may host a V1 bot, a V2
  // bot, or both — depending on which vault versions are whitelisted and
  // (for V2) whether `vault_v2_markets` has any rows for the chain.
  for (const opConfig of chainOperationalConfigs) {
    console.log(`\nStarting bot for chain ${getChainName(opConfig.chainId)}...`);
    const v2EntriesResult = await dbClient.getV2VaultMarkets(opConfig.chainId);
    if (v2EntriesResult.isErr()) {
      console.error(
        `Failed to load V2 entries for chain ${getChainName(opConfig.chainId)}, skipping V2:`,
        v2EntriesResult.error.message,
      );
    }
    const v2Entries = v2EntriesResult.isOk() ? v2EntriesResult.value : [];
    startBotForChain(opConfig, privateKey, apyConfig, v2Entries);
  }

  console.log("\nAll bots started successfully!\n");

  // Keep the process running
  await new Promise(() => {
    // This promise never resolves, keeping the process alive
  });
}

main().catch(console.error);
