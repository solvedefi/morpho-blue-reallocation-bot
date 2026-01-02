import { Result } from "neverthrow";
import { MaybePromise } from "viem";

import { MarketAllocation, VaultData } from "../utils/types";

/**
 * Strategies are used to find reallocations on a vault.
 * You might implement your own strategy that serves your needs.
 * All strategies must implement this interface.
 */
export interface Strategy {
  findReallocation(
    vaultData: VaultData,
  ): MaybePromise<Result<MarketAllocation[] | undefined, Error>>;
}
