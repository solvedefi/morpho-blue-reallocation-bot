import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { watchBlocks } from "viem/actions";

import { ReallocationBot } from "./bot";

import type { ChainConfig } from "@morpho-blue-reallocation-bot/config";
import { EquilizeUtilizations } from "./strategies";

export const launchBot = (config: ChainConfig) => {
  const client = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account: privateKeyToAccount(config.reallocatorPrivateKey),
  });

  const bot = new ReallocationBot(
    config.chainId,
    client,
    config.vaultWhitelist,
    new EquilizeUtilizations(),
  );

  watchBlocks(client, {
    onBlock: () => {
      void bot.run();
    },
  });
};
