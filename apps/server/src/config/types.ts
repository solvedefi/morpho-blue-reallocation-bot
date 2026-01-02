import type { Address, Chain } from "viem";

/**
 * Chain infrastructure configuration - addresses of deployed contracts
 */
export interface Config {
  chain: Chain;
  morpho: Address;
  adaptiveCurveIrm: Address;
  metaMorphoFactories: Address[];
}
