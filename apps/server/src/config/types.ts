import type { Address, Chain, Hex } from "viem";

export interface ChainConfig extends Config {
  chainId: number;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
  executionInterval: number;
}

export interface Config {
  chain: Chain;
  morpho: Address;
  adaptiveCurveIrm: Address;
  metaMorphoFactories: Address[];
}
