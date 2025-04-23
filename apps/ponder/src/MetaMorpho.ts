import { ponder } from "ponder:registry";
import { vault, config } from "ponder:schema";

ponder.on("MetaMorpho:SetTimelock", async ({ event, context }) => {
  await context.db
    .insert(vault)
    .values({
      // primary key
      chainId: context.network.chainId,
      address: event.log.address,

      // `WithdrawQueue`
      timelock: event.args.newTimelock,
      withdrawQueue: [],
    })
    .onConflictDoUpdate({
      timelock: event.args.newTimelock,
    });
});

ponder.on("MetaMorpho:SetWithdrawQueue", async ({ event, context }) => {
  // Row must exist because `setWithdrawQueue` can only be called after the first `setTimelock`.
  await context.db
    .update(vault, {
      chainId: context.network.chainId,
      address: event.log.address,
    })
    .set({
      withdrawQueue: [...event.args.newWithdrawQueue],
    });
});

ponder.on("MetaMorpho:SetCap", async ({ event, context }) => {
  await context.db
    .insert(config)
    .values({
      // primary key
      chainId: context.network.chainId,
      vault: event.log.address,
      marketId: event.args.id,

      // `WithdrawQueue`
      cap: event.args.cap,
      enabled: true,
      removableAt: 0n,
    })
    .onConflictDoUpdate((row) => ({
      cap: event.args.cap,
      enabled: row.enabled === false ? event.args.cap > 0n : row.enabled,
      removableAt: event.args.cap > 0n ? 0n : row.removableAt,
    }));
});

ponder.on("MetaMorpho:SubmitMarketRemoval", async ({ event, context }) => {
  const timelock =
    (
      await context.db.find(vault, {
        chainId: context.network.chainId,
        address: event.log.address,
      })
    )?.timelock ?? 0n;

  // Row must exist because `submitMarketRemoval` can only work with configured markets.
  await context.db
    .update(config, {
      chainId: context.network.chainId,
      vault: event.log.address,
      marketId: event.args.id,
    })
    .set({
      removableAt: event.block.timestamp + timelock,
    });
});

ponder.on("MetaMorpho:RevokePendingMarketRemoval", async ({ event, context }) => {
  // Row must exist because `revokePendingMarketRemoval` can only be called after `submitMarketRemoval`.
  await context.db
    .update(config, {
      chainId: context.network.chainId,
      vault: event.log.address,
      marketId: event.args.id,
    })
    .set({
      removableAt: 0n,
    });
});
