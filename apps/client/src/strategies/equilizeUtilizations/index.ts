import { maxUint256, zeroAddress } from "viem";

import { getUtilization, min, wDivDown } from "../../utils/maths";
import { MarketAllocation, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";

import { getDepositableAmount, getWithdrawableAmount } from "./helpers";

export class EquilizeUtilizations implements Strategy {
  findReallocation(vaultData: VaultData) {
    const marketsData = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );

    const targetUtilization = wDivDown(
      marketsData.reduce((acc, marketData) => acc + marketData.state.totalBorrowAssets, 0n),
      marketsData.reduce((acc, marketData) => acc + marketData.state.totalSupplyAssets, 0n),
    );

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    for (const marketData of marketsData) {
      const utilization = getUtilization(marketData.state);
      if (utilization > targetUtilization) {
        totalDepositableAmount += getDepositableAmount(marketData, targetUtilization);
      } else {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, targetUtilization);
      }
    }

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

    if (toReallocate === 0n) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    const reallocation: MarketAllocation[] = [];

    for (const marketData of marketsData) {
      const utilization = getUtilization(marketData.state);

      if (utilization > targetUtilization) {
        const deposit = min(getDepositableAmount(marketData, targetUtilization), remainingDeposit);
        remainingDeposit -= deposit;

        reallocation.push({
          marketParams: marketData.params,
          assets: remainingDeposit === 0n ? maxUint256 : marketData.vaultAssets + deposit,
        });
      } else {
        const withdrawal = min(
          getWithdrawableAmount(marketData, targetUtilization),
          remainingWithdrawal,
        );
        remainingWithdrawal -= withdrawal;

        reallocation.push({
          marketParams: marketData.params,
          assets: marketData.vaultAssets - withdrawal,
        });
      }

      if (remainingWithdrawal === 0n && remainingDeposit === 0n) break;
    }

    return reallocation;
  }
}
