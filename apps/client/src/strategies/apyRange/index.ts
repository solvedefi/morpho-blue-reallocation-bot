import { DEFAULT_MIN_APY_DELTA_BIPS } from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, encodeAbiParameters, keccak256, maxUint256, zeroAddress } from "viem";

import { ApyConfiguration } from "../../database";
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
import { MarketAllocation, MarketParams, VaultData } from "../../utils/types";
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
  private config: ApyConfiguration;

  constructor(config: ApyConfiguration) {
    this.config = config;
  }
  findReallocation(vaultData: VaultData) {
    const marketsDataArray = Array.from(vaultData.marketsData.values());

    // console.log(
    //   "marketsDataArray: ",
    //   marketsDataArray.map((marketData, idx) => {
    //     return {
    //       index: idx,
    //       ...Object.fromEntries(
    //         Object.entries(marketData).map(([key, value]) => {
    //           // Try to log bigints and objects properly
    //           if (typeof value === "bigint") {
    //             return [key, value.toString()];
    //           }
    //           // Avoid logging huge buffers or circular
    //           return [key, value];
    //         }),
    //       ),
    //     };
    //   }),
    // );

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
      .filter(
        (marketData) =>
          marketData.params.collateralToken !==
          ("0xCc7FF230365bD730eE4B352cC2492CEdAC49383e" as Address), // hyUSD on base eusd
      )
      .filter((marketData) => marketData.state.totalSupplyAssets !== 0n)
      .filter((marketData) => marketData.state.totalBorrowAssets !== 0n)
      .filter((marketData) => marketData.vaultAssets !== 0n);

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinApyDelta = false; // (true if *at least one* market moves enough)

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
      if (marketData.apyAt100Utilization < apyRange.max) {
        // vaultsAssets is the assets owned by our vault
        // so we is the difference between the total supply and the total borrow is higher
        // then we're trying to withdraw funds from another vault allocated to this market
        const amountToWithdraw = min(
          marketData.vaultAssets,
          marketData.state.totalSupplyAssets - marketData.state.totalBorrowAssets,
        );
        totalWithdrawableAmount += amountToWithdraw;

        // setting this to true because if the range is not
        // within the irm curve, then we already exceeded
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
            Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) > this.getMinApyDeltaBips();
        } else if (utilization < lowerUtilizationBound) {
          totalWithdrawableAmount += getWithdrawableAmount(marketData, lowerUtilizationBound);

          const apyDelta =
            rateToApy(utilizationToRate(lowerUtilizationBound, marketData.rateAtTarget)) -
            rateToApy(utilizationToRate(utilization, marketData.rateAtTarget));

          didExceedMinApyDelta ||=
            Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) > this.getMinApyDeltaBips();
        }
      }
    }

    let idleWithdrawal = 0n;
    let idleDeposit = 0n;
    if (idleMarket) {
      if (totalWithdrawableAmount > totalDepositableAmount && this.config.allowIdleReallocation) {
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

      const apyAt100Utilization = marketData.apyAt100Utilization;
      const apyRangeMax = apyRange.max;

      if (apyAt100Utilization && apyAt100Utilization < apyRangeMax) {
        // We push utilization to 100% so that the Adaptive IRM curve can shift up and introduce higher rates.
        // This is done by withdrawing everything except what is needed to cover current borrows.

        const amountToWithdraw = min(
          marketData.vaultAssets,
          marketData.state.totalSupplyAssets - marketData.state.totalBorrowAssets,
        );

        const withdrawal = min(amountToWithdraw, remainingWithdrawal);

        // if the withdrawal is less than 1 token, then we don't need to withdraw
        // TODO: fix decimals
        if (withdrawal < 10n ** 18n) {
          continue;
        }
        const buffer = (withdrawal * 1n) / 100n; // 1% buffer

        const withdrawalWithBuffer = withdrawal - buffer;
        // const withdrawalWithBuffer = withdrawal;

        remainingWithdrawal -= withdrawalWithBuffer;

        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.vaultAssets - withdrawalWithBuffer,
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

      if (idleDeposit > 0n && this.config.allowIdleReallocation) {
        deposits.push({
          marketParams: idleMarket.params,
          assets: maxUint256,
        });
      }
    }

    const reallocations = [...withdrawals, ...deposits];

    const reallocationFilteredByCap = reallocations.filter((reallocation) => {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;

      // maxUint256 is a special value meaning "deposit all remaining", so exempt it from cap check
      return reallocation.assets === maxUint256 || cap > reallocation.assets;
    });

    // console.log();
    // for (const reallocation of reallocationFilteredByCap) {
    //   const marketId = this.calculateMarketId(reallocation.marketParams);
    //   const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;

    //   console.log("marketId:", marketId);
    //   console.log("collateralToken:", reallocation.marketParams.collateralToken);
    //   console.log("loanToken:", reallocation.marketParams.loanToken);
    //   console.log("oracle:", reallocation.marketParams.oracle);
    //   console.log("irm:", reallocation.marketParams.irm);
    //   console.log("lltv:", reallocation.marketParams.lltv);
    //   console.log("assets:", reallocation.assets);
    //   console.log("cap:", cap);

    //   console.log();
    // }
    // console.log();

    // filter so that we don't waste gas on reallocations containing only idle
    if (
      reallocationFilteredByCap.length === 1 &&
      reallocationFilteredByCap[0]?.assets === maxUint256
    ) {
      return undefined;
    }
    return reallocationFilteredByCap;
  }

  protected getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    // Start with default values from config
    let min = this.config.defaultMinApy;
    let max = this.config.defaultMaxApy;

    // Check for vault-specific configuration
    const vaultConfig = this.config.vaultRanges[chainId]?.[vaultAddress];
    if (vaultConfig) {
      min = vaultConfig.min;
      max = vaultConfig.max;
    }

    // Market-specific configuration takes precedence
    const marketConfig = this.config.marketRanges[chainId]?.[marketId];
    if (marketConfig) {
      min = marketConfig.min;
      max = marketConfig.max;
    }

    // Convert from percentage to WAD format
    return {
      min: percentToWad(min),
      max: percentToWad(max),
    };
  }

  protected getMinApyDeltaBips() {
    // Using default value for now, can be extended to support per-vault/market configuration
    return DEFAULT_MIN_APY_DELTA_BIPS;
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
