import { createViemTest } from "@morpho-org/test/vitest";
import { config } from "dotenv";
import { mainnet } from "viem/chains";

config();

const forkUrl = process.env.RPC_URL_1 ?? "https://ethereum.publicnode.com";
const forkBlockNumber = process.env.FORK_BLOCK_NUMBER
  ? Number(process.env.FORK_BLOCK_NUMBER)
  : 25_847_600;

export const test = createViemTest(mainnet, {
  forkUrl,
  forkBlockNumber,
  timeout: 120_000,
});
