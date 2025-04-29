import { Address, Hex, maxUint256, zeroAddress } from "viem";

import {
  getUtilization,
  min,
  getDepositableAmount,
  getWithdrawableAmount,
  rateToUtilization,
  percentToWad,
  getRateFromAPY,
} from "../../utils/maths";
import { MarketAllocation, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";
import {
  marketsDefaultMinRates,
  vaultsDefaultMinRates,
  DEFAULT_MIN_RATE,
} from "../../../../config/src/strategies/minRates";

export class MinRates implements Strategy {
  constructor(private readonly minUtilizationDeltaBips: number) {}

  findReallocation(vaultData: VaultData) {
    const idleMarket = vaultData.marketsData.find(
      (marketData) => marketData.params.collateralToken === zeroAddress,
    );

    const marketsData = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinUtilizationDelta = false; // (true if *at least one* market moves enough)
    // TODO: to estimate change in APR, we need `startRateAtTarget`, which we're not currently fetching or passing in
    // let didExceedMinAprDelta = false; // (true if *at least one* market moves enough)

    for (const marketData of marketsData) {
      const targetUtilization = rateToUtilization(
        getRateFromAPY(
          this.getTargetRate(marketData.chainId, vaultData.vaultAddress, marketData.id),
        ),
        marketData.rateAtTarget,
      );
      const utilization = getUtilization(marketData.state);
      if (utilization > targetUtilization) {
        totalDepositableAmount += getDepositableAmount(marketData, targetUtilization);
      } else {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, targetUtilization);
      }

      didExceedMinUtilizationDelta ||=
        Math.abs(Number((utilization - targetUtilization) / 1_000_000_000n) / 1e5) >
        this.minUtilizationDeltaBips;
    }

    let idleWithdrawal = 0n;
    let idleDeposit = 0n;

    if (idleMarket) {
      if (totalWithdrawableAmount > totalDepositableAmount) {
        idleDeposit = min(
          totalWithdrawableAmount - totalDepositableAmount,
          idleMarket.cap - idleMarket.vaultAssets,
        );
        totalDepositableAmount += idleDeposit;
      } else {
        idleWithdrawal = min(
          totalDepositableAmount - totalWithdrawableAmount,
          idleMarket.vaultAssets,
        );
        totalWithdrawableAmount += idleWithdrawal;
      }
    }

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

    if (toReallocate === 0n || !didExceedMinUtilizationDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    for (const marketData of marketsData) {
      const targetUtilization = rateToUtilization(
        getRateFromAPY(
          this.getTargetRate(marketData.chainId, vaultData.vaultAddress, marketData.id),
        ),
        marketData.rateAtTarget,
      );
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

    if (idleMarket) {
      if (idleWithdrawal > 0n) {
        withdrawals.push({
          marketParams: idleMarket.params,
          assets: idleWithdrawal,
        });
      }

      if (idleDeposit > 0n) {
        deposits.push({
          marketParams: idleMarket.params,
          assets: maxUint256,
        });
      }
    }
    return [...withdrawals, ...deposits];
  }

  protected getTargetRate(chainId: number, vaultAddress: Address, marketId: Hex) {
    let targetRate = DEFAULT_MIN_RATE;

    if (
      vaultsDefaultMinRates[chainId] !== undefined &&
      vaultsDefaultMinRates[chainId][vaultAddress] !== undefined
    ) {
      targetRate = vaultsDefaultMinRates[chainId][vaultAddress];
    }

    if (
      marketsDefaultMinRates[chainId] !== undefined &&
      marketsDefaultMinRates[chainId][marketId] !== undefined
    ) {
      targetRate = marketsDefaultMinRates[chainId][marketId];
    }

    return percentToWad(targetRate);
  }
}
