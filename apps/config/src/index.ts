/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable import-x/order */
import dotenv from "dotenv";
import type { Address, Chain, Hex } from "viem";

import { chainConfigs } from "./config";
import type { ChainConfig } from "./types";

import {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  DEFAULT_MIN_APR_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
  vaultsMinAprDeltaBips,
} from "./strategies/equilizeUtilizations";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  ALLOW_IDLE_REALLOCATION,
  DEFAULT_APY_RANGE,
  DEFAULT_MIN_APY_DELTA_BIPS,
  marketsApyRanges,
  marketsMinApsDeltaBips,
  vaultsDefaultApyRanges,
  vaultsDefaultMinApsDeltaBips,
} from "./strategies/apyRange";

dotenv.config();

export async function chainConfig(chainId: number): Promise<ChainConfig> {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`No config found for chainId ${String(chainId)}`);
  }

  const { rpcUrl, vaultWhitelist, reallocatorPrivateKey, executionInterval } = await getSecrets(
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

async function getSecretsFromAWS(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({
    region: "eu-west-2",
  });

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await client.send(command);
    return response.SecretString ?? "";
  } catch (error) {
    console.error("Error retrieving secret:", error);
    throw error;
  }
}

export async function getSecrets(chainId: number, chain?: Chain) {
  const defaultRpcUrl = chain?.rpcUrls.default.http[0];

  const useAWSSecretManager = process.env.USE_AWS_SECRETS ?? false;

  let reallocatorPrivateKey: string;
  if (useAWSSecretManager) {
    const reallocatorPrivateKeySecretName = process.env[`REALLOCATOR_PRIVATE_KEY`];
    if (!reallocatorPrivateKeySecretName) {
      throw new Error(
        `No reallocator private key secret name found for chainId ${String(chainId)}`,
      );
    }

    reallocatorPrivateKey = await getSecretsFromAWS(reallocatorPrivateKeySecretName);
    if (!reallocatorPrivateKey) {
      throw new Error(`No reallocator private key found for ${reallocatorPrivateKeySecretName}`);
    }
  } else {
    reallocatorPrivateKey = process.env[`REALLOCATOR_PRIVATE_KEY`] ?? "";
  }

  const rpcUrl = process.env[`RPC_URL_${String(chainId)}`] ?? defaultRpcUrl;
  const vaultWhitelist = process.env[`VAULT_WHITELIST_${String(chainId)}`]?.split(",") ?? [];
  const executionInterval = process.env[`EXECUTION_INTERVAL_${String(chainId)}`];

  if (!rpcUrl) {
    throw new Error(`No RPC URL found for chainId ${String(chainId)}`);
  }
  if (!reallocatorPrivateKey) {
    throw new Error(`No reallocator private key found for chainId ${String(chainId)}`);
  }
  if (vaultWhitelist.length === 0) {
    throw new Error(`No vault whitelist found for chainId ${String(chainId)}`);
  }
  if (!executionInterval) {
    throw new Error(`No execution interval found for chainId ${String(chainId)}`);
  }
  return {
    rpcUrl,
    vaultWhitelist: vaultWhitelist as Address[],
    reallocatorPrivateKey: reallocatorPrivateKey as Hex,
    executionInterval: Number(executionInterval),
  };
}

export {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
  DEFAULT_MIN_APR_DELTA_BIPS,
  vaultsMinAprDeltaBips,
  ALLOW_IDLE_REALLOCATION,
  DEFAULT_APY_RANGE,
  DEFAULT_MIN_APY_DELTA_BIPS,
  marketsApyRanges,
  marketsMinApsDeltaBips,
  vaultsDefaultApyRanges,
  vaultsDefaultMinApsDeltaBips,
};

export { chainConfigs, type ChainConfig };
