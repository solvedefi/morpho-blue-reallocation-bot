import { encodeAbiParameters, parseAbiParameters, type Hex } from "viem";

import type { MarketParams } from "../../utils/types";

/**
 * Encode V1 market params as the `data` payload for `VaultV2.allocate` /
 * `deallocate` calls dispatched through a `MorphoMarketV1AdapterV2`.
 * Mirrors the upstream template's `encodeMarketParamsV1`.
 */
export function encodeMarketParamsV1(p: MarketParams): Hex {
  return encodeAbiParameters(parseAbiParameters("address,address,address,address,uint256"), [
    p.loanToken,
    p.collateralToken,
    p.oracle,
    p.irm,
    p.lltv,
  ]);
}
