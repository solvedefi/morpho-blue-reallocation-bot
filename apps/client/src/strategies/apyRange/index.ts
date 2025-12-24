import {
  ALLOW_IDLE_REALLOCATION,
  DEFAULT_APY_RANGE,
  DEFAULT_MIN_APY_DELTA_BIPS,
  marketsApyRanges,
  marketsMinApsDeltaBips,
  vaultsDefaultApyRanges,
  vaultsDefaultMinApsDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, encodeAbiParameters, keccak256, maxUint256, zeroAddress } from "viem";

import { Range } from "../../../../config/dist/strategies/apyRange";
import {
  apyToRate,
  getDepositableAmount,
  getWithdrawableAmount,
  getUtilization,
  min,
  percentToWad,
  rateToApy,
  rateToUtilization,
  utilizationToRate,
} from "../../utils/maths";
import { MarketAllocation, MarketParams, VaultData, VaultMarketData } from "../../utils/types";
import { Strategy } from "../strategy";

/**
 * ApyRange Strategy
 *
 * This strategy maintains the APY of each market within a target range.
 * - If APY > max: Suggests depositing more assets to lower utilization and APY.
 * - If APY < min: Suggests withdrawing assets to increase utilization and APY.
 *
 * Adaptive IRM Handling:
 * If a market's maximum possible rate (at 100% utilization) is still below the target range's maximum,
 * the strategy pushes the market to 100% utilization. This encourages the Morpho Adaptive Curve IRM
 * to shift the entire rate curve upwards over time, eventually allowing the market to reach the
 * desired higher APY levels.
 */
export class ApyRange implements Strategy {
  findReallocation(vaultData: VaultData) {
    const marketsDataArray = Array.from(vaultData.marketsData.values());

    const idleMarket = marketsDataArray.find(
      (marketData) => marketData.params.collateralToken === zeroAddress,
    );

    const marketsData = marketsDataArray
      .filter((marketData) => marketData.params.collateralToken !== zeroAddress)
      .filter(
        (marketData) =>
          marketData.params.collateralToken !== "0x316cd39632Cac4F4CdfC21757c4500FE12f64514", // wsrUSD on berachain
      )
      .filter(
        (marketData) =>
          marketData.params.collateralToken !==
          ("0x0BBcc2C1991d0aF8ec6A5eD922e6f5606923fE15" as Address), // wsrUSD on plume
      )
      .filter(
        (marketData) =>
          marketData.params.collateralToken !==
          ("0x4809010926aec940b550D34a46A52739f996D75D" as Address), // wsrUSD on worldchain
      )
      .filter((marketData) => marketData.state.totalSupplyAssets !== 0n)
      .filter((marketData) => marketData.state.totalBorrowAssets !== 0n)
      .filter((marketData) => marketData.vaultAssets !== 0n);

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinApyDelta = false; // (true if *at least one* market moves enough)
    const util100ReallocationsMap = new Map<Hex, VaultMarketData>();

    for (const marketData of marketsData) {
      const apyRange = this.getApyRange(marketData.chainId, vaultData.vaultAddress, marketData.id);

      const upperUtilizationBound = rateToUtilization(
        apyToRate(apyRange.max),
        marketData.rateAtTarget,
      );
      const lowerUtilizationBound = rateToUtilization(
        apyToRate(apyRange.min),
        marketData.rateAtTarget,
      );

      // Check if we need to push to 100% utilization to trigger Adaptive IRM curve shift.
      // This happens when even at 100% utilization, the current APY would be below our target range.
      if (
        marketData.rateAt100Utilization &&
        rateToApy(marketData.rateAt100Utilization) < apyRange.max
      ) {
        const amountToWithdraw =
          marketData.state.totalSupplyAssets - marketData.state.totalBorrowAssets;
        totalDepositableAmount += amountToWithdraw;

        util100ReallocationsMap.set(marketData.id, marketData);
        didExceedMinApyDelta = true;

        continue;
      } else {
        // normal calculations if a market can have rates from the config
        const utilization = getUtilization(marketData.state);

        if (utilization > upperUtilizationBound) {
          totalDepositableAmount += getDepositableAmount(marketData, upperUtilizationBound);

          const apyDelta =
            rateToApy(utilizationToRate(upperUtilizationBound, marketData.rateAtTarget)) -
            rateToApy(utilizationToRate(utilization, marketData.rateAtTarget));

          didExceedMinApyDelta ||=
            Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) >
            this.getMinApyDeltaBips(marketData.chainId, vaultData.vaultAddress, marketData.id);
        } else if (utilization < lowerUtilizationBound) {
          totalWithdrawableAmount += getWithdrawableAmount(marketData, lowerUtilizationBound);

          const apyDelta =
            rateToApy(utilizationToRate(lowerUtilizationBound, marketData.rateAtTarget)) -
            rateToApy(utilizationToRate(utilization, marketData.rateAtTarget));

          didExceedMinApyDelta ||=
            Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) >
            this.getMinApyDeltaBips(marketData.chainId, vaultData.vaultAddress, marketData.id);
        }
      }
    }

    let idleWithdrawal = 0n;
    let idleDeposit = 0n;
    if (idleMarket) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (totalWithdrawableAmount > totalDepositableAmount && ALLOW_IDLE_REALLOCATION) {
        idleDeposit = min(
          totalWithdrawableAmount - totalDepositableAmount,
          idleMarket.cap - idleMarket.vaultAssets,
        );
        totalDepositableAmount += idleDeposit;
      } else if (totalDepositableAmount > totalWithdrawableAmount) {
        idleWithdrawal = min(
          totalDepositableAmount - totalWithdrawableAmount,
          idleMarket.vaultAssets,
        );
        totalWithdrawableAmount += idleWithdrawal;
      }
    }

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);
    if (toReallocate === 0n || !didExceedMinApyDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    for (const marketData of marketsData) {
      const apyRange = this.getApyRange(marketData.chainId, vaultData.vaultAddress, marketData.id);

      const upperUtilizationBound = rateToUtilization(
        apyToRate(apyRange.max),
        marketData.rateAtTarget,
      );
      const lowerUtilizationBound = rateToUtilization(
        apyToRate(apyRange.min),
        marketData.rateAtTarget,
      );
      const utilization = getUtilization(marketData.state);

      if (
        marketData.rateAt100Utilization &&
        rateToApy(marketData.rateAt100Utilization) < apyRange.max
      ) {
        // We push utilization to 100% so that the Adaptive IRM curve can shift up and introduce higher rates.
        // This is done by withdrawing everything except what is needed to cover current borrows.
        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.state.totalBorrowAssets,
        });
      } else {
        if (utilization > upperUtilizationBound) {
          const deposit = min(
            getDepositableAmount(marketData, upperUtilizationBound),
            remainingDeposit,
          );
          remainingDeposit -= deposit;

          deposits.push({
            marketParams: marketData.params,
            assets: remainingDeposit === 0n ? maxUint256 : marketData.vaultAssets + deposit,
          });
        } else if (utilization < lowerUtilizationBound) {
          const withdrawal = min(
            getWithdrawableAmount(marketData, lowerUtilizationBound),
            remainingWithdrawal,
          );
          remainingWithdrawal -= withdrawal;

          withdrawals.push({
            marketParams: marketData.params,
            assets: marketData.vaultAssets - withdrawal,
          });
        }
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

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (idleDeposit > 0n && ALLOW_IDLE_REALLOCATION) {
        deposits.push({
          marketParams: idleMarket.params,
          assets: maxUint256,
        });
      }
    }

    const reallocations = [...withdrawals, ...deposits];

    // console.log();
    // for (const reallocation of reallocations) {
    //   const marketId = this.calculateMarketId(reallocation.marketParams);
    //   const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;
    //   const rate = vaultData.marketsData.get(marketId)?.rate ?? 0n;
    //   const rateAt100Utilization = vaultData.marketsData.get(marketId)?.rateAt100Utilization ?? 0n;

    //   console.log("reallocation.marketId:", marketId);
    //   console.log(
    //     "reallocation.marketParams.collateralToken:",
    //     reallocation.marketParams.collateralToken,
    //   );
    //   console.log("reallocation.marketParams.loanToken:", reallocation.marketParams.loanToken);
    //   console.log("reallocation.marketParams.oracle:", reallocation.marketParams.oracle);
    //   console.log("reallocation.marketParams.irm:", reallocation.marketParams.irm);
    //   console.log("reallocation.marketParams.lltv:", reallocation.marketParams.lltv);
    //   console.log("reallocation.assets:", reallocation.assets);
    //   console.log("cap:", cap);
    //   console.log("rate:", rate);
    //   console.log("rateAt100Utilization:", rateAt100Utilization);
    //   console.log("cap is more than assets:", cap > reallocation.assets);

    //   console.log();
    // }

    // console.log();
    // console.log("reallocation.length:", reallocations.length);

    const reallocationFilteredByCap = reallocations.filter((reallocation) => {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;

      // maxUint256 is a special value meaning "deposit all remaining", so exempt it from cap check
      return reallocation.assets === maxUint256 || cap > reallocation.assets;
    });

    // console.log("reallocationFilteredByCap.length:", reallocationFilteredByCap.length);
    // console.log();

    return reallocationFilteredByCap;
  }

  protected getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let apyRange: Range = DEFAULT_APY_RANGE;

    if (vaultsDefaultApyRanges[chainId]?.[vaultAddress] !== undefined)
      apyRange = vaultsDefaultApyRanges[chainId][vaultAddress];

    if (marketsApyRanges[chainId]?.[marketId] !== undefined)
      apyRange = marketsApyRanges[chainId][marketId];

    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }

  protected getMinApyDeltaBips(chainId: number, vaultAddress: Address, marketId: Hex) {
    let minApyDeltaBips = DEFAULT_MIN_APY_DELTA_BIPS;

    if (vaultsDefaultMinApsDeltaBips[chainId]?.[vaultAddress] !== undefined)
      minApyDeltaBips = vaultsDefaultMinApsDeltaBips[chainId][vaultAddress];

    if (marketsMinApsDeltaBips[chainId]?.[marketId] !== undefined)
      minApyDeltaBips = marketsMinApsDeltaBips[chainId][marketId];

    return minApyDeltaBips;
  }

  private calculateMarketId(marketParams: MarketParams): Hex {
    return keccak256(
      encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "loanToken", type: "address" },
              { name: "collateralToken", type: "address" },
              { name: "oracle", type: "address" },
              { name: "irm", type: "address" },
              { name: "lltv", type: "uint256" },
            ],
          },
        ],
        [
          {
            loanToken: marketParams.loanToken,
            collateralToken: marketParams.collateralToken,
            oracle: marketParams.oracle,
            irm: marketParams.irm,
            lltv: marketParams.lltv,
          },
        ],
      ),
    );
  }
}
