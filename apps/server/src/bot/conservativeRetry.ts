import { maxUint256, zeroAddress } from "viem";

import { marketIdFromParams } from "../utils/marketId";
import { maxWithdrawableAssets } from "../utils/marketLiquidity";
import { getUtilization } from "../utils/maths";
import { MarketAllocation, VaultData } from "../utils/types";

import { RetrySettings } from "./retryPolicy";

interface ParsedAllocation {
  marketParams: MarketAllocation["marketParams"];
  pastAssets: bigint;
  newAssets: bigint;
  isIdle: boolean;
  utilization: number;
  usesMaxDeposit: boolean;
}

export function applyConservativeRetry(
  allocations: MarketAllocation[],
  vaultData: VaultData,
  retry: RetrySettings,
): MarketAllocation[] {
  const parsed = parseAllocations(allocations, vaultData);
  if (retry.attempt <= 1 || parsed.length === 0) {
    return allocations;
  }

  const totalLiquidity = totalVaultAssets(vaultData);
  let idleAfter = plannedIdleAfter(parsed);
  const kept = applyWithdrawalHaircut(parsed, retry, totalLiquidity);
  capWithdrawalsToAvailableLiquidity(parsed, vaultData);
  const reducedForOffset = reduceLiquidityIncrease(parsed, kept);
  idleAfter += kept > reducedForOffset ? kept - reducedForOffset : 0n;

  const idleFloor = BigInt(Math.floor(Number(totalLiquidity) * retry.idleFloorRatio));
  if (idleAfter < idleFloor) {
    idleAfter += reduceLiquidityIncrease(parsed, idleFloor - idleAfter);
  }

  syncDepositTargets(parsed);
  return buildAllocations(parsed);
}

function parseAllocations(
  allocations: MarketAllocation[],
  vaultData: VaultData,
): ParsedAllocation[] {
  const parsed = allocations.map((allocation) => {
    const marketId = marketIdFromParams(allocation.marketParams);
    const market = vaultData.marketsData.get(marketId);
    if (!market) {
      throw new Error(`Market ${marketId} not found in vault data`);
    }
    return {
      marketParams: allocation.marketParams,
      pastAssets: market.vaultAssets,
      newAssets: allocation.assets,
      isIdle: market.params.collateralToken === zeroAddress,
      utilization: Number(getUtilization(market.state)) / 1e18,
      usesMaxDeposit: allocation.assets === maxUint256,
    };
  });

  resolveMaxDepositTargets(parsed);
  return parsed;
}

function resolveMaxDepositTargets(parsed: ParsedAllocation[]): void {
  const totalWithdrawn = totalWithdrawals(parsed);
  let explicitDeposits = 0n;

  for (const allocation of parsed) {
    if (allocation.usesMaxDeposit || !isDeposit(allocation)) {
      continue;
    }
    explicitDeposits += depositAmount(allocation);
  }

  for (const allocation of parsed) {
    if (!allocation.usesMaxDeposit) {
      continue;
    }
    const depositAmountValue =
      totalWithdrawn > explicitDeposits ? totalWithdrawn - explicitDeposits : 0n;
    allocation.newAssets = allocation.pastAssets + depositAmountValue;
    allocation.usesMaxDeposit = false;
  }
}

function plannedIdleAfter(parsed: ParsedAllocation[]): bigint {
  const idleAllocation = parsed.find((allocation) => allocation.isIdle);
  return idleAllocation?.newAssets ?? 0n;
}

function totalVaultAssets(vaultData: VaultData): bigint {
  return Array.from(vaultData.marketsData.values()).reduce(
    (total, market) => total + market.vaultAssets,
    0n,
  );
}

function isWithdrawal(allocation: ParsedAllocation): boolean {
  return !allocation.isIdle && allocation.newAssets < allocation.pastAssets;
}

function isDeposit(allocation: ParsedAllocation): boolean {
  return allocation.newAssets > allocation.pastAssets;
}

function withdrawalAmount(allocation: ParsedAllocation): bigint {
  return allocation.pastAssets - allocation.newAssets;
}

function depositAmount(allocation: ParsedAllocation): bigint {
  return allocation.newAssets - allocation.pastAssets;
}

function totalWithdrawals(parsed: ParsedAllocation[]): bigint {
  return parsed.reduce((total, allocation) => {
    if (!isWithdrawal(allocation)) {
      return total;
    }
    return total + withdrawalAmount(allocation);
  }, 0n);
}

function totalLiquidityGain(parsed: ParsedAllocation[]): bigint {
  return parsed.reduce((total, allocation) => {
    if (!isDeposit(allocation)) {
      return total;
    }
    return total + depositAmount(allocation);
  }, 0n);
}

function keptWithdrawalAmount(withdrawal: bigint, withdrawalHaircut: number, scale = 1): bigint {
  const keptRatio = 1 - withdrawalHaircut;
  return (withdrawal * BigInt(Math.floor(keptRatio * scale * 1_000_000))) / 1_000_000n;
}

function applyWithdrawalHaircut(
  parsed: ParsedAllocation[],
  retry: RetrySettings,
  totalLiquidity: bigint,
): bigint {
  const totalGain = totalLiquidityGain(parsed);
  let requested = 0n;

  for (const allocation of parsed) {
    if (!isWithdrawalHaircutTarget(allocation, retry, totalLiquidity)) {
      continue;
    }
    requested += keptWithdrawalAmount(withdrawalAmount(allocation), retry.withdrawalHaircut);
  }

  if (requested === 0n || totalGain === 0n) {
    return 0n;
  }

  const scale = requested > totalGain ? Number(totalGain) / Number(requested) : 1;
  let applied = 0n;

  for (const allocation of parsed) {
    if (!isWithdrawalHaircutTarget(allocation, retry, totalLiquidity)) {
      continue;
    }
    const kept = keptWithdrawalAmount(withdrawalAmount(allocation), retry.withdrawalHaircut, scale);
    if (kept <= 0n) {
      continue;
    }
    allocation.newAssets += kept;
    applied += kept;
  }
  return applied;
}

function isWithdrawalHaircutTarget(
  allocation: ParsedAllocation,
  retry: RetrySettings,
  totalLiquidity: bigint,
): boolean {
  if (!isWithdrawal(allocation)) {
    return false;
  }
  if (hasHighUsage(allocation, retry.highUsageThreshold)) {
    return true;
  }
  return isLargeWithdrawal(
    withdrawalAmount(allocation),
    totalLiquidity,
    retry.largeWithdrawalRatio,
  );
}

function hasHighUsage(allocation: ParsedAllocation, threshold: number): boolean {
  return allocation.utilization >= threshold;
}

function isLargeWithdrawal(withdrawal: bigint, totalLiquidity: bigint, ratio: number): boolean {
  if (ratio <= 0 || totalLiquidity <= 0n) {
    return false;
  }
  const threshold = BigInt(Math.floor(Number(totalLiquidity) * ratio));
  return withdrawal >= threshold;
}

function reduceLiquidityIncrease(parsed: ParsedAllocation[], amount: bigint): bigint {
  if (amount <= 0n) {
    return 0n;
  }
  let remaining = amount;
  for (const allocation of parsed) {
    if (allocation.isIdle || !isDeposit(allocation)) {
      continue;
    }
    const reduction = depositAmount(allocation) < remaining ? depositAmount(allocation) : remaining;
    allocation.newAssets -= reduction;
    remaining -= reduction;
    if (remaining <= 0n) {
      break;
    }
  }
  return amount - remaining;
}

function capWithdrawalsToAvailableLiquidity(
  parsed: ParsedAllocation[],
  vaultData: VaultData,
): void {
  for (const allocation of parsed) {
    if (!isWithdrawal(allocation)) {
      continue;
    }
    const market = vaultData.marketsData.get(marketIdFromParams(allocation.marketParams));
    if (!market) {
      continue;
    }
    const maxWithdrawal = maxWithdrawableAssets(market);
    if (withdrawalAmount(allocation) <= maxWithdrawal) {
      continue;
    }
    allocation.newAssets = allocation.pastAssets - maxWithdrawal;
  }
}

function syncDepositTargets(parsed: ParsedAllocation[]): void {
  const totalWithdrawn = totalWithdrawals(parsed);
  let nonIdleDeposits = 0n;

  for (const allocation of parsed) {
    if (allocation.isIdle || !isDeposit(allocation)) {
      continue;
    }
    nonIdleDeposits += depositAmount(allocation);
  }

  const idleDeposit = totalWithdrawn > nonIdleDeposits ? totalWithdrawn - nonIdleDeposits : 0n;
  for (const allocation of parsed) {
    if (!allocation.isIdle || !isDeposit(allocation)) {
      continue;
    }
    allocation.newAssets = allocation.pastAssets + idleDeposit;
  }
}

function buildAllocations(parsed: ParsedAllocation[]): MarketAllocation[] {
  const allocations: MarketAllocation[] = [];
  let idleDepositIndex = -1;

  for (const allocation of parsed) {
    if (allocation.newAssets === allocation.pastAssets) {
      continue;
    }
    allocations.push({
      marketParams: allocation.marketParams,
      assets: allocation.newAssets,
    });
    if (allocation.isIdle && isDeposit(allocation)) {
      idleDepositIndex = allocations.length - 1;
    }
  }

  if (idleDepositIndex >= 0) {
    const idleDeposit = allocations[idleDepositIndex];
    if (idleDeposit) {
      idleDeposit.assets = maxUint256;
    }
  }

  return allocations;
}
