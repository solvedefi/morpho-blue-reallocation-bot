import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

export const test = createViemTest(mainnet, {
  forkUrl: process.env.RPC_URL_1 ?? mainnet.rpcUrls.default.http[0],
  forkBlockNumber: 21_000_000,
  timeout: 30_000,
});
