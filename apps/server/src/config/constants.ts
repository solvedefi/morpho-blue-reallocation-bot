// Strategy constants
export const DEFAULT_MIN_APY_DELTA_BIPS = 50;
export const DEFAULT_MIN_UTILIZATION_DELTA_BIPS = 250;
export const DEFAULT_MIN_APR_DELTA_BIPS = 50;

// Type for range configuration
export interface Range {
  min: number;
  max: number;
}

// Legacy exports from strategy configs (currently unused but kept for compatibility)
export const ALLOW_IDLE_REALLOCATION = true;
export const DEFAULT_APY_RANGE: Range = { min: 0, max: 10 };

// Empty maps for vault-specific configurations (moved to database)
export const vaultsMinUtilizationDeltaBips: Record<number, Record<string, number>> = {};
export const vaultsMinAprDeltaBips: Record<number, Record<string, number>> = {};
export const marketsApyRanges: Record<number, Record<string, Range>> = {};
export const marketsMinApsDeltaBips: Record<number, Record<string, number>> = {};
export const vaultsDefaultApyRanges: Record<number, Record<string, Range>> = {};
export const vaultsDefaultMinApsDeltaBips: Record<number, Record<string, number>> = {};
