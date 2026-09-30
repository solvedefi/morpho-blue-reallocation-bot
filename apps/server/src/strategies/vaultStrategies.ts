import { type Address } from "viem";

import { type ApyConfiguration, type WhitelistedVault } from "../database/DatabaseClient";
import { type VaultData } from "../utils/types";

import { ApyRange } from "./apyRange/ApyRangeStrategy";
import { EquilizeUtilizations } from "./equilizeUtilizations/EquilizeUtilizationsStrategy";
import { type Strategy } from "./strategy";

export const VAULT_STRATEGIES = ["apyRange", "equalizeUtilizations"] as const;
export type VaultStrategyName = (typeof VAULT_STRATEGIES)[number];

/**
 * Routes each vault to the strategy chosen for it. ApyRange is the default and keeps
 * its own vault/market-level ranges; EqualizeUtilizations is opt-in per vault only.
 */
export class VaultStrategies implements Strategy {
  private apyRange: ApyRange;
  private equalizeUtilizations: EquilizeUtilizations;
  private equalizeVaults: Set<string>;

  constructor(apyConfig: ApyConfiguration, vaults: WhitelistedVault[]) {
    this.apyRange = new ApyRange(apyConfig);
    const equalize = vaults.filter((v) => v.strategy === "equalizeUtilizations");
    this.equalizeVaults = new Set(equalize.map((v) => key(v.address)));
    this.equalizeUtilizations = new EquilizeUtilizations(
      new Map(
        equalize.flatMap((v) =>
          // percent with 2 decimals -> WAD (90 -> 0.9e18)
          v.targetUtilization === null
            ? []
            : [[key(v.address), BigInt(Math.round(v.targetUtilization * 100)) * 10n ** 14n]],
        ),
      ),
    );
  }

  findReallocation(vaultData: VaultData) {
    return this.equalizeVaults.has(key(vaultData.vaultAddress))
      ? this.equalizeUtilizations.findReallocation(vaultData)
      : this.apyRange.findReallocation(vaultData);
  }
}

const key = (address: Address) => address.toLowerCase();
