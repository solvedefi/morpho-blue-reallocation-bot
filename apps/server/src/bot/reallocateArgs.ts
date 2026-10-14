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

export interface VaultV2Move {
  action: "allocate" | "deallocate";
  marketId: Hex;
  adapter: Hex;
  params: MarketAllocation["marketParams"];
  assets: bigint;
}

/**
 * Translates MetaMorpho-style absolute targets into VaultV2 allocate/deallocate deltas,
 * deallocations first so they fund the allocations. Same semantics as v1 `reallocate`:
 * maxUint256 supplies whatever the other entries freed. The (virtual) idle market emits no
 * call: idle is the vault's token balance, so lowering its target frees funds and raising it
 * just leaves the remainder in the vault.
 */
export function planVaultV2Moves(
  vaultData: VaultData,
  allocations: MarketAllocation[],
): VaultV2Move[] {
  const deallocations: VaultV2Move[] = [];
  const allocationsOut: VaultV2Move[] = [];
  const fillRest: VaultV2Move[] = [];
  let freed = 0n;

  for (const { marketParams, assets } of allocations) {
    const id = marketIdFromParams(marketParams);
    const market = vaultData.marketsData.get(id);
    if (!market) throw new Error(`Market ${id} not found in vault data`);
    const isIdle = marketParams.collateralToken === zeroAddress;
    if (!isIdle && !market.adapter) throw new Error(`Market ${id} has no v2 adapter`);
    const move = { marketId: id, adapter: market.adapter ?? zeroAddress, params: marketParams };

    if (assets === maxUint256) {
      if (!isIdle) fillRest.push({ ...move, action: "allocate", assets: 0n });
    } else if (assets < market.vaultAssets) {
      const amount = market.vaultAssets - assets;
      freed += amount;
      if (!isIdle) deallocations.push({ ...move, action: "deallocate", assets: amount });
    } else if (assets > market.vaultAssets && !isIdle) {
      const amount = assets - market.vaultAssets;
      freed -= amount;
      allocationsOut.push({ ...move, action: "allocate", assets: amount });
    }
  }

  for (const entry of fillRest) {
    entry.assets = freed > 0n ? freed : 0n;
    freed -= entry.assets;
    allocationsOut.push(entry);
  }

  return [...deallocations, ...allocationsOut.filter((a) => a.assets > 0n)];
}

export function toVaultV2Calls(vaultData: VaultData, allocations: MarketAllocation[]): Hex[] {
  return planVaultV2Moves(vaultData, allocations).map((m) =>
    encodeV2(m.action, m.adapter, m.params, m.assets),
  );
}

/** What a reallocation will do on-chain, for logs: v2 deltas, or v1 targets. Bigints as strings. */
export function describeReallocation(vaultData: VaultData, allocations: MarketAllocation[]) {
  if (vaultData.vaultType === "morpho-v2") {
    return planVaultV2Moves(vaultData, allocations).map((m) => ({
      action: m.action,
      marketId: m.marketId,
      collateral: m.params.collateralToken,
      adapter: m.adapter,
      assets: String(m.assets),
    }));
  }
  return allocations.map((a) => ({
    action: "target",
    marketId: marketIdFromParams(a.marketParams),
    collateral: a.marketParams.collateralToken,
    assets: a.assets === maxUint256 ? "max" : String(a.assets),
  }));
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
