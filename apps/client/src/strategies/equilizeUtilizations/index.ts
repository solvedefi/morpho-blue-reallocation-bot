import {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import { Address, Client, erc20Abi, maxUint256, zeroAddress } from "viem";
import { readContract } from "viem/actions";

import {
  WAD,
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
    const marketsData = vaultData.marketsData.filter((marketData) => {
      return (
        // idle market
        marketData.params.collateralToken !== zeroAddress &&
        // markets with no allocations
        marketData.vaultAssets !== 0n &&
        // wsrUSD on plume
        marketData.params.collateralToken !== "0x0BBcc2C1991d0aF8ec6A5eD922e6f5606923fE15" &&
        // wsrUSD on worldchain
        marketData.params.collateralToken !== "0x4809010926aec940b550D34a46A52739f996D75D"
      );
    });

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
      const utilization = getUtilization(marketData.state);
      if (utilization > targetUtilization) {
        totalDepositableAmount += getDepositableAmount(marketData, targetUtilization);
      } else {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, targetUtilization);
      }

      didExceedMinUtilizationDelta ||=
        Math.abs(Number((utilization - targetUtilization) / 1_000_000_000n) / 1e5) >
        this.getMinUtilizationDeltaBips(marketData.chainId, marketData.id);
    }

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

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
    }

    return [...withdrawals, ...deposits];
  }

  private getMinUtilizationDeltaBips(chainId: number, vaultAddress: Address) {
    return (
      vaultsMinUtilizationDeltaBips[chainId]?.[vaultAddress] ?? DEFAULT_MIN_UTILIZATION_DELTA_BIPS
    );
  }
}
