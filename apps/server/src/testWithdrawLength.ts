import { config as dotenvConfig } from "dotenv";
import { createPublicClient, http, type Address } from "viem";
import { readContract } from "viem/actions";
import { mainnet } from "viem/chains";

import { metaMorphoAbi } from "../abis/MetaMorpho.js";

dotenvConfig({ path: "../../.env" });

// Test vault addresses from the error logs
const testVaults: Address[] = [
  "0x95EeF579155cd2C5510F312c8fA39208c3Be01a8",
  "0xA02F5E93f783baF150Aa1F8b341Ae90fe0a772f7",
  "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
  "0xE0C98605f279e4D7946d25B75869c69802823763",
  "0x4F460bb11cf958606C69A963B4A17f9DaEEea8b6",
];

async function testWithdrawQueueLength() {
  const rpcUrl = process.env.RPC_URL_1;

  if (!rpcUrl) {
    console.error("❌ Error: RPC_URL_1 environment variable is not set!");
    console.error("Please ensure your .env file contains RPC_URL_1");
    process.exit(1);
  }

  console.log(`Using RPC URL: ${rpcUrl}`);
  console.log(`Chain: ${mainnet.name} (${mainnet.id.toString()})\n`);

  // Create public client with the same configuration as in index.ts
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl, {
      timeout: 60_000, // 60 second timeout
      retryCount: 3, // Retry failed requests 3 times
      retryDelay: 1000, // Wait 1 second between retries
    }),
  });

  console.log("Testing withdrawQueueLength for each vault...\n");

  for (const vaultAddress of testVaults) {
    console.log(`Testing vault: ${vaultAddress}`);
    try {
      const withdrawQueueLength = await readContract(publicClient, {
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
        args: [],
      });

      console.log(`✅ Success! withdrawQueueLength = ${withdrawQueueLength.toString()}\n`);
    } catch (error: unknown) {
      console.log(`❌ Failed!`);
      console.error(error);
      console.log("\n");
    }
  }

  // Test with a single simple call
  console.log("\n--- Testing with first vault address only ---");
  const firstVault = testVaults[0];
  if (firstVault) {
    try {
      console.log(`Calling withdrawQueueLength on ${firstVault}...`);
      const result = await readContract(publicClient, {
        address: firstVault,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
        args: [],
      });
      console.log(`Result: ${result.toString()}`);
    } catch (error: unknown) {
      console.error("Error details:");
      console.error(error);
    }
  }
}

testWithdrawQueueLength()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  });
