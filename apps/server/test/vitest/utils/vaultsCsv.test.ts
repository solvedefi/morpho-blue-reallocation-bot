import { describe, expect, it } from "vitest";

import { parseVaultsCsv } from "../../../src/utils/vaultsCsv";

describe("parseVaultsCsv", () => {
  it("keeps morpho rows, checksums addresses and skips everything else", () => {
    const csv = [
      "name,chain,address,type,asset,ltv,cap",
      "",
      "Re7 USDC,worldchain,0xb1e80387ebe53ff75a89736097d34dc8d9e9045b,morpho-v1,,,",
      "Morpho V2 Re7 WETH,mainnet,0x5181cd56c2c71d20094d23d43f4d6362834643ae,morpho-v2,,,",
      "# comment",
      "Re7 USDC Core,starknet,0x03976cac265a12609934089004df458ea29c776d77da423c96dc761d09d24124,vesu,,,",
      ",,,,xWBTC,78,250285",
      "Re7 X,nowhere,0x5181cd56c2c71d20094d23d43f4d6362834643ae,morpho-v1,,,",
      "Re7 Y,base,0xnotanaddress,morpho-v1,,,",
    ].join("\n");

    const { vaults, warnings } = parseVaultsCsv(csv);

    expect(vaults).toEqual([
      {
        chainId: 480,
        address: "0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B",
        name: "Re7 USDC",
        type: "morpho-v1",
      },
      {
        chainId: 1,
        address: "0x5181cD56C2C71d20094d23d43F4D6362834643AE",
        name: "Morpho V2 Re7 WETH",
        type: "morpho-v2",
      },
    ]);
    expect(warnings).toHaveLength(2);
  });
});
