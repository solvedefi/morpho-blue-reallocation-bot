import { ok } from "neverthrow";
import { type Address } from "viem";
import { describe, expect, it, vi } from "vitest";

import { haltVault, resumeVault } from "../../../../server/src/bot/emergencyHalt.js";
import { ReallocationBot } from "../../../../server/src/bot/ReallocationBot.js";
import { chainConfigs } from "../../../../server/src/config/config.js";
import { MinGasThresholds } from "../../../../server/src/services/MinGasThresholds.js";
import { Strategy } from "../../../../server/src/strategies/strategy.js";

const VAULT = "0x348831b46876d3dF2Db98BdEc5E3B4083329Ab9f" as Address;

function botWithSpy() {
  const config = chainConfigs[480];
  if (!config) throw new Error("Missing worldchain config");
  const findReallocation = vi.fn(() => Promise.resolve(ok(undefined)));
  const bot = new ReallocationBot(
    480,
    {} as never,
    {} as never,
    [VAULT],
    { findReallocation } as unknown as Strategy,
    config,
    new MinGasThresholds(),
  );
  // vault data fetched before the emergency: the halt must still win inside the lock
  (bot as unknown as { morphoClient: unknown }).morphoClient = {
    fetchVaultData: () => Promise.resolve(ok({ vaultAddress: VAULT, marketsData: new Map() })),
  };
  return { bot, findReallocation };
}

describe("emergency halt", () => {
  it("regular run skips a halted vault (any address casing) and resumes after", async () => {
    const { bot, findReallocation } = botWithSpy();

    haltVault(480, VAULT.toLowerCase());
    await bot.run();
    expect(findReallocation).not.toHaveBeenCalled();

    resumeVault(480, VAULT);
    await bot.run();
    expect(findReallocation).toHaveBeenCalledTimes(1);
  });
});
