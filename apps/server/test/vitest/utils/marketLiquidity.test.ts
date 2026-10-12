import { Address, Hex, maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { marketIdFromParams } from "../../../src/utils/marketId";
import { marketsSnapshot } from "../../../src/utils/marketLiquidity";
import { MarketParams, VaultMarketData } from "../../../src/utils/types";

const params = (collateralToken: Address): MarketParams => ({
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken,
  oracle: "0x0000000000000000000000000000000000000002",
  irm: "0x0000000000000000000000000000000000000003",
  lltv: 800000000000000000n,
});

const market = (p: MarketParams, supply: bigint, borrow: bigint, vaultAssets: bigint) =>
  ({
    chainId: 1,
    id: marketIdFromParams(p),
    params: p,
    state: {
      totalSupplyAssets: supply,
      totalSupplyShares: supply,
      totalBorrowAssets: borrow,
      totalBorrowShares: borrow,
      lastUpdate: 1n,
      fee: 0n,
    },
    cap: 10n ** 30n,
    vaultAssets,
    rateAtTarget: 0n,
    apyAt100Utilization: 0n,
    loanTokenDecimals: 6,
  }) satisfies VaultMarketData;

describe("marketsSnapshot", () => {
  it("reports liquidity per market as strings and matches allocation targets by id", () => {
    const idle = params(zeroAddress);
    const lending = params("0x00000000000000000000000000000000000000cc");
    const markets = [market(idle, 0n, 0n, 0n), market(lending, 1000n, 900n, 500n)];
    const vaultData = {
      vaultAddress: "0x00000000000000000000000000000000000000aa" as Address,
      marketsData: new Map<Hex, VaultMarketData>(markets.map((m) => [m.id, m])),
    };

    const [idleSnap, lendingSnap] = marketsSnapshot(vaultData, [
      { marketParams: lending, assets: 400n },
      { marketParams: idle, assets: maxUint256 },
    ]);

    expect(idleSnap).toMatchObject({ utilization: null, target: "max" });
    expect(lendingSnap).toMatchObject({
      vaultAssets: "500",
      freeLiquidity: "100",
      maxWithdrawable: "100",
      utilization: 0.9,
      target: "400",
    });
    expect(marketsSnapshot(vaultData)[1]?.target).toBeNull();
  });
});
