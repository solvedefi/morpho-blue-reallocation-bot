/* eslint-disable import-x/order */
import dotenv from "dotenv";
import type { Address, Chain, Hex } from "viem";

import { chainConfigs } from "./config";
import type { ChainConfig } from "./types";

dotenv.config();

export function chainConfig(chainId: number): ChainConfig {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`No config found for chainId ${chainId}`);
  }

  const { rpcUrl, vaultWhitelist, reallocatorPrivateKey, executionInterval } = getSecrets(
    chainId,
    config.chain,
  );
  return {
    ...config,
    chainId,
    rpcUrl,
    reallocatorPrivateKey,
    vaultWhitelist,
    executionInterval,
  };
}

export function getSecrets(chainId: number, chain?: Chain) {
  const defaultRpcUrl = chain?.rpcUrls.default.http[0];

  const rpcUrl = process.env[`RPC_URL_${chainId}`] ?? defaultRpcUrl;
  const vaultWhitelist = process.env[`VAULT_WHITELIST_${chainId}`]?.split(",") ?? [];
  const reallocatorPrivateKey = process.env[`REALLOCATOR_PRIVATE_KEY_${chainId}`];
  const executionInterval = process.env[`EXECUTION_INTERVAL_${chainId}`];

  if (!rpcUrl) {
    throw new Error(`No RPC URL found for chainId ${chainId}`);
  }
  if (!reallocatorPrivateKey) {
    throw new Error(`No reallocator private key found for chainId ${chainId}`);
  }
  if (!vaultWhitelist) {
    throw new Error(`No vault whitelist found for chainId ${chainId}`);
  }
  if (!executionInterval) {
    throw new Error(`No execution interval found for chainId ${chainId}`);
  }
  return {
    rpcUrl,
    vaultWhitelist: vaultWhitelist as Address[],
    reallocatorPrivateKey: reallocatorPrivateKey as Hex,
    executionInterval: Number(executionInterval),
  };
}

import {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  DEFAULT_MIN_APR_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
  vaultsMinAprDeltaBips,
} from "./strategies/equilizeUtilizations";

export {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
  DEFAULT_MIN_APR_DELTA_BIPS,
  vaultsMinAprDeltaBips,
};
export { chainConfigs, type ChainConfig };
