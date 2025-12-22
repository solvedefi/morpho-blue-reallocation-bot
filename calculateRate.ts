import "dotenv/config";

/**
 * Calculate borrow APY using the exponential formula: exp(rate * seconds) - 1
 * Where:
 * - rate is the interest rate per second (in Wei with 18 decimals)
 * - seconds is the number of seconds (typically for a year: 31536000)
 *
 * @param ratePerSecond Interest rate per second in Wei (18 decimals)
 * @param seconds Number of seconds (typically a year: 31536000)
 * @returns The borrow APY as a decimal (e.g., 0.0489 for 4.89%)
 */
function calculateBorrowAPY(ratePerSecond: bigint, seconds: number): number {
  // Convert rate to a number with 18 decimal precision
  const rate = Number(ratePerSecond) / 1e18;

  // Calculate exp(rate * seconds) - 1
  const result = Math.exp(rate * seconds) - 1;

  return result;
}

/**
 * Calculate supply APY based on borrow APY, utilization, and fee
 * Formula: supplyAPY = borrowAPY * utilization * (1 - fee)
 *
 * @param borrowAPY The calculated borrow APY as a decimal (e.g., 0.0489 for 4.89%)
 * @param utilization The utilization rate as a decimal (e.g., 0.8 for 80%)
 * @param fee The fee rate as a bigint (18 decimals scale, e.g., 0n for no fee)
 * @returns The supply APY as a decimal (e.g., 0.0416 for 4.16%)
 */
function calculateSupplyAPY(borrowAPY: number, utilization: number, fee: bigint): number {
  // Convert fee from Wei to decimal (1e18 denominator)
  const feeRate = Number(fee) / 1e18;

  // Calculate supply APY using the formula: borrowAPY * utilization * (1 - fee)
  return borrowAPY * utilization * (1 - feeRate);
}

import { defineChain, Hex, http, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { irmAbi } from "./apps/client/abis/IRM";
import { metaMorphoAbi } from "./apps/client/abis/MetaMorpho";
import { morphoBlueAbi } from "./apps/client/abis/MorphoBlue";

export const virtual_base = defineChain({
  id: 8453,
  name: "Virtual Base",
  nativeCurrency: { name: "VETH", symbol: "vETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://virtual.rpc.tenderly.co/re7-labs/project/private/re7-eusd/35a936f7-af5c-4988-9b46-776a74a332ba",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Tenderly Explorer",
      url: "https://virtual.rpc.tenderly.co/re7-labs/project/public/re7-eusd",
    },
  },
});

export interface TSetBalanceRpc {
  method: "tenderly_setBalance";
  Parameters: [addresses: Hex[], value: Hex];
  ReturnType: Hex;
}

export interface TSetErc20BalanceRpc {
  method: "tenderly_setErc20Balance";
  Parameters: [erc20: Hex, to: Hex, value: Hex];
  ReturnType: Hex;
}

async function main() {
  const client = createPublicClient({
    chain: virtual_base,
    transport: http(virtual_base.rpcUrls.default.http[0]),
  });

  const metaMorphoAddress = "0xbb819D845b573B5D7C538F5b85057160cfb5f313" as const;
  const marketId = "0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea" as const;

  console.log("=== MetaMorpho Market Configuration ===\n");

  // Call the config function on MetaMorpho to get market configuration
  const marketConfig = await client.readContract({
    address: metaMorphoAddress,
    abi: metaMorphoAbi,
    functionName: "config",
    args: [marketId],
  });

  console.log("Market ID:", marketId);
  console.log("Cap:", marketConfig[0].toString());
  console.log("Enabled:", marketConfig[1]);
  console.log("Removable At:", marketConfig[2].toString());

  // Get the Morpho Blue contract address from MetaMorpho
  const morphoBlueAddress = await client.readContract({
    address: metaMorphoAddress,
    abi: metaMorphoAbi,
    functionName: "MORPHO",
  });

  console.log("\n=== Morpho Blue Contract ===\n");
  console.log("Morpho Blue Address:", morphoBlueAddress);

  // Get market parameters from Morpho Blue
  const marketParams = await client.readContract({
    address: morphoBlueAddress,
    abi: morphoBlueAbi,
    functionName: "idToMarketParams",
    args: [marketId],
  });

  console.log("\n=== Market Parameters ===\n");
  console.log("Loan Token:", marketParams[0]);
  console.log("Collateral Token:", marketParams[1]);
  console.log("Oracle:", marketParams[2]);
  console.log("IRM (Interest Rate Model):", marketParams[3]);
  console.log("LLTV (Liquidation Loan-to-Value):", marketParams[4].toString());

  // Get market state from Morpho Blue
  const marketState = await client.readContract({
    address: morphoBlueAddress,
    abi: morphoBlueAbi,
    functionName: "market",
    args: [marketId],
  });

  console.log("\n=== Market State ===\n");
  console.log("Total Supply Assets:", marketState[0].toString());
  console.log("Total Supply Shares:", marketState[1].toString());
  console.log("Total Borrow Assets:", marketState[2].toString());
  console.log("Total Borrow Shares:", marketState[3].toString());
  console.log("Last Update:", marketState[4].toString());
  console.log("Fee:", marketState[5].toString());

  // Calculate utilization
  const utilization = Number(marketState[2]) / Number(marketState[0]);
  console.log("\n=== Calculated Metrics ===\n");
  console.log("Utilization:", `${(utilization * 100).toFixed(2)}%`);

  // Get the current borrow rate from the IRM contract
  console.log("\n=== Interest Rates ===\n");

  let borrowAPY = 0;
  let supplyAPY = 0;

  try {
    const borrowRatePerSecond = await client.readContract({
      address: marketParams[3], // IRM address
      abi: irmAbi,
      functionName: "borrowRateView",
      args: [
        {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        },
        {
          totalSupplyAssets: marketState[0],
          totalSupplyShares: marketState[1],
          totalBorrowAssets: marketState[2],
          totalBorrowShares: marketState[3],
          lastUpdate: marketState[4],
          fee: marketState[5],
        },
      ],
    });

    console.log("Borrow Rate Per Second:", borrowRatePerSecond.toString());

    // Calculate APYs
    const secondsInYear = 31536000;
    borrowAPY = calculateBorrowAPY(borrowRatePerSecond, secondsInYear);
    supplyAPY = calculateSupplyAPY(borrowAPY, utilization, marketState[5]);

    console.log("\n=== APY Calculations ===\n");
    console.log("Borrow APY:", `${(borrowAPY * 100).toFixed(2)}%`);
    console.log("Supply APY:", `${(supplyAPY * 100).toFixed(2)}%`);
    console.log(
      `(Supply APY = Borrow APY × Utilization × (1 - Fee) = ${(borrowAPY * 100).toFixed(2)}% × ${(utilization * 100).toFixed(2)}% × ${(1 - Number(marketState[5]) / 1e18).toFixed(4)})`,
    );
  } catch (error) {
    console.log("Error fetching borrow rate from IRM:", (error as Error).message);
    console.log("(The IRM contract may not support the borrowRateView function)");
  }

  // Reallocate to push utilization to 100%
  console.log("\n=== Reallocation to 100% Utilization ===\n");

  const currentSupply = marketState[0];
  const currentBorrow = marketState[2];

  // To get close to 100% utilization, we need supply ≈ borrow
  // Adding 10 tokens as a buffer to ensure we don't run into liquidity issues
  const bufferTokens = 10n * 10n ** 18n; // 10 tokens with 18 decimals
  const targetAllocation = currentBorrow + bufferTokens;
  const amountToWithdraw = currentSupply - targetAllocation;

  console.log("Current Total Supply:", currentSupply.toString());
  console.log("Current Total Borrow:", currentBorrow.toString());
  console.log("Buffer (10 tokens):", bufferTokens.toString());
  console.log("Target Allocation:", targetAllocation.toString());
  console.log("Amount to Withdraw:", amountToWithdraw.toString());

  const targetUtilization = Number(currentBorrow) / Number(targetAllocation);
  console.log(
    `This will set utilization from ${(utilization * 100).toFixed(2)}% to ~${(targetUtilization * 100).toFixed(2)}%`,
  );

  // Prepare the reallocation parameters
  // We need two allocations:
  // 1. The main market - reduce allocation to currentBorrow + buffer
  // 2. The idle market - receives all excess liquidity
  const reallocationParams = [
    {
      marketParams: {
        loanToken: marketParams[0],
        collateralToken: marketParams[1],
        oracle: marketParams[2],
        irm: marketParams[3],
        lltv: marketParams[4],
      },
      // Setting assets to currentBorrow + buffer
      // MetaMorpho will withdraw the difference (currentSupply - targetAllocation)
      assets: targetAllocation,
    },
    {
      marketParams: {
        loanToken: marketParams[0], // Same loan token
        collateralToken: "0x0000000000000000000000000000000000000000", // Zero address for idle
        oracle: "0x0000000000000000000000000000000000000000",
        irm: "0x0000000000000000000000000000000000000000",
        lltv: 0n,
      },
      // Max uint256 means allocate all available idle liquidity to this market
      assets: 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
    },
  ];

  console.log("\n=== Reallocation Transaction Data ===\n");
  console.log("Target allocation for market:", targetAllocation.toString());
  console.log("This will withdraw:", amountToWithdraw.toString(), "assets from the market");

  console.log(
    "\nExecuting reallocation to call the 'reallocate' function on MetaMorpho with parameters:",
  );
  console.log(
    JSON.stringify(
      reallocationParams,
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );

  // Execute the reallocation
  const privateKey = process.env.REALLOCATOR_PRIVATE_KEY_FEATURE;
  if (!privateKey) {
    throw new Error("REALLOCATOR_PRIVATE_KEY_FEATURE environment variable is not set");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: virtual_base,
    transport: http(virtual_base.rpcUrls.default.http[0]),
  });

  console.log("\n=== Executing Reallocation Transaction ===\n");
  console.log("Sender address:", account.address);

  const hash = await walletClient.writeContract({
    address: metaMorphoAddress,
    abi: metaMorphoAbi,
    functionName: "reallocate",
    args: [reallocationParams],
  });

  console.log("\nTransaction submitted:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Transaction confirmed!");
  console.log("Status:", receipt.status);
  console.log("Block number:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Fetch updated market state
  console.log("\n=== Updated Market State ===\n");

  const updatedMarketState = await client.readContract({
    address: morphoBlueAddress,
    abi: morphoBlueAbi,
    functionName: "market",
    args: [marketId],
  });

  const updatedUtilization = Number(updatedMarketState[2]) / Number(updatedMarketState[0]);

  console.log("Total Supply Assets:", updatedMarketState[0].toString());
  console.log("Total Supply Shares:", updatedMarketState[1].toString());
  console.log("Total Borrow Assets:", updatedMarketState[2].toString());
  console.log("Total Borrow Shares:", updatedMarketState[3].toString());
  console.log("Last Update:", updatedMarketState[4].toString());
  console.log("Fee:", updatedMarketState[5].toString());
  console.log("\nUtilization:", `${(updatedUtilization * 100).toFixed(2)}%`);

  // Calculate updated rates
  console.log("\n=== Updated Interest Rates ===\n");

  try {
    const updatedBorrowRatePerSecond = await client.readContract({
      address: marketParams[3], // IRM address
      abi: irmAbi,
      functionName: "borrowRateView",
      args: [
        {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        },
        {
          totalSupplyAssets: updatedMarketState[0],
          totalSupplyShares: updatedMarketState[1],
          totalBorrowAssets: updatedMarketState[2],
          totalBorrowShares: updatedMarketState[3],
          lastUpdate: updatedMarketState[4],
          fee: updatedMarketState[5],
        },
      ],
    });

    console.log("Updated Borrow Rate Per Second:", updatedBorrowRatePerSecond.toString());

    // Calculate updated APYs
    const secondsInYear = 31536000;
    const updatedBorrowAPY = calculateBorrowAPY(updatedBorrowRatePerSecond, secondsInYear);
    const updatedSupplyAPY = calculateSupplyAPY(
      updatedBorrowAPY,
      updatedUtilization,
      updatedMarketState[5],
    );

    console.log("\n=== Updated APY Calculations ===\n");
    console.log("Updated Borrow APY:", `${(updatedBorrowAPY * 100).toFixed(2)}%`);
    console.log("Updated Supply APY:", `${(updatedSupplyAPY * 100).toFixed(2)}%`);
    console.log(
      `(Supply APY = Borrow APY × Utilization × (1 - Fee) = ${(updatedBorrowAPY * 100).toFixed(2)}% × ${(updatedUtilization * 100).toFixed(2)}% × ${(1 - Number(updatedMarketState[5]) / 1e18).toFixed(4)})`,
    );

    // Show comparison
    console.log("\n=== Before vs After Comparison ===\n");
    console.log(
      `Utilization: ${(utilization * 100).toFixed(2)}% → ${(updatedUtilization * 100).toFixed(2)}%`,
    );
    console.log(
      `Borrow APY: ${(borrowAPY * 100).toFixed(2)}% → ${(updatedBorrowAPY * 100).toFixed(2)}%`,
    );
    console.log(
      `Supply APY: ${(supplyAPY * 100).toFixed(2)}% → ${(updatedSupplyAPY * 100).toFixed(2)}%`,
    );
  } catch (error) {
    console.log("Error fetching updated borrow rate from IRM:", (error as Error).message);
  }
}

main().catch(console.error);
