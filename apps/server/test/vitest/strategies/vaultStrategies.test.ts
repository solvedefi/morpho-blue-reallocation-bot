import { ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import { ApyRange, EquilizeUtilizations, VaultStrategies } from "../../../src/strategies";
import { type VaultData } from "../../../src/utils/types";

describe("VaultStrategies", () => {
  it("routes opted-in vaults to EqualizeUtilizations and the rest to ApyRange", () => {
    const apy = vi.spyOn(ApyRange.prototype, "findReallocation").mockReturnValue(ok(undefined));
    const eq = vi
      .spyOn(EquilizeUtilizations.prototype, "findReallocation")
      .mockReturnValue(ok(undefined));

    const eqVault = "0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B";
    const apyVault = "0x30B8A2c8E7Fa41e77b54b8FaF45c610e7aD909E3";
    const strategies = new VaultStrategies(
      {
        vaultRanges: {},
        marketRanges: {},
        allowIdleReallocation: true,
        defaultMinApy: 0,
        defaultMaxApy: 10,
      },
      [
        {
          address: eqVault,
          type: "morpho-v1",
          strategy: "equalizeUtilizations",
          targetUtilization: 90,
        },
        { address: apyVault, type: "morpho-v1", strategy: "apyRange", targetUtilization: null },
      ],
    );

    // address casing differs from the DB row on purpose
    void strategies.findReallocation({
      vaultAddress: eqVault.toLowerCase(),
    } as unknown as VaultData);
    void strategies.findReallocation({ vaultAddress: apyVault } as unknown as VaultData);

    expect(eq).toHaveBeenCalledTimes(1);
    expect(apy).toHaveBeenCalledTimes(1);
  });
});
