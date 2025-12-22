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
import { MarketAllocation, MarketParams, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";

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

    let idleWithdrawal = 0n;
    let idleDeposit = 0n;

    console.log("idleMarket.params:", idleMarket?.params);
    console.log("idleMarket.vaultAssets:", idleMarket?.vaultAssets);
    console.log("idleMarket.cap:", idleMarket?.cap);
    console.log("totalWithdrawableAmount:", totalWithdrawableAmount);
    console.log("totalDepositableAmount:", totalDepositableAmount);
    console.log("ALLOW_IDLE_REALLOCATION:", ALLOW_IDLE_REALLOCATION);

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

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

    if (toReallocate === 0n || !didExceedMinApyDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

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

    console.log();
    for (const reallocation of reallocations) {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;

      console.log("cap:", cap);

      console.log("reallocation.marketId:", marketId);
      console.log(
        "reallocation.marketParams.collateralToken:",
        reallocation.marketParams.collateralToken,
      );
      console.log("reallocation.marketParams.loanToken:", reallocation.marketParams.loanToken);
      console.log("reallocation.marketParams.oracle:", reallocation.marketParams.oracle);
      console.log("reallocation.marketParams.irm:", reallocation.marketParams.irm);
      console.log("reallocation.marketParams.lltv:", reallocation.marketParams.lltv);
      console.log("reallocation.assets:", reallocation.assets);
      console.log("cap:", cap);
      console.log("cap is more than assets:", cap > reallocation.assets);
      console.log();
    }

    const reallocationFilteredByCap = reallocations.filter((reallocation) => {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;
      return cap > reallocation.assets;
    });

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
