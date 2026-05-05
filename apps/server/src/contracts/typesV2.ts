import type { Address, Hex } from "viem";

import type { MarketParams, MarketState } from "../utils/types";

// Caps on a V1 market reached through a V2 adapter — V2 supports both an
// absolute (asset-denominated) and a relative (fraction of the vault) cap.
export interface Caps {
  absolute: bigint;
  relative: bigint;
}

// Per-market data as seen by a V2 vault through a `MorphoMarketV1AdapterV2`
// adapter. Names mirror the upstream template
// (morpho-org/vault-v2-reallocation-bot:apps/client/src/utils/types.ts) so
// porting strategies stays mechanical.
export interface MarketV1Data {
  chainId: number;
  id: Hex;
  params: MarketParams;
  state: MarketState;
  caps: Caps;
  vaultAssets: bigint;
  rateAtTarget: bigint;
}

export interface VaultV2MarketV1Data {
  adapterAddress: Address;
  markets: MarketV1Data[];
}

export interface VaultV2Data {
  vaultAddress: Address;
  totalAssets: bigint;
  idleAssets: bigint;
  marketsV1Data: VaultV2MarketV1Data;
}

// A single V2 reallocation step — encodes a call to `allocate` or
// `deallocate` on the V2 vault, dispatched through a specific adapter.
export interface ReallocationAction {
  adapterAddress: Address;
  data: Hex;
  assets: bigint;
}

export interface Reallocation {
  allocations: ReallocationAction[];
  deallocations: ReallocationAction[];
}
