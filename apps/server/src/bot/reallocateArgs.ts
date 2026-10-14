import { encodeAbiParameters, encodeFunctionData, maxUint256, zeroAddress, type Hex } from "viem";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { vaultV2Abi } from "../../abis/VaultV2.js";
import { marketIdFromParams } from "../utils/marketId";
import { MarketAllocation, VaultData } from "../utils/types";

export type ReallocateArgs = readonly [
  readonly {
    marketParams: {
      loanToken: `0x${string}`;
      collateralToken: `0x${string}`;
      oracle: `0x${string}`;
      irm: `0x${string}`;
      lltv: bigint;
    };
    assets: bigint;
  }[],
];

export function toReallocateArgs(allocations: MarketAllocation[]): ReallocateArgs {
  return [allocations] as unknown as ReallocateArgs;
}

const marketParamsAbi = [
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
] as const;

/**
 * Translates MetaMorpho-style absolute targets into VaultV2 allocate/deallocate deltas,
 * deallocations first so they fund the allocations. Same semantics as v1 `reallocate`:
 * maxUint256 supplies whatever the other entries freed. The (virtual) idle market emits no
 * call: idle is the vault's token balance, so lowering its target frees funds and raising it
 * just leaves the remainder in the vault.
 */
export function toVaultV2Calls(vaultData: VaultData, allocations: MarketAllocation[]): Hex[] {
  const deallocations: Hex[] = [];
  const allocationsOut: {
    adapter: Hex;
    params: MarketAllocation["marketParams"];
    assets: bigint;
  }[] = [];
  const fillRest: typeof allocationsOut = [];
  let freed = 0n;

  for (const { marketParams, assets } of allocations) {
    const id = marketIdFromParams(marketParams);
    const market = vaultData.marketsData.get(id);
    if (!market) throw new Error(`Market ${id} not found in vault data`);
    const isIdle = marketParams.collateralToken === zeroAddress;
    if (!isIdle && !market.adapter) throw new Error(`Market ${id} has no v2 adapter`);
    const adapter = market.adapter ?? zeroAddress;

    if (assets === maxUint256) {
      if (!isIdle) fillRest.push({ adapter, params: marketParams, assets: 0n });
    } else if (assets < market.vaultAssets) {
      const amount = market.vaultAssets - assets;
      freed += amount;
      if (!isIdle) deallocations.push(encodeV2("deallocate", adapter, marketParams, amount));
    } else if (assets > market.vaultAssets && !isIdle) {
      const amount = assets - market.vaultAssets;
      freed -= amount;
      allocationsOut.push({ adapter, params: marketParams, assets: amount });
    }
  }

  for (const entry of fillRest) {
    entry.assets = freed > 0n ? freed : 0n;
    freed -= entry.assets;
    allocationsOut.push(entry);
  }

  return [
    ...deallocations,
    ...allocationsOut
      .filter((a) => a.assets > 0n)
      .map((a) => encodeV2("allocate", a.adapter, a.params, a.assets)),
  ];
}

function encodeV2(
  functionName: "allocate" | "deallocate",
  adapter: Hex,
  params: MarketAllocation["marketParams"],
  assets: bigint,
): Hex {
  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName,
    args: [adapter, encodeAbiParameters(marketParamsAbi, [params]), assets],
  });
}

/** Contract call executing `allocations` on the vault, for simulateContract / encodeFunctionData. */
export function reallocateCall(vaultData: VaultData, allocations: MarketAllocation[]) {
  return vaultData.vaultType === "morpho-v2"
    ? {
        abi: vaultV2Abi,
        functionName: "multicall" as const,
        args: [toVaultV2Calls(vaultData, allocations)] as const,
      }
    : {
        abi: metaMorphoAbi,
        functionName: "reallocate" as const,
        args: toReallocateArgs(allocations),
      };
}

export type ReallocateCall = ReturnType<typeof reallocateCall>;
