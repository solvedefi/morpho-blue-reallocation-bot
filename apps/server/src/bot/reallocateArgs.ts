import { MarketAllocation } from "../utils/types";

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
