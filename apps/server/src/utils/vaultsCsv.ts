import { existsSync, readFileSync } from "node:fs";

import { type Address, getAddress, isAddress } from "viem";

export const VAULTS_CSV_URL = new URL(
  "../../../../vaults-source-of-truth/vaults.csv",
  import.meta.url,
);

export const MORPHO_VAULT_TYPES = ["morpho-v1", "morpho-v2"] as const;
export type MorphoVaultType = (typeof MORPHO_VAULT_TYPES)[number];

// Only morpho-v1 vaults are reallocated; morpho-v2 is stored but not run.
export const REALLOCATABLE_VAULT_TYPE: MorphoVaultType = "morpho-v1";

// vaults.csv chain names -> chain ids
const CHAIN_NAME_TO_ID: Record<string, number> = {
  mainnet: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  worldchain: 480,
  unichain: 130,
  berachain: 80094,
  soneium: 1868,
  lisk: 1135,
  plume: 98866,
  tac: 239,
  katana: 747474,
  injective: 1776,
};

export interface CsvVault {
  chainId: number;
  address: Address;
  name: string;
  type: MorphoVaultType;
}

/**
 * Parses vaults.csv (`name,chain,address,type,...`) into Morpho vaults.
 * Blank lines, `#` comments, continuation rows and non-Morpho types are skipped.
 */
export function parseVaultsCsv(csv: string): { vaults: CsvVault[]; warnings: string[] } {
  const vaults: CsvVault[] = [];
  const warnings: string[] = [];

  for (const [i, raw] of csv.split("\n").slice(1).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const [name, chain, address, type] = line.split(",").map((s) => s.trim());
    if (!name || !chain || !address || !type) continue;
    if (!(MORPHO_VAULT_TYPES as readonly string[]).includes(type)) continue;

    const chainId = CHAIN_NAME_TO_ID[chain];
    if (chainId === undefined) {
      warnings.push(`line ${String(i + 2)}: unknown chain "${chain}" for ${name}`);
      continue;
    }
    if (!isAddress(address, { strict: false })) {
      warnings.push(`line ${String(i + 2)}: invalid address "${address}" for ${name}`);
      continue;
    }

    vaults.push({ chainId, address: getAddress(address), name, type: type as MorphoVaultType });
  }

  return { vaults, warnings };
}

export function loadVaultsCsv(): { vaults: CsvVault[]; warnings: string[] } {
  if (!existsSync(VAULTS_CSV_URL)) {
    throw new Error(
      `${VAULTS_CSV_URL.pathname} not found. Run: git submodule update --init --remote`,
    );
  }
  return parseVaultsCsv(readFileSync(VAULTS_CSV_URL, "utf-8"));
}
