import { createViemTest } from "@morpho-org/test/vitest";
import { config } from "dotenv";
import { mainnet } from "viem/chains";

config();

export const test = createViemTest(mainnet, {
  forkUrl: process.env.RPC_URL_1 ?? "https://ethereum.publicnode.com",
  forkBlockNumber: 25_846_670,
  timeout: 120_000,
});
