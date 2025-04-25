import { Address, Hex, maxUint256, parseUnits } from "viem";
import { describe, expect, vi } from "vitest";
import { AnvilTestClient, testAccount } from "@morpho-org/test";
import nock from "nock";
import { test } from "../../setup.js";
import { EquilizeUtilizations } from "../../../src/strategies/equilizeUtilizations/index.js";
import { getTransactionReceipt, readContract, writeContract } from "viem/actions";
import {
  WBTC,
  USDC,
  METAMORPHO_FACTORY,
  MORPHO,
  WBTC_USDC_ORACLE,
  IRM,
  MIN_TIMELOCK,
} from "../../constants.js";
import { metaMorphoFactoryAbi } from "../../abis/MetaMorphoFactory.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { wDivDown } from "../../../src/utils/maths.js";
import { ReallocationBot } from "../../../src/bot.js";

const syncTimestamp = async (client: AnvilTestClient, timestamp?: bigint) => {
  timestamp ??= (await client.timestamp()) + 60n;

  vi.useFakeTimers({
    now: Number(timestamp) * 1000,
    toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
  });

  await client.setNextBlockTimestamp({ timestamp });

  return timestamp;
};

describe("should test the reallocation execution", () => {
  const strategy = new EquilizeUtilizations(0, 0);

  const supplier = testAccount(2);
  const borrower = testAccount(3);

  const marketParams1 = {
    loanToken: USDC as Address,
    collateralToken: WBTC as Address,
    oracle: WBTC_USDC_ORACLE as Address,
    irm: IRM as Address,
    lltv: parseUnits("0.385", 18),
  };

  const marketParams2 = {
    loanToken: USDC as Address,
    collateralToken: WBTC as Address,
    oracle: WBTC_USDC_ORACLE as Address,
    irm: IRM as Address,
    lltv: parseUnits("0.625", 18),
  };

  const marketParams3 = {
    loanToken: USDC as Address,
    collateralToken: WBTC as Address,
    oracle: WBTC_USDC_ORACLE as Address,
    irm: IRM as Address,
    lltv: parseUnits("0.77", 18),
  };

  const marketId1 = "0x60f25d76d9cd6762dabce33cc13d2d018f0d33f9bd62323a7fbe0726e0518388";
  const marketId2 = "0x88d40fc93bdfe3328504a780f04c193e2938e0ec3d92e6339b6a960f4584229a";
  const marketId3 = "0x91e04f21833b80e4f17241964c25dabcd9b062a6e4790ec4fd52f72f3f5b1f2e";

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);

  const loanAmount1 = parseUnits("10000", 6);
  const loanAmount2 = parseUnits("5000", 6);
  const loanAmount3 = parseUnits("2000", 6);

  test.sequential("should equalize rates", async ({ client }) => {
    await client.deal({
      erc20: USDC,
      account: supplier.address,
      amount: 3n * suppliedAmount,
    });

    await client.deal({
      erc20: WBTC,
      account: borrower.address,
      amount: 3n * collateralAmount,
    });

    /// Deploy markets

    await writeContract(client, {
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "createMarket",
      args: [marketParams1],
    });

    await writeContract(client, {
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "createMarket",
      args: [marketParams2],
    });

    await writeContract(client, {
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "createMarket",
      args: [marketParams3],
    });

    /// Deploy vault

    const hash = await writeContract(client, {
      address: METAMORPHO_FACTORY,
      abi: metaMorphoFactoryAbi,
      functionName: "createMetaMorpho",
      args: [
        client.account.address,
        MIN_TIMELOCK,
        USDC,
        "Test Vault",
        "TEST",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
    });

    const deploymentReceipt = await getTransactionReceipt(client, { hash });
    const vault = deploymentReceipt.logs[0]?.address!;

    /// Submit caps

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "submitCap",
      args: [marketParams1, caps],
    });

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "submitCap",
      args: [marketParams2, caps],
    });

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "submitCap",
      args: [marketParams3, caps],
    });

    /// Accept caps

    await syncTimestamp(client, (await client.timestamp()) + MIN_TIMELOCK);

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "acceptCap",
      args: [marketParams1],
    });

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "acceptCap",
      args: [marketParams2],
    });

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "acceptCap",
      args: [marketParams3],
    });

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "setSupplyQueue",
      args: [[marketId1]],
    });

    /// Deposit

    await client.approve({
      account: supplier.address,
      address: USDC,
      args: [vault, maxUint256],
    });

    await writeContract(client, {
      account: supplier,
      address: vault,
      abi: metaMorphoAbi,
      functionName: "deposit",
      args: [3n * suppliedAmount, supplier.address],
    });

    // reallocate

    const reallocation = [
      { marketParams: marketParams1, assets: suppliedAmount },
      { marketParams: marketParams2, assets: suppliedAmount },
      { marketParams: marketParams3, assets: maxUint256 },
    ];

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [reallocation],
    });

    /// Supply collateral

    await client.approve({
      account: borrower.address,
      address: WBTC,
      args: [MORPHO, maxUint256],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "supplyCollateral",
      args: [marketParams1, collateralAmount, borrower.address, "0x"],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "supplyCollateral",
      args: [marketParams2, collateralAmount, borrower.address, "0x"],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "supplyCollateral",
      args: [marketParams3, collateralAmount, borrower.address, "0x"],
    });

    /// Borrow

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "borrow",
      args: [marketParams1, loanAmount1, 0n, borrower.address, borrower.address],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "borrow",
      args: [marketParams2, loanAmount2, 0n, borrower.address, borrower.address],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "borrow",
      args: [marketParams3, loanAmount3, 0n, borrower.address, borrower.address],
    });

    /// Equalize

    const expectedUtilization = wDivDown(
      loanAmount1 + loanAmount2 + loanAmount3,
      suppliedAmount * 3n,
    );

    const [marketState1, marketState2, marketState3] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId2],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId3],
      }),
    ]);

    // first market is at 100% utilization
    expect(marketState1[2]).toBe(marketState1[0]);

    const apiResponse = [
      {
        chainId: 1,
        id: marketId1 as Hex,
        params: marketParams1,
        state: {
          totalSupplyAssets: marketState1[0],
          totalSupplyShares: marketState1[1],
          totalBorrowAssets: marketState1[2],
          totalBorrowShares: marketState1[3],
          lastUpdate: marketState1[4],
          fee: marketState1[5],
        },
        cap: caps,
        vaultAssets: suppliedAmount,
      },
      {
        chainId: 1,
        id: marketId2 as Hex,
        params: marketParams2,
        state: {
          totalSupplyAssets: marketState2[0],
          totalSupplyShares: marketState2[1],
          totalBorrowAssets: marketState2[2],
          totalBorrowShares: marketState2[3],
          lastUpdate: marketState2[4],
          fee: marketState2[5],
        },
        cap: caps,
        vaultAssets: suppliedAmount,
      },
      {
        chainId: 1,
        id: marketId3 as Hex,
        params: marketParams3,
        state: {
          totalSupplyAssets: marketState3[0],
          totalSupplyShares: marketState3[1],
          totalBorrowAssets: marketState3[2],
          totalBorrowShares: marketState3[3],
          lastUpdate: marketState3[4],
          fee: marketState3[5],
        },
        cap: caps,
        vaultAssets: suppliedAmount,
      },
    ];

    nock("http://localhost:42069").get(`/chain/1/vault/${vault}`).reply(200, apiResponse);

    const bot = new ReallocationBot(1, client, [vault], strategy);

    await bot.run();

    const newMarketState1 = await readContract(client, {
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "market",
      args: [marketId1],
    });

    // first market should not be at 100% utilization after reallocation
    expect(newMarketState1[2]).not.toBe(newMarketState1[0]);
  });
});
