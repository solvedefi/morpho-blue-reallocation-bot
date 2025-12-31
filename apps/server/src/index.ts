import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { type Hono } from "hono";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ReallocationBot } from "./bot";
import { chainConfigs, type Config } from "./config";
import { DatabaseClient } from "./database";
import { createServer } from "./server";
import { ApyRange } from "./strategies";

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

function getRpcUrl(chainId: number, defaultRpcUrl?: string): Promise<string> {
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
  await dbClient.connect();

  let apyConfig = await dbClient.loadApyConfiguration();
  logApyConfiguration(apyConfig);

  const bots: ReallocationBot[] = [];

  const reloadConfiguration = async () => {
    console.log("\nConfiguration change detected. Reloading...");
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

      console.log("All bots updated with new configuration\n");
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

  // Load operational configs from database
  const chainOperationalConfigs = await dbClient.getAllChainConfigs();
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

  const botTasks: Promise<void>[] = [];

  for (const opConfig of chainOperationalConfigs) {
    const infraConfig: Config | undefined = chainConfigs[opConfig.chainId];
    if (!infraConfig) {
      console.warn(
        `No infrastructure config found for chainId ${String(opConfig.chainId)}, skipping...`,
      );
      continue;
    }

    const rpcUrl = await getRpcUrl(opConfig.chainId, infraConfig.chain.rpcUrls.default.http[0]);
    const client = createWalletClient({
      chain: infraConfig.chain,
      transport: http(rpcUrl),
      account: privateKeyToAccount(privateKey),
    });

    // Create strategy with database configuration
    const strategy = new ApyRange(apyConfig);

    const bot = new ReallocationBot(
      opConfig.chainId,
      client,
      opConfig.vaultWhitelist,
      strategy,
      infraConfig,
    );

    // Store bot reference for configuration updates
    bots.push(bot);

    console.log(`\nStarting bot for chain ${String(opConfig.chainId)}...`);
    void bot.run();

    const botTask = runBotInBackground(bot, opConfig.executionInterval);
    botTasks.push(botTask);
  }

  console.log("\nAll bots started successfully!\n");

  await Promise.all(botTasks);
}

main().catch(console.error);
