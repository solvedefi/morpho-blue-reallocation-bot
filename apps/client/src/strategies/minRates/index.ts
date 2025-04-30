import { Address, Hex, maxUint256, zeroAddress } from "viem";

import {
  getUtilization,
  min,
  getDepositableAmount,
  getWithdrawableAmount,
  rateToUtilization,
  percentToWad,
  getRateFromAPY,
  apyFromRate,
  utilizationToRate,
} from "../../utils/maths";
import { MarketAllocation, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";
import {
  marketsMinRates,
  vaultsDefaultMinRates,
  DEFAULT_MIN_RATE,
  marketsMinApsDeltaBips,
  vaultsDefaultMinApsDeltaBips,
  DEFAULT_MIN_APY_DELTA_BIPS,
} from "@morpho-blue-reallocation-bot/config";

export class MinRates implements Strategy {
  constructor() {}

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

      const apyDelta =
        apyFromRate(utilizationToRate(targetUtilization, marketData.rateAtTarget)) -
        apyFromRate(utilizationToRate(utilization, marketData.rateAtTarget));

      didExceedMinUtilizationDelta ||=
        Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) >
        this.getMinApyDeltaBips(marketData.chainId, vaultData.vaultAddress, marketData.id);
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

    if (vaultsDefaultMinRates[chainId]?.[vaultAddress] !== undefined)
      targetRate = vaultsDefaultMinRates[chainId][vaultAddress];

    if (marketsMinRates[chainId]?.[marketId] !== undefined)
      targetRate = marketsMinRates[chainId][marketId];

    return percentToWad(targetRate);
  }

  protected getMinApyDeltaBips(chainId: number, vaultAddress: Address, marketId: Hex) {
    let minApyDeltaBips = DEFAULT_MIN_APY_DELTA_BIPS;

    if (vaultsDefaultMinApsDeltaBips[chainId]?.[vaultAddress] !== undefined)
      minApyDeltaBips = vaultsDefaultMinApsDeltaBips[chainId][vaultAddress];

    if (marketsMinApsDeltaBips[chainId]?.[marketId] !== undefined)
      minApyDeltaBips = marketsMinApsDeltaBips[chainId][marketId];

    return minApyDeltaBips;
  }
}
