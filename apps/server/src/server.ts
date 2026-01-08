import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono, Context } from "hono";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

import { DatabaseClient } from "./database";
import { MetadataService } from "./services/MetadataService";

export type OnConfigChangeCallback = () => Promise<void>;

const vaultConfigSchema = z.object({
  chainId: z.number(),
  vaultAddress: z.string().refine((val) => isAddress(val), {
    message: "Invalid Ethereum address",
  }),
  minApy: z.number(),
  maxApy: z.number(),
});

const marketConfigSchema = z.object({
  chainId: z.number(),
  marketId: z.string().refine((val) => isHex(val), {
    message: "Invalid market ID (must be hex)",
  }),
  minApy: z.number(),
  maxApy: z.number(),
});

const strategyConfigSchema = z
  .object({
    allowIdleReallocation: z.boolean().optional(),
    defaultMinApy: z.number().optional(),
    defaultMaxApy: z.number().optional(),
  })
  .refine(
    (data) =>
      data.allowIdleReallocation !== undefined ||
      data.defaultMinApy !== undefined ||
      data.defaultMaxApy !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

const deleteVaultConfigSchema = z.object({
  chainId: z.number(),
  vaultAddress: z.string().refine((val) => isAddress(val), {
    message: "Invalid Ethereum address",
  }),
});

const deleteMarketConfigSchema = z.object({
  chainId: z.number(),
  marketId: z.string().refine((val) => isHex(val), {
    message: "Invalid market ID (must be hex)",
  }),
});

const updateChainSchema = z
  .object({
    enabled: z.boolean().optional(),
    executionInterval: z.number().positive().optional(),
  })
  .refine((data) => data.enabled !== undefined || data.executionInterval !== undefined, {
    message: "At least one field must be provided",
  });

const addVaultToWhitelistSchema = z.object({
  vaultAddress: z.string().refine((val) => isAddress(val), {
    message: "Invalid Ethereum address",
  }),
});

const updateVaultSchema = z.object({
  enabled: z.boolean(),
});

export function createServer(
  dbClient: DatabaseClient,
  metadataService: MetadataService,
  onConfigChange?: OnConfigChangeCallback,
) {
  const app = new Hono();

  app.get("/config", async (c: Context) => {
    const configResult = await dbClient.loadApyConfiguration();

    if (configResult.isErr()) {
      console.error("Error loading configuration:", configResult.error);
      return c.json(
        {
          success: false,
          error: "Failed to load configuration",
        },
        500,
      );
    }

    return c.json({
      success: true,
      data: configResult.value,
    });
  });

  app.post("/config/vault", zValidator("json", vaultConfigSchema), async (c) => {
    const { chainId, vaultAddress, minApy, maxApy } = c.req.valid("json");

    // Validate APY values
    if (minApy < 0 || maxApy < 0 || minApy > 100 || maxApy > 100) {
      return c.json(
        {
          success: false,
          error: "APY values must be between 0 and 100",
        },
        400,
      );
    }

    if (minApy >= maxApy) {
      return c.json(
        {
          success: false,
          error: "Min APY must be less than max APY",
        },
        400,
      );
    }

    const result = await dbClient.upsertVaultApyRange(
      chainId,
      vaultAddress as Address,
      minApy,
      maxApy,
    );

    if (result.isErr()) {
      console.error("Error updating vault APY range:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to update vault APY configuration",
        },
        500,
      );
    }

    // Trigger configuration reload and restart bots
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Vault APY range configured successfully",
      data: {
        chainId,
        vaultAddress,
        minApy,
        maxApy,
      },
    });
  });

  app.post("/config/market", zValidator("json", marketConfigSchema), async (c) => {
    const { chainId, marketId, minApy, maxApy } = c.req.valid("json");

    // Validate APY values
    if (minApy < 0 || maxApy < 0 || minApy > 100 || maxApy > 100) {
      return c.json(
        {
          success: false,
          error: "APY values must be between 0 and 100",
        },
        400,
      );
    }

    if (minApy >= maxApy) {
      return c.json(
        {
          success: false,
          error: "Min APY must be less than max APY",
        },
        400,
      );
    }

    // Fetch market metadata (token symbols) from blockchain
    const marketMetadata = await metadataService.fetchMarketMetadata(chainId, marketId as Hex);
    console.log(
      `Fetched market metadata for ${marketId} on chain ${String(chainId)}:`,
      marketMetadata.collateralSymbol ?? "unknown",
      "/",
      marketMetadata.loanSymbol ?? "unknown",
    );

    const result = await dbClient.upsertMarketApyRange(chainId, marketId as Hex, minApy, maxApy, {
      collateralSymbol: marketMetadata.collateralSymbol ?? undefined,
      loanSymbol: marketMetadata.loanSymbol ?? undefined,
    });

    if (result.isErr()) {
      console.error("Error updating market APY range:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to update market APY configuration",
        },
        500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Market APY range configured successfully",
      data: {
        chainId,
        marketId,
        minApy,
        maxApy,
        collateralSymbol: marketMetadata.collateralSymbol,
        loanSymbol: marketMetadata.loanSymbol,
      },
    });
  });

  app.put("/config/strategy", zValidator("json", strategyConfigSchema), async (c) => {
    const { allowIdleReallocation, defaultMinApy, defaultMaxApy } = c.req.valid("json");

    const updateData: {
      allowIdleReallocation?: boolean;
      defaultMinApy?: number;
      defaultMaxApy?: number;
    } = {};

    // Validate allowIdleReallocation if provided
    if (allowIdleReallocation !== undefined) {
      updateData.allowIdleReallocation = allowIdleReallocation;
    }

    // Validate defaultMinApy if provided
    if (defaultMinApy !== undefined) {
      if (defaultMinApy < 0) {
        return c.json(
          {
            success: false,
            error: "defaultMinApy must be a non-negative number",
          },
          400,
        );
      }
      updateData.defaultMinApy = defaultMinApy;
    }

    // Validate defaultMaxApy if provided
    if (defaultMaxApy !== undefined) {
      if (defaultMaxApy < 0) {
        return c.json(
          {
            success: false,
            error: "defaultMaxApy must be a non-negative number",
          },
          400,
        );
      }
      updateData.defaultMaxApy = defaultMaxApy;
    }

    // Validate min < max if both are provided
    if (updateData.defaultMinApy !== undefined && updateData.defaultMaxApy !== undefined) {
      if (updateData.defaultMinApy >= updateData.defaultMaxApy) {
        return c.json(
          {
            success: false,
            error: "defaultMinApy must be less than defaultMaxApy",
          },
          400,
        );
      }
    }

    const result = await dbClient.updateApyStrategyConfig(updateData);

    if (result.isErr()) {
      console.error("Error updating strategy configuration:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to update strategy configuration",
        },
        500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Strategy configuration updated successfully",
      data: updateData,
    });
  });

  app.delete("/config/vault", zValidator("json", deleteVaultConfigSchema), async (c) => {
    const { chainId, vaultAddress } = c.req.valid("json");

    const result = await dbClient.deleteVaultApyRange(chainId, vaultAddress as Address);

    if (result.isErr()) {
      console.error("Error deleting vault APY range:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to delete vault APY configuration",
        },
        500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Vault APY range deleted successfully",
    });
  });

  app.delete("/config/market", zValidator("json", deleteMarketConfigSchema), async (c) => {
    const { chainId, marketId } = c.req.valid("json");

    const result = await dbClient.deleteMarketApyRange(chainId, marketId as Hex);

    if (result.isErr()) {
      console.error("Error deleting market APY range:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to delete market APY configuration",
        },
        500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Market APY range deleted successfully",
    });
  });

  // Chain management endpoints
  app.get("/chains", async (c: Context) => {
    const chainsResult = await dbClient.getAllChainConfigsForUI();

    if (chainsResult.isErr()) {
      console.error("Error loading chains:", chainsResult.error);
      return c.json(
        {
          success: false,
          error: "Failed to load chains",
        },
        500,
      );
    }

    return c.json({
      success: true,
      data: chainsResult.value,
    });
  });

  app.patch("/chains/:chainId", zValidator("json", updateChainSchema), async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    const { enabled, executionInterval } = c.req.valid("json");

    if (isNaN(chainId)) {
      return c.json(
        {
          success: false,
          error: "Invalid chain ID",
        },
        400,
      );
    }

    // Update enabled status if provided
    if (enabled !== undefined) {
      const result = await dbClient.updateChainEnabled(chainId, enabled);
      if (result.isErr()) {
        console.error("Error updating chain enabled status:", result.error);
        return c.json(
          {
            success: false,
            error: "Failed to update chain status",
          },
          500,
        );
      }
    }

    // Update execution interval if provided
    if (executionInterval !== undefined) {
      const result = await dbClient.updateChainExecutionInterval(chainId, executionInterval);
      if (result.isErr()) {
        console.error("Error updating chain execution interval:", result.error);
        return c.json(
          {
            success: false,
            error: "Failed to update chain execution interval",
          },
          500,
        );
      }
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Chain configuration updated successfully",
    });
  });

  app.post("/chains/:chainId/vaults", zValidator("json", addVaultToWhitelistSchema), async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    const { vaultAddress } = c.req.valid("json");

    if (isNaN(chainId)) {
      return c.json(
        {
          success: false,
          error: "Invalid chain ID",
        },
        400,
      );
    }

    // Fetch vault name from blockchain
    const vaultMetadata = await metadataService.fetchVaultName(chainId, vaultAddress as Address);
    console.log(
      `Fetched vault metadata for ${vaultAddress} on chain ${String(chainId)}:`,
      vaultMetadata.name ?? "no name found",
    );

    const result = await dbClient.addVaultToWhitelist(
      chainId,
      vaultAddress as Address,
      vaultMetadata.name,
    );

    if (result.isErr()) {
      console.error("Error adding vault to whitelist:", result.error);

      // Check if it's a duplicate vault error
      const errorMessage = result.error.message;
      const isDuplicateError = errorMessage.includes("already whitelisted");

      return c.json(
        {
          success: false,
          error: isDuplicateError ? errorMessage : "Failed to add vault to whitelist",
        },
        isDuplicateError ? 400 : 500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Vault added to whitelist successfully",
      data: {
        chainId,
        vaultAddress,
        vaultName: vaultMetadata.name,
      },
    });
  });

  app.delete("/chains/:chainId/vaults/:vaultAddress", async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    const vaultAddress = c.req.param("vaultAddress");

    if (isNaN(chainId)) {
      return c.json(
        {
          success: false,
          error: "Invalid chain ID",
        },
        400,
      );
    }

    if (!isAddress(vaultAddress)) {
      return c.json(
        {
          success: false,
          error: "Invalid vault address",
        },
        400,
      );
    }

    const result = await dbClient.removeVaultFromWhitelist(chainId, vaultAddress);

    if (result.isErr()) {
      console.error("Error removing vault from whitelist:", result.error);
      return c.json(
        {
          success: false,
          error: "Failed to remove vault from whitelist",
        },
        500,
      );
    }

    // Trigger configuration reload
    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      message: "Vault removed from whitelist successfully",
    });
  });

  app.patch(
    "/chains/:chainId/vaults/:vaultAddress",
    zValidator("json", updateVaultSchema),
    async (c) => {
      const chainId = parseInt(c.req.param("chainId"));
      const vaultAddress = c.req.param("vaultAddress");
      const { enabled } = c.req.valid("json");

      if (isNaN(chainId)) {
        return c.json(
          {
            success: false,
            error: "Invalid chain ID",
          },
          400,
        );
      }

      if (!isAddress(vaultAddress)) {
        return c.json(
          {
            success: false,
            error: "Invalid vault address",
          },
          400,
        );
      }

      const result = await dbClient.updateVaultEnabled(chainId, vaultAddress, enabled);

      if (result.isErr()) {
        console.error("Error updating vault enabled status:", result.error);
        return c.json(
          {
            success: false,
            error: "Failed to update vault status",
          },
          500,
        );
      }

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Vault status updated successfully",
      });
    },
  );

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve static assets (CSS, JS, images) from UI build
  // Server runs from /app/apps/server/, so UI is at ../ui/dist/
  app.get("/assets/*", serveStatic({ root: "../ui/dist" }));
  app.get("/vite.svg", serveStatic({ path: "../ui/dist/vite.svg" }));

  // Fallback to index.html for SPA client-side routing
  app.get("*", async (c) => {
    try {
      // Server runs from /app/apps/server/ (where package.json is)
      // UI is at /app/apps/ui/dist/
      // So we need to go up one level: ../ui/dist/index.html
      const indexPath = join(process.cwd(), "../ui/dist/index.html");
      const html = await readFile(indexPath, "utf-8");
      return c.html(html);
    } catch (error) {
      console.error("Error serving index.html:", error);
      return c.text("UI not found. Error: " + String(error), 404);
    }
  });

  return app;
}
