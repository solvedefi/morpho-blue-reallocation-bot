import { chainConfig, chainConfigs } from "@morpho-blue-reallocation-bot/config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Config } from "../../config/dist/types";

import { ReallocationBot } from "./bot";
import { EquilizeUtilizations } from "./strategies";

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

    const bot = new ReallocationBot(
      config.chainId,
      client,
      config.vaultWhitelist,
      new EquilizeUtilizations(),
      conf,
    );

    // Run on startup.
    void bot.run();

    const botTask = runBotInBackground(bot, config.executionInterval);
    botTasks.push(botTask);
  }

  await Promise.all(botTasks);
}

main().catch(console.error);
