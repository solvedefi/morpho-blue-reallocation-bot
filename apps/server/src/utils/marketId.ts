import { encodeAbiParameters, keccak256, type Hex } from "viem";

import { MarketParams } from "./types";

export function marketIdFromParams(marketParams: MarketParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "loanToken", type: "address" },
            { name: "collateralToken", type: "address" },
            { name: "oracle", type: "address" },
            { name: "irm", type: "address" },
            { name: "lltv", type: "uint256" },
          ],
        },
      ],
      [
        {
          loanToken: marketParams.loanToken,
          collateralToken: marketParams.collateralToken,
          oracle: marketParams.oracle,
          irm: marketParams.irm,
          lltv: marketParams.lltv,
        },
      ],
    ),
  );
}
