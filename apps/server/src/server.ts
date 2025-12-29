import { zValidator } from "@hono/zod-validator";
import { Hono, Context } from "hono";
import { isAddress, isHex } from "viem";
import { z } from "zod";

import { DatabaseClient } from "./database";

export type OnConfigChangeCallback = () => Promise<void>;

// Zod schemas for request validation
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

export function createServer(dbClient: DatabaseClient, onConfigChange?: OnConfigChangeCallback) {
  const app = new Hono();

  app.get("/config", async (c: Context) => {
    try {
      const config = await dbClient.loadApyConfiguration();
      return c.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Error loading configuration:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to load configuration",
        },
        500,
      );
    }
  });

  app.post("/config/vault", zValidator("json", vaultConfigSchema), async (c) => {
    try {
      const { chainId, vaultAddress, minApy, maxApy } = c.req.valid("json");

      // Validate APY values
      if (minApy < 0 || maxApy < 0) {
        return c.json(
          {
            success: false,
            error: "APY values must be non-negative",
          },
          400,
        );
      }

      if (minApy >= maxApy) {
        return c.json(
          {
            success: false,
            error: "minApy must be less than maxApy",
          },
          400,
        );
      }

      await dbClient.upsertVaultApyRange(chainId, vaultAddress, minApy, maxApy);

      // Trigger configuration reload
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
    } catch (error) {
      console.error("Error updating vault APY range:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update vault APY range",
        },
        500,
      );
    }
  });

  app.post("/config/market", zValidator("json", marketConfigSchema), async (c) => {
    try {
      const { chainId, marketId, minApy, maxApy } = c.req.valid("json");

      // Validate APY values
      if (minApy < 0 || maxApy < 0) {
        return c.json(
          {
            success: false,
            error: "APY values must be non-negative",
          },
          400,
        );
      }

      if (minApy >= maxApy) {
        return c.json(
          {
            success: false,
            error: "minApy must be less than maxApy",
          },
          400,
        );
      }

      await dbClient.upsertMarketApyRange(chainId, marketId, minApy, maxApy);

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
        },
      });
    } catch (error) {
      console.error("Error updating market APY range:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update market APY range",
        },
        500,
      );
    }
  });

  app.put("/config/strategy", zValidator("json", strategyConfigSchema), async (c) => {
    try {
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

      await dbClient.updateApyStrategyConfig(updateData);

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Strategy configuration updated successfully",
        data: updateData,
      });
    } catch (error) {
      console.error("Error updating strategy configuration:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update strategy configuration",
        },
        500,
      );
    }
  });

  app.delete("/config/vault", zValidator("json", deleteVaultConfigSchema), async (c) => {
    try {
      const { chainId, vaultAddress } = c.req.valid("json");

      await dbClient.deleteVaultApyRange(chainId, vaultAddress);

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Vault APY range deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting vault APY range:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete vault APY range",
        },
        500,
      );
    }
  });

  app.delete("/config/market", zValidator("json", deleteMarketConfigSchema), async (c) => {
    try {
      const { chainId, marketId } = c.req.valid("json");

      await dbClient.deleteMarketApyRange(chainId, marketId);

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Market APY range deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting market APY range:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete market APY range",
        },
        500,
      );
    }
  });

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}
