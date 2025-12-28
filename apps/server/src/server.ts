import { Hono } from "hono";
import { Address, Hex, isAddress, isHex } from "viem";

export interface DatabaseClient {
  loadApyConfiguration(): Promise<ApyConfiguration>;
  upsertVaultApyRange(
    chainId: number,
    vaultAddress: Address,
    minApy: number,
    maxApy: number,
  ): Promise<void>;
  upsertMarketApyRange(
    chainId: number,
    marketId: Hex,
    minApy: number,
    maxApy: number,
  ): Promise<void>;
  updateApyStrategyConfig(config: {
    allowIdleReallocation?: boolean;
    defaultMinApy?: number;
    defaultMaxApy?: number;
  }): Promise<void>;
  deleteVaultApyRange(chainId: number, vaultAddress: Address): Promise<void>;
  deleteMarketApyRange(chainId: number, marketId: Hex): Promise<void>;
}

export interface ApyRangeConfig {
  min: number;
  max: number;
}

export type VaultApyRanges = Record<string, ApyRangeConfig>;
export type MarketApyRanges = Record<string, ApyRangeConfig>;

export interface ApyConfiguration {
  vaultRanges: Record<number, VaultApyRanges>;
  marketRanges: Record<number, MarketApyRanges>;
  allowIdleReallocation: boolean;
  defaultMinApy: number;
  defaultMaxApy: number;
}

export type OnConfigChangeCallback = () => Promise<void>;

export function createServer(dbClient: DatabaseClient, onConfigChange?: OnConfigChangeCallback) {
  const app = new Hono();

  // GET /config - Get all current configuration
  app.get("/config", async (c) => {
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

  // POST /config/vault - Add or update APY range for a vault
  app.post("/config/vault", async (c) => {
    try {
      const body = await c.req.json();
      const { chainId, vaultAddress, minApy, maxApy } = body;

      // Validate required fields
      if (!chainId || !vaultAddress || minApy === undefined || maxApy === undefined) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: chainId, vaultAddress, minApy, maxApy",
          },
          400,
        );
      }

      // Validate chainId is a number
      const chainIdNum = Number(chainId);
      if (isNaN(chainIdNum)) {
        return c.json(
          {
            success: false,
            error: "chainId must be a valid number",
          },
          400,
        );
      }

      // Validate vaultAddress is a valid Ethereum address
      if (!isAddress(vaultAddress)) {
        return c.json(
          {
            success: false,
            error: "vaultAddress must be a valid Ethereum address",
          },
          400,
        );
      }

      // Validate APY values
      const minApyNum = Number(minApy);
      const maxApyNum = Number(maxApy);
      if (isNaN(minApyNum) || isNaN(maxApyNum)) {
        return c.json(
          {
            success: false,
            error: "minApy and maxApy must be valid numbers",
          },
          400,
        );
      }

      if (minApyNum < 0 || maxApyNum < 0) {
        return c.json(
          {
            success: false,
            error: "APY values must be non-negative",
          },
          400,
        );
      }

      if (minApyNum >= maxApyNum) {
        return c.json(
          {
            success: false,
            error: "minApy must be less than maxApy",
          },
          400,
        );
      }

      await dbClient.upsertVaultApyRange(chainIdNum, vaultAddress, minApyNum, maxApyNum);

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Vault APY range configured successfully",
        data: {
          chainId: chainIdNum,
          vaultAddress,
          minApy: minApyNum,
          maxApy: maxApyNum,
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

  // POST /config/market - Add or update APY range for a market
  app.post("/config/market", async (c) => {
    try {
      const body = await c.req.json();
      const { chainId, marketId, minApy, maxApy } = body;

      // Validate required fields
      if (!chainId || !marketId || minApy === undefined || maxApy === undefined) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: chainId, marketId, minApy, maxApy",
          },
          400,
        );
      }

      // Validate chainId is a number
      const chainIdNum = Number(chainId);
      if (isNaN(chainIdNum)) {
        return c.json(
          {
            success: false,
            error: "chainId must be a valid number",
          },
          400,
        );
      }

      // Validate marketId is a valid hex string
      if (!isHex(marketId)) {
        return c.json(
          {
            success: false,
            error: "marketId must be a valid hex string",
          },
          400,
        );
      }

      // Validate APY values
      const minApyNum = Number(minApy);
      const maxApyNum = Number(maxApy);
      if (isNaN(minApyNum) || isNaN(maxApyNum)) {
        return c.json(
          {
            success: false,
            error: "minApy and maxApy must be valid numbers",
          },
          400,
        );
      }

      if (minApyNum < 0 || maxApyNum < 0) {
        return c.json(
          {
            success: false,
            error: "APY values must be non-negative",
          },
          400,
        );
      }

      if (minApyNum >= maxApyNum) {
        return c.json(
          {
            success: false,
            error: "minApy must be less than maxApy",
          },
          400,
        );
      }

      await dbClient.upsertMarketApyRange(chainIdNum, marketId, minApyNum, maxApyNum);

      // Trigger configuration reload
      if (onConfigChange) {
        await onConfigChange();
      }

      return c.json({
        success: true,
        message: "Market APY range configured successfully",
        data: {
          chainId: chainIdNum,
          marketId,
          minApy: minApyNum,
          maxApy: maxApyNum,
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

  // PUT /config/strategy - Update global strategy configuration
  app.put("/config/strategy", async (c) => {
    try {
      const body = await c.req.json();
      const { allowIdleReallocation, defaultMinApy, defaultMaxApy } = body;

      // Validate at least one field is provided
      if (
        allowIdleReallocation === undefined &&
        defaultMinApy === undefined &&
        defaultMaxApy === undefined
      ) {
        return c.json(
          {
            success: false,
            error:
              "At least one field must be provided: allowIdleReallocation, defaultMinApy, defaultMaxApy",
          },
          400,
        );
      }

      const updateData: {
        allowIdleReallocation?: boolean;
        defaultMinApy?: number;
        defaultMaxApy?: number;
      } = {};

      // Validate allowIdleReallocation if provided
      if (allowIdleReallocation !== undefined) {
        if (typeof allowIdleReallocation !== "boolean") {
          return c.json(
            {
              success: false,
              error: "allowIdleReallocation must be a boolean",
            },
            400,
          );
        }
        updateData.allowIdleReallocation = allowIdleReallocation;
      }

      // Validate defaultMinApy if provided
      if (defaultMinApy !== undefined) {
        const defaultMinApyNum = Number(defaultMinApy);
        if (isNaN(defaultMinApyNum) || defaultMinApyNum < 0) {
          return c.json(
            {
              success: false,
              error: "defaultMinApy must be a non-negative number",
            },
            400,
          );
        }
        updateData.defaultMinApy = defaultMinApyNum;
      }

      // Validate defaultMaxApy if provided
      if (defaultMaxApy !== undefined) {
        const defaultMaxApyNum = Number(defaultMaxApy);
        if (isNaN(defaultMaxApyNum) || defaultMaxApyNum < 0) {
          return c.json(
            {
              success: false,
              error: "defaultMaxApy must be a non-negative number",
            },
            400,
          );
        }
        updateData.defaultMaxApy = defaultMaxApyNum;
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

  // DELETE /config/vault - Delete APY range for a vault
  app.delete("/config/vault", async (c) => {
    try {
      const { chainId, vaultAddress } = await c.req.json();

      // Validate required fields
      if (!chainId || !vaultAddress) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: chainId, vaultAddress",
          },
          400,
        );
      }

      // Validate chainId is a number
      const chainIdNum = Number(chainId);
      if (isNaN(chainIdNum)) {
        return c.json(
          {
            success: false,
            error: "chainId must be a valid number",
          },
          400,
        );
      }

      // Validate vaultAddress is a valid Ethereum address
      if (!isAddress(vaultAddress)) {
        return c.json(
          {
            success: false,
            error: "vaultAddress must be a valid Ethereum address",
          },
          400,
        );
      }

      await dbClient.deleteVaultApyRange(chainIdNum, vaultAddress);

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

  // DELETE /config/market - Delete APY range for a market
  app.delete("/config/market", async (c) => {
    try {
      const { chainId, marketId } = await c.req.json();

      // Validate required fields
      if (!chainId || !marketId) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: chainId, marketId",
          },
          400,
        );
      }

      // Validate chainId is a number
      const chainIdNum = Number(chainId);
      if (isNaN(chainIdNum)) {
        return c.json(
          {
            success: false,
            error: "chainId must be a valid number",
          },
          400,
        );
      }

      // Validate marketId is a valid hex string
      if (!isHex(marketId)) {
        return c.json(
          {
            success: false,
            error: "marketId must be a valid hex string",
          },
          400,
        );
      }

      await dbClient.deleteMarketApyRange(chainIdNum, marketId);

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

  // GET /health - Health check endpoint
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}
