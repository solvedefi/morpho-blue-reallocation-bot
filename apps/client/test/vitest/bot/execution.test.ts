import nock from "nock";
import { Hex, maxUint256, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { EquilizeUtilizations } from "../../../src/strategies/equilizeUtilizations/index.js";
import { readContract, writeContract } from "viem/actions";
import { WBTC, MORPHO } from "../../constants.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { ReallocationBot } from "../../../src/bot.js";
import { test } from "../../setup.js";
import {
  setupVault,
  marketParams1,
  marketParams2,
  marketParams3,
  marketId1,
  marketId2,
  marketId3,
  prepareBorrow,
  borrow,
} from "../vaultSetup.js";

describe("should test the reallocation execution", () => {
  const strategy = new EquilizeUtilizations(0, 0);

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);

  const loanAmount1 = parseUnits("10000", 6);
  const loanAmount2 = parseUnits("5000", 6);
  const loanAmount3 = parseUnits("2000", 6);

  test.sequential("should equalize rates", async ({ client }) => {
    // setup vault and supply

    const vault = await setupVault(client, caps, 3n * suppliedAmount);

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

    await prepareBorrow(client, [{ address: WBTC, amount: 3n * collateralAmount }]);

    await borrow(client, [
      { marketParams: marketParams1, loanAmount: loanAmount1, collateralAmount },
      { marketParams: marketParams2, loanAmount: loanAmount2, collateralAmount },
      { marketParams: marketParams3, loanAmount: loanAmount3, collateralAmount },
    ]);

    /// Equalize

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
        rateAtTarget: 0n, // unused for the equilizeUtilizations strategy
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
        rateAtTarget: 0n, // unused for the equilizeUtilizations strategy
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
        rateAtTarget: 0n, // unused for the equilizeUtilizations strategy
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
