import { toAssetsDown } from "./../../../client/src/utils/maths";
import { Hono } from "hono";
import { and, client, eq, graphql, inArray } from "ponder";
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { type Address } from "viem";
import { accrueInterest } from "./helpers";
import { metaMorphoAbi } from "../../abis/MetaMorpho";

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
    .limit(100);

  const vaultPositions = await Promise.all(
    markets.map(async (market) => {
      const [positions, config] = await Promise.all([
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
          .limit(100),
        // biome-ignore lint/style/noNonNullAssertion: Never null
        publicClients[chainId as unknown as keyof typeof publicClients]!.readContract({
          address: address as Address,
          abi: metaMorphoAbi,
          functionName: "config",
          args: [market.id],
        }),
      ]);

      const position = positions[0] ?? {
        chainId: Number(chainId),
        marketId: market.id,
        user: address as Address,
        collateral: 0n,
        borrowShares: 0n,
        supplyShares: 0n,
      };

      const cap = config[0];

      const { marketState: accruedState, rateAtTarget } = accrueInterest(
        market,
        market.rateAtTarget,
        BigInt(Math.round(Date.now() / 1000)),
      );

      return {
        market: {
          chainId: market.chainId,
          id: market.id,
          params: {
            loanToken: market.loanToken,
            collateralToken: market.collateralToken,
            irm: market.irm,
            oracle: market.oracle,
            lltv: `${market.lltv}`,
          },
          rateAtTarget: `${market.rateAtTarget}`,
          state: {
            totalSupplyAssets: `${accruedState.totalSupplyAssets}`,
            totalSupplyShares: `${accruedState.totalSupplyShares}`,
            totalBorrowAssets: `${accruedState.totalBorrowAssets}`,
            totalBorrowShares: `${accruedState.totalBorrowShares}`,
            lastUpdate: `${accruedState.lastUpdate}`,
            fee: `${accruedState.fee}`,
          },
        },
        cap: `${cap}`,
        vaultAssets: `${toAssetsDown(position.supplyShares, accruedState.totalSupplyAssets, accruedState.totalSupplyShares)}`,
        rateAtTarget: `${rateAtTarget}`,
      };
    }),
  );

  return c.json(vaultPositions);
});

export default app;
