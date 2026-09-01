import { Result } from "neverthrow";

import { Reallocation, VaultV2Data } from "../contracts/typesV2";

/**
 * V2 strategy interface — operates on `VaultV2Data` and returns a
 * V2-shaped `Reallocation` (separate `allocations` and `deallocations`
 * arrays of adapter-targeted actions). Distinct from the V1 `Strategy`
 * interface in `../strategies/strategy.ts` because the I/O shapes differ.
 *
 * Returning `undefined` means "no reallocation needed this tick".
 */
export interface StrategyV2 {
  findReallocation(vaultData: VaultV2Data): Result<Reallocation | undefined, Error>;
}
