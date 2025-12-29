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
  morpho: {
    address: Address;
    startBlock: number;
  };
  adaptiveCurveIrm: {
    address: Address;
    startBlock: number;
  };
  metaMorphoFactories: {
    addresses: Address[];
    startBlock: number;
  };
}
