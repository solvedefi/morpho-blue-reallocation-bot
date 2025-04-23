import { Hono } from "hono";
import { and, client, eq, graphql, inArray } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";
import { type Address } from "viem";
import { accrueInterest } from "./helpers";

const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));

app.get("/chain/:id/vault/:address", async (c) => {
  const { id: chainId, address } = c.req.param();

  const vaults = await db
    .select()
    .from(schema.vault)
    .where(
      and(eq(schema.vault.chainId, Number(chainId)), eq(schema.vault.address, address as Address)),
    )
    .limit(1);

  const vault = vaults[0];

  if (!vault) return c.json({ error: "Vault not found" }, 404);

  const markets = await db
    .select()
    .from(schema.market)
    .where(
      and(
        eq(schema.market.chainId, Number(chainId)),
        inArray(schema.market.id, vault.withdrawQueue),
      ),
    )
    .limit(1);

  const vaultPositions = await Promise.all(
    markets.map(async (market) => {
      const [positions, configs] = await Promise.all([
        db
          .select()
          .from(schema.position)
          .where(
            and(
              eq(schema.position.chainId, Number(chainId)),
              eq(schema.position.marketId, market.id),
              eq(schema.position.user, address as Address),
            ),
          )
          .limit(1),
        db
          .select()
          .from(schema.config)
          .where(
            and(
              eq(schema.config.chainId, Number(chainId)),
              eq(schema.config.vault, address as Address),
              eq(schema.config.marketId, market.id),
            ),
          )
          .limit(1),
      ]);

      const position = positions[0] ?? {
        chainId: Number(chainId),
        marketId: market.id,
        user: address as Address,
        collateral: 0n,
        borrowShares: 0n,
        supplyShares: 0n,
      };

      const config = configs[0] ?? {
        chainId: Number(chainId),
        marketId: market.id,
        vault: address as Address,
        cap: 0n,
        rate: 0n,
        enabled: false,
      };

      const accruedState = accrueInterest(
        market,
        market.rateAtTarget,
        BigInt(Math.round(Date.now() / 1000)),
      );

      return {
        market: {
          ...market,
          lltv: `${market.lltv}`,
          rateAtTarget: `${market.rateAtTarget}`,
          totalSupplyAssets: `${accruedState.totalSupplyAssets}`,
          totalSupplyShares: `${accruedState.totalSupplyShares}`,
          totalBorrowAssets: `${accruedState.totalBorrowAssets}`,
          totalBorrowShares: `${accruedState.totalBorrowShares}`,
          lastUpdate: `${accruedState.lastUpdate}`,
          fee: `${accruedState.fee}`,
        },
        cap: `${config.cap}`,
        shares: `${position.supplyShares}`,
      };
    }),
  );

  return c.json({ vaultPositions });
});

export default app;
