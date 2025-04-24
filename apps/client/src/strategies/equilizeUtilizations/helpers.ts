import { getDepositToUtilization, getWithdrawalToUtilization, min } from "../../utils/maths";
import { VaultMarketData } from "../../utils/types";

export function getWithdrawableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getWithdrawalToUtilization(marketData.state, targetUtilization),
    marketData.vaultAssets,
  );
}

export function getDepositableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getDepositToUtilization(marketData.state, targetUtilization),
    marketData.cap - marketData.vaultAssets,
  );
}
