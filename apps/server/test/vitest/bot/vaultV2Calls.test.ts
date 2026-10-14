import { Address, decodeAbiParameters, decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { vaultV2Abi } from "../../../abis/VaultV2.js";
import {
  describeReallocation,
  reallocateCall,
  toVaultV2Calls,
} from "../../../src/bot/reallocateArgs.js";
import { marketIdFromParams } from "../../../src/utils/marketId.js";
import { MarketParams, VaultData, VaultMarketData } from "../../../src/utils/types.js";

const ADAPTER = "0x00000000000000000000000000000000000000Ad" as Address;
const LOAN = "0x00000000000000000000000000000000000000aa" as Address;

function market(collateral: Address, vaultAssets: bigint): VaultMarketData {
  const params: MarketParams = {
    loanToken: LOAN,
    collateralToken: collateral,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  };
  return {
    chainId: 1,
    id: marketIdFromParams(params),
    params,
    state: {
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 0n,
      fee: 0n,
    },
    cap: maxUint256,
    vaultAssets,
    rateAtTarget: 0n,
    apyAt100Utilization: 0n,
    loanTokenDecimals: 6,
    adapter: collateral === zeroAddress ? undefined : ADAPTER,
  };
}

const A = market("0x0000000000000000000000000000000000000001", 100n);
const B = market("0x0000000000000000000000000000000000000002", 50n);
const IDLE = market(zeroAddress, 30n);
const vault: VaultData = {
  vaultAddress: "0x00000000000000000000000000000000000000bb",
  marketsData: new Map([A, B, IDLE].map((m) => [m.id, m])),
  vaultType: "morpho-v2",
};

function decode(calls: `0x${string}`[]) {
  return calls.map((data) => {
    const { functionName, args } = decodeFunctionData({ abi: vaultV2Abi, data });
    const [adapter, marketData, assets] = args as [Address, `0x${string}`, bigint];
    const [params] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "loanToken", type: "address" },
            { name: "collateralToken", type: "address" },
            { name: "oracle", type: "address" },
            { name: "irm", type: "address" },
            { name: "lltv", type: "uint256" },
          ],
        },
      ],
      marketData,
    );
    return { functionName, adapter, collateral: params.collateralToken, assets };
  });
}

describe("toVaultV2Calls", () => {
  it("turns targets into deallocate-first deltas, maxUint256 takes what was freed", () => {
    const calls = decode(
      toVaultV2Calls(vault, [
        { marketParams: A.params, assets: 40n }, // -60
        { marketParams: IDLE.params, assets: 10n }, // -20 from idle, no call
        { marketParams: B.params, assets: maxUint256 }, // +80
      ]),
    );
    expect(calls).toEqual([
      {
        functionName: "deallocate",
        adapter: ADAPTER,
        collateral: A.params.collateralToken,
        assets: 60n,
      },
      {
        functionName: "allocate",
        adapter: ADAPTER,
        collateral: B.params.collateralToken,
        assets: 80n,
      },
    ]);
  });

  it("leaves surplus in the vault when idle is the maxUint256 sink", () => {
    const calls = decode(
      toVaultV2Calls(vault, [
        { marketParams: A.params, assets: 0n },
        { marketParams: IDLE.params, assets: maxUint256 },
      ]),
    );
    expect(calls).toEqual([
      {
        functionName: "deallocate",
        adapter: ADAPTER,
        collateral: A.params.collateralToken,
        assets: 100n,
      },
    ]);
  });

  it("emits nothing for unchanged markets and idle-only moves", () => {
    expect(
      toVaultV2Calls(vault, [
        { marketParams: A.params, assets: 100n },
        { marketParams: IDLE.params, assets: 0n },
      ]),
    ).toEqual([]);
  });

  it("routes v1 vaults to MetaMorpho reallocate", () => {
    const v1 = { ...vault, vaultType: undefined };
    expect(reallocateCall(v1, []).functionName).toBe("reallocate");
    expect(reallocateCall(vault, []).functionName).toBe("multicall");
  });

  it("describes v2 moves and v1 targets for logs", () => {
    const plan = [
      { marketParams: A.params, assets: 40n },
      { marketParams: B.params, assets: maxUint256 },
    ];
    expect(describeReallocation(vault, plan)).toEqual([
      {
        action: "deallocate",
        marketId: A.id,
        collateral: A.params.collateralToken,
        adapter: ADAPTER,
        assets: "60",
      },
      {
        action: "allocate",
        marketId: B.id,
        collateral: B.params.collateralToken,
        adapter: ADAPTER,
        assets: "60",
      },
    ]);
    expect(describeReallocation({ ...vault, vaultType: undefined }, plan)[1]).toMatchObject({
      action: "target",
      assets: "max",
    });
  });
});
