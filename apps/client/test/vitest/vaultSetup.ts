import { AnvilTestClient, testAccount } from "@morpho-org/test";
import { Address, maxUint256, parseUnits } from "viem";
import {
  USDC,
  WBTC,
  WBTC_USDC_ORACLE,
  IRM,
  MORPHO,
  METAMORPHO_FACTORY,
  MIN_TIMELOCK,
} from "../constants";
import { getTransactionReceipt, writeContract } from "viem/actions";
import { morphoBlueAbi } from "../abis/MorphoBlue";
import { metaMorphoFactoryAbi } from "../abis/MetaMorphoFactory";
import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { vi } from "vitest";

export const marketParams1 = {
  loanToken: USDC as Address,
  collateralToken: WBTC as Address,
  oracle: WBTC_USDC_ORACLE as Address,
  irm: IRM as Address,
  lltv: parseUnits("0.385", 18),
};

export const marketParams2 = {
  loanToken: USDC as Address,
  collateralToken: WBTC as Address,
  oracle: WBTC_USDC_ORACLE as Address,
  irm: IRM as Address,
  lltv: parseUnits("0.625", 18),
};

export const marketParams3 = {
  loanToken: USDC as Address,
  collateralToken: WBTC as Address,
  oracle: WBTC_USDC_ORACLE as Address,
  irm: IRM as Address,
  lltv: parseUnits("0.77", 18),
};

export const supplier = testAccount(2);
export const borrower = testAccount(3);

export const marketId1 = "0x60f25d76d9cd6762dabce33cc13d2d018f0d33f9bd62323a7fbe0726e0518388";
export const marketId2 = "0x88d40fc93bdfe3328504a780f04c193e2938e0ec3d92e6339b6a960f4584229a";
export const marketId3 = "0x91e04f21833b80e4f17241964c25dabcd9b062a6e4790ec4fd52f72f3f5b1f2e";

export const setupVault = async (client: AnvilTestClient, cap: bigint, suppliedAmount: bigint) => {
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
    args: [marketParams1, cap],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [marketParams2, cap],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [marketParams3, cap],
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

  await client.deal({
    erc20: USDC,
    account: supplier.address,
    amount: suppliedAmount,
  });

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
    args: [suppliedAmount, supplier.address],
  });

  return vault;
};

const syncTimestamp = async (client: AnvilTestClient, timestamp?: bigint) => {
  timestamp ??= (await client.timestamp()) + 60n;

  vi.useFakeTimers({
    now: Number(timestamp) * 1000,
    toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
  });

  await client.setNextBlockTimestamp({ timestamp });

  return timestamp;
};
