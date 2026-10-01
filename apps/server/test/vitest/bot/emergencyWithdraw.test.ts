import { Address, Hex, maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { planEmergencyWithdraw } from "../../../../server/src/bot/emergencyWithdraw.js";
import { VaultMarketData } from "../../../../server/src/utils/types.js";

function market(
  collateral: Address,
  o: { supply: bigint; borrow: bigint; vault: bigint; cap?: bigint },
): VaultMarketData {
  return {
    chainId: 1,
    id: "0x01" as Hex,
    params: {
      loanToken: zeroAddress,
      collateralToken: collateral,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    },
    state: {
      totalSupplyAssets: o.supply,
      totalSupplyShares: 0n,
      totalBorrowAssets: o.borrow,
      totalBorrowShares: 0n,
      lastUpdate: 0n,
      fee: 0n,
    },
    cap: o.cap ?? maxUint256,
    vaultAssets: o.vault,
    rateAtTarget: 0n,
    apyAt100Utilization: 0n,
    loanTokenDecimals: 18,
  };
}

const COLL = "0x0000000000000000000000000000000000000001" as Address;
const idle = market(zeroAddress, { supply: 0n, borrow: 0n, vault: 0n });

describe("planEmergencyWithdraw", () => {
  it("full exit when liquidity covers the whole position", () => {
    const plan = planEmergencyWithdraw(
      market(COLL, { supply: 10_000_000n, borrow: 0n, vault: 1_000_000n }),
      idle,
    );
    expect(plan?.map((a) => a.assets)).toEqual([0n, maxUint256]);
  });

  it("partial: withdraws free liquidity minus buffer", () => {
    // free = 500_000, buffer = 1_000_000/10_000 + 1 = 101
    const plan = planEmergencyWithdraw(
      market(COLL, { supply: 2_000_000n, borrow: 1_500_000n, vault: 1_000_000n }),
      idle,
    );
    expect(plan?.[0]?.assets).toBe(1_000_000n - (500_000n - 101n));
  });

  it("clamps to idle cap room", () => {
    const smallIdle = market(zeroAddress, { supply: 0n, borrow: 0n, vault: 0n, cap: 10_000n });
    const plan = planEmergencyWithdraw(
      market(COLL, { supply: 10_000_000n, borrow: 0n, vault: 1_000_000n }),
      smallIdle,
    );
    expect(plan?.[0]?.assets).toBe(1_000_000n - (10_000n - 101n));
  });

  it("done at ~100% util, empty position or full idle", () => {
    expect(
      planEmergencyWithdraw(
        market(COLL, { supply: 1_000_000n, borrow: 999_950n, vault: 1_000_000n }),
        idle,
      ),
    ).toBeNull();
    expect(
      planEmergencyWithdraw(market(COLL, { supply: 1_000_000n, borrow: 0n, vault: 0n }), idle),
    ).toBeNull();
    const fullIdle = market(zeroAddress, { supply: 5n, borrow: 0n, vault: 5n, cap: 5n });
    expect(
      planEmergencyWithdraw(
        market(COLL, { supply: 1_000_000n, borrow: 0n, vault: 1_000_000n }),
        fullIdle,
      ),
    ).toBeNull();
  });
});
