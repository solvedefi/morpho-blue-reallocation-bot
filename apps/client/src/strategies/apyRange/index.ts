import {
  ALLOW_IDLE_REALLOCATION,
  DEFAULT_APY_RANGE,
  DEFAULT_MIN_APY_DELTA_BIPS,
  marketsApyRanges,
  marketsMinApsDeltaBips,
  vaultsDefaultApyRanges,
  vaultsDefaultMinApsDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import {
  Address,
  Hex,
  encodeAbiParameters,
  keccak256,
  maxUint256,
  zeroAddress,
  type Client,
  type Transport,
  type Chain,
} from "viem";
import { readContract } from "viem/actions";

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

// Minimal ERC20 ABI for name function
const erc20Abi = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

export class ApyRange implements Strategy {
  private client?: Client<Transport, Chain>;

  constructor(client?: Client<Transport, Chain>) {
    this.client = client;
  }

  private async getTokenName(tokenAddress: Address): Promise<string> {
    try {
      if (tokenAddress === zeroAddress) {
        return "Idle";
      }

      if (!this.client) {
        return "N/A (no client)";
      }

      const name = await readContract(this.client, {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "name",
      });

      return name as string;
    } catch (error) {
      console.error(`Failed to fetch token name for ${tokenAddress}:`, error);
      return "Unknown";
    }
  }

  async findReallocation(vaultData: VaultData) {
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
      console.log("-----");
      const apyRange = this.getApyRange(marketData.chainId, vaultData.vaultAddress, marketData.id);

      const upperUtilizationBound = rateToUtilization(
        apyToRate(apyRange.max),
        marketData.rateAtTarget,
      );
      const lowerUtilizationBound = rateToUtilization(
        apyToRate(apyRange.min),
        marketData.rateAtTarget,
      );

      console.log("upperUtilizationBound:", upperUtilizationBound);
      console.log("lowerUtilizationBound:", lowerUtilizationBound);
      console.log("ApyRange.max:", apyRange.max);
      console.log("ApyRange.min:", apyRange.min);
      console.log("rateAt100Utilization:", marketData.rateAt100Utilization);

      // we're pushing util to 100% so that the irm curve can shift up and introduce new rates
      if (
        marketData.rateAt100Utilization &&
        rateToApy(marketData.rateAt100Utilization) < apyRange.max
      ) {
        console.log("max value for range exceeds rateAt100Utilization");

        const amountToWithdraw =
          marketData.state.totalSupplyAssets - marketData.state.totalBorrowAssets;
        totalDepositableAmount += amountToWithdraw;
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

      console.log("-----");
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

    console.log("======");
    console.log("totalWithdrawableAmount:", totalWithdrawableAmount);
    console.log("totalDepositableAmount:", totalDepositableAmount);
    console.log("======");

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    // no withdrawable amount but have depositable amount,
    // so we need to push util to 100% for all markets
    // reallocation will have only withdrawals, no deposits
    if (totalDepositableAmount > 0 && totalWithdrawableAmount === 0n) {
      console.log("");
      console.log("==============");
      console.log("");
      for (const marketData of marketsData) {
        const collateralTokenName = await this.getTokenName(marketData.params.collateralToken);
        console.log("collateralToken name:", collateralTokenName);
        console.log("marketData.params.loanToken:", marketData.params.loanToken);
        console.log("marketData.params.oracle:", marketData.params.oracle);
        console.log("marketData.params.irm:", marketData.params.irm);
        console.log("marketData.params.lltv:", marketData.params.lltv);
        console.log("marketData.state.totalSupplyAssets:", marketData.state.totalSupplyAssets);
        console.log("marketData.state.totalBorrowAssets:", marketData.state.totalBorrowAssets);
        console.log("marketData.state.totalSupplyShares:", marketData.state.totalSupplyShares);
        console.log("marketData.state.totalBorrowShares:", marketData.state.totalBorrowShares);
        console.log("marketData.state.lastUpdate:", marketData.state.lastUpdate);
        console.log("marketData.state.fee:", marketData.state.fee);
        console.log();

        // TODO: maybe need to return buffer
        // const buffer = 10n * 10n ** 18n;
        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.state.totalBorrowAssets,
          // assets: marketData.state.totalBorrowAssets + buffer,
        });
      }
      console.log("");
      console.log("==============");
      console.log("");

      if (idleMarket) {
        withdrawals.push({
          marketParams: idleMarket.params,
          assets: maxUint256,
        });
      }

      console.log("ONLY WITHDRAWALS:");
      for (const reallocation of withdrawals) {
        const collateralTokenName = await this.getTokenName(
          reallocation.marketParams.collateralToken,
        );
        console.log("reallocation.marketId:", this.calculateMarketId(reallocation.marketParams));
        console.log(
          "reallocation.marketParams.collateralToken:",
          reallocation.marketParams.collateralToken,
        );
        console.log("collateralToken name:", collateralTokenName);
        console.log("reallocation.marketParams.loanToken:", reallocation.marketParams.loanToken);
        console.log("reallocation.marketParams.oracle:", reallocation.marketParams.oracle);
        console.log("reallocation.marketParams.irm:", reallocation.marketParams.irm);
        console.log("reallocation.marketParams.lltv:", reallocation.marketParams.lltv);
        console.log("reallocation.assets:", reallocation.assets);
        console.log("assets tokens:", reallocation.assets / 10n ** 18n);

        console.log();
      }

      return withdrawals;
    }

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

      // TODO: double check
      // TODO: double check
      // TODO: double check
      // TODO: double check
      if (
        marketData.rateAt100Utilization &&
        rateToApy(marketData.rateAt100Utilization) < apyRange.max
      ) {
        // we're pushing util to 100% so that the irm curve can shift up and introduce new rates
        console.log("2nd iteration: max value for range exceeds rateAt100Utilization");

        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.state.totalSupplyAssets,
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

    console.log();
    for (const reallocation of reallocations) {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;
      const rate = vaultData.marketsData.get(marketId)?.rate ?? 0n;
      const rateAt100Utilization = vaultData.marketsData.get(marketId)?.rateAt100Utilization ?? 0n;

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
      console.log("rate:", rate);
      console.log("rateAt100Utilization:", rateAt100Utilization);
      console.log("cap is more than assets:", cap > reallocation.assets);

      console.log();
    }

    const reallocationFilteredByCap = reallocations.filter((reallocation) => {
      const marketId = this.calculateMarketId(reallocation.marketParams);
      const cap = vaultData.marketsData.get(marketId)?.cap ?? 0n;
      // maxUint256 is a special value meaning "deposit all remaining", so exempt it from cap check
      return reallocation.assets === maxUint256 || cap > reallocation.assets;
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
