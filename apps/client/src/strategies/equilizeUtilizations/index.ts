import {
  DEFAULT_MIN_UTILIZATION_DELTA_BIPS,
  vaultsMinUtilizationDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import { Address, maxUint256, zeroAddress } from "viem";

import {
  WAD,
  getDepositableAmount,
  getWithdrawableAmount,
  getUtilization,
  min,
  wDivDown,
} from "../../utils/maths";
import { MarketAllocation, VaultData, VaultMarketData } from "../../utils/types";
import { Strategy } from "../strategy";

const WSRUSD_TOKEN_ADDRESS = "0x4809010926aec940b550D34a46A52739f996D75D";

export class EquilizeUtilizations implements Strategy {
  findReallocation(vaultData: VaultData) {
    // filter out wsrUSD market
    const marketsData = vaultData.marketsData.filter((marketData) => {
      return (
        marketData.params.collateralToken !== zeroAddress &&
        marketData.params.collateralToken !== WSRUSD_TOKEN_ADDRESS &&
        marketData.vaultAssets !== 0n
      );
    });

    let wsrUSDMarketData: VaultMarketData | undefined;
    let wsrUSDAssets = 0n;
    for (const marketData of vaultData.marketsData) {
      if (marketData.params.collateralToken === WSRUSD_TOKEN_ADDRESS) {
        wsrUSDMarketData = marketData;

        // keep util at 100% by withdrawing all available liquidity
        wsrUSDAssets = marketData.state.totalBorrowAssets + 10n ** 6n;
        break;
      }
    }

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

    let withdrawals: MarketAllocation[] = [];
    let deposits: MarketAllocation[] = [];

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

    withdrawals = [];
    if (wsrUSDMarketData) {
      withdrawals.push({
        marketParams: wsrUSDMarketData.params,
        assets: wsrUSDAssets,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
    deposits = [deposits![deposits.length - 1]!];

    for (const withdrawalOrDeposit of [...withdrawals, ...deposits]) {
      console.log("loan token", withdrawalOrDeposit.marketParams.loanToken);
      console.log("collateral token", withdrawalOrDeposit.marketParams.collateralToken);
      console.log("irm", withdrawalOrDeposit.marketParams.irm);
      console.log("oracle", withdrawalOrDeposit.marketParams.oracle);
      console.log("lltv", withdrawalOrDeposit.marketParams.lltv);
      console.log("assets", withdrawalOrDeposit.assets);
      console.log("--------------------------------");
    }

    return [...withdrawals, ...deposits];
  }

  private getMinUtilizationDeltaBips(chainId: number, vaultAddress: Address) {
    return (
      vaultsMinUtilizationDeltaBips[chainId]?.[vaultAddress] ?? DEFAULT_MIN_UTILIZATION_DELTA_BIPS
    );
  }
}
