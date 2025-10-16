import {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import { Address, maxUint256, zeroAddress } from "viem";

import {
  getDepositableAmount,
  getWithdrawableAmount,
  getUtilization,
  min,
  wDivDown,
} from "../../utils/maths";
import { MarketAllocation, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";

export class EquilizeUtilizations implements Strategy {
  findReallocation(vaultData: VaultData) {
    console.log("inside equilizeUtilizations");

    const marketsData = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );

    const targetUtilization = wDivDown(
      marketsData.reduce((acc, marketData) => acc + marketData.state.totalBorrowAssets, 0n),
      marketsData.reduce((acc, marketData) => acc + marketData.state.totalSupplyAssets, 0n),
    );

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinUtilizationDelta = false; // (true if *at least one* market moves enough)
    // TODO: to estimate change in APR, we need `startRateAtTarget`, which we're not currently fetching or passing in
    // let didExceedMinAprDelta = false; // (true if *at least one* market moves enough)

    for (const marketData of marketsData) {
      console.log("marketData.state:");
      console.log(marketData.state.totalBorrowAssets);
      console.log(marketData.state.totalSupplyAssets);
      console.log(marketData.state.totalBorrowShares);
      console.log(marketData.state.totalSupplyShares);
      console.log(marketData.state.lastUpdate);
      console.log(marketData.state.fee);

      console.log("targetUtilization:", targetUtilization);

      const utilization = getUtilization(marketData.state);
      console.log("utilization:", utilization);
      if (utilization > targetUtilization) {
        totalDepositableAmount += getDepositableAmount(marketData, targetUtilization);
      } else {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, targetUtilization);
      }

      didExceedMinUtilizationDelta ||=
        Math.abs(Number((utilization - targetUtilization) / 1_000_000_000n) / 1e5) >
        this.getMinUtilizationDeltaBips(marketData.chainId, marketData.id);

      console.log();
    }

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

    console.log("toReallocate:", toReallocate);

    if (toReallocate === 0n || !didExceedMinUtilizationDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    for (const marketData of marketsData) {
      const utilization = getUtilization(marketData.state);

      if (utilization > targetUtilization) {
        const deposit = min(getDepositableAmount(marketData, targetUtilization), remainingDeposit);
        remainingDeposit -= deposit;

        deposits.push({
          marketParams: marketData.params,
          assets: remainingDeposit === 0n ? maxUint256 : marketData.vaultAssets + deposit,
        });
      } else {
        const withdrawal = min(
          getWithdrawableAmount(marketData, targetUtilization),
          remainingWithdrawal,
        );
        remainingWithdrawal -= withdrawal;

        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.vaultAssets - withdrawal,
        });
      }

      if (remainingWithdrawal === 0n && remainingDeposit === 0n) break;

      console.log("remainingWithdrawal:", remainingWithdrawal);
      console.log("remainingDeposit:", remainingDeposit);
      console.log();
    }

    const reallocation = [...withdrawals, ...deposits];

    console.log("reallocation:");
    console.log(reallocation);

    return reallocation;
  }

  private getMinUtilizationDeltaBips(chainId: number, vaultAddress: Address) {
    return (
      vaultsMinUtilizationDeltaBips[chainId]?.[vaultAddress] ?? DEFAULT_MIN_UTILIZATION_DELTA_BIPS
    );
  }
}
