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
    const marketsData = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );
    // const marketsData = vaultData.marketsData;

    const totalBorrowAssetsReduced = marketsData.reduce(
      (acc, marketData) => acc + marketData.state.totalBorrowAssets,
      0n,
    );
    const totalSupplyAssetsReduced = marketsData.reduce(
      (acc, marketData) => acc + marketData.state.totalSupplyAssets,
      0n,
    );
    console.log("totalBorrowAssetsReduced:", totalBorrowAssetsReduced);
    console.log("totalSupplyAssetsReduced:", totalSupplyAssetsReduced);

    const targetUtilization = wDivDown(totalBorrowAssetsReduced, totalSupplyAssetsReduced);
    console.log("targetUtilization:", targetUtilization);
    console.log();

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinUtilizationDelta = false; // (true if *at least one* market moves enough)
    // TODO: to estimate change in APR, we need `startRateAtTarget`, which we're not currently fetching or passing in
    // let didExceedMinAprDelta = false; // (true if *at least one* market moves enough)

    for (const marketData of marketsData) {
      console.log("chainId:", marketData.chainId);
      console.log("id:", marketData.id);
      console.log("params:");
      console.log("loanToken:", marketData.params.loanToken);
      console.log("collateralToken:", marketData.params.collateralToken);
      console.log("oracle:", marketData.params.oracle);
      console.log("irm:", marketData.params.irm);
      console.log("lltv:", marketData.params.lltv);
      console.log("state:");
      console.log("totalBorrowAssets:", marketData.state.totalBorrowAssets);
      console.log("totalSupplyAssets:", marketData.state.totalSupplyAssets);
      console.log("totalBorrowShares:", marketData.state.totalBorrowShares);
      console.log("totalSupplyShares:", marketData.state.totalSupplyShares);
      console.log("lastUpdate:", marketData.state.lastUpdate);
      console.log("fee:", marketData.state.fee);
      console.log("cap:", marketData.cap);
      console.log("vaultAssets:", marketData.vaultAssets);
      console.log("rateAtTarget:", marketData.rateAtTarget);

      const utilization = getUtilization(marketData.state);
      console.log("utilization:", utilization);
      if (utilization > targetUtilization) {
        totalDepositableAmount += getDepositableAmount(marketData, targetUtilization);
      } else {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, targetUtilization);
      }
      console.log("totalDepositableAmount:", totalDepositableAmount);
      console.log("totalWithdrawableAmount:", totalWithdrawableAmount);

      didExceedMinUtilizationDelta ||=
        Math.abs(Number((utilization - targetUtilization) / 1_000_000_000n) / 1e5) >
        this.getMinUtilizationDeltaBips(marketData.chainId, marketData.id);

      console.log("didExceedMinUtilizationDelta:", didExceedMinUtilizationDelta);

      console.log();
    }
    console.log();
    console.log("totalWithdrawableAmount:", totalWithdrawableAmount);
    console.log("totalDepositableAmount:", totalDepositableAmount);
    console.log("didExceedMinUtilizationDelta:", didExceedMinUtilizationDelta);
    console.log();

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);
    console.log("toReallocate:", toReallocate);

    if (toReallocate === 0n || !didExceedMinUtilizationDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    console.log("remainingWithdrawal:", remainingWithdrawal);
    console.log("remainingDeposit:", remainingDeposit);

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    console.log();
    console.log("=======================================");
    console.log("Calculating withdrawals and deposits...");
    console.log("=======================================");
    console.log();

    for (const marketData of marketsData) {
      const utilization = getUtilization(marketData.state);
      console.log("utilization:", utilization);

      if (utilization > targetUtilization) {
        const deposit = min(getDepositableAmount(marketData, targetUtilization), remainingDeposit);
        console.log("remainingDeposit:", remainingDeposit);
        console.log("deposit:", deposit);
        console.log("depositableAmount:", getDepositableAmount(marketData, targetUtilization));

        remainingDeposit -= deposit;
        console.log("remainingDeposit:", remainingDeposit);

        deposits.push({
          marketParams: marketData.params,
          assets: remainingDeposit === 0n ? maxUint256 : marketData.vaultAssets + deposit,
        });
      } else {
        const withdrawal = min(
          getWithdrawableAmount(marketData, targetUtilization),
          remainingWithdrawal,
        );
        console.log("remainingWithdrawal:", remainingWithdrawal);
        console.log("withdrawal:", withdrawal);
        console.log("withdrawableAmount:", getWithdrawableAmount(marketData, targetUtilization));

        remainingWithdrawal -= withdrawal;
        console.log("remainingWithdrawal:", remainingWithdrawal);

        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.vaultAssets - withdrawal,
        });

        console.log();
      }

      if (remainingWithdrawal === 0n && remainingDeposit === 0n) break;
    }

    console.log();
    console.log("withdrawals:");
    console.log(withdrawals);
    console.log("deposits:");
    console.log(deposits);

    const reallocation = [...withdrawals, ...deposits];

    // const filteredReallocation = reallocation.filter(
    //   (allocation) =>
    //     allocation.assets !==
    //     BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935"),
    // );

    // console.log("reallocation:");
    // console.log(filteredReallocation);

    console.log();
    console.log();
    console.log("reallocation:");
    console.log(reallocation);
    console.log();
    console.log();

    return reallocation;
  }

  private getMinUtilizationDeltaBips(chainId: number, vaultAddress: Address) {
    return (
      vaultsMinUtilizationDeltaBips[chainId]?.[vaultAddress] ?? DEFAULT_MIN_UTILIZATION_DELTA_BIPS
    );
  }
}
