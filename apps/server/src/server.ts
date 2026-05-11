import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono, Context } from "hono";
import { createPublicClient, http, isAddress, isHex, type Address, type Hex } from "viem";
import { readContract } from "viem/actions";
import { z } from "zod";

import { morphoBlueAbi } from "../abis/MorphoBlue";
import { vaultV2Abi } from "../abis/VaultV2";

import { chainConfigs } from "./config";
import { getChainName, getNativeSymbol } from "./constants";
import { marketV1CapId } from "./contracts/MorphoV2Client";
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
    minGasWei: z
      .string()
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (val === undefined || val === null) return true;
          try {
            return BigInt(val) >= 0n;
          } catch {
            return false;
          }
        },
        { message: "minGasWei must be a non-negative bigint string or null" },
      ),
    gasCheckIntervalSec: z.number().int().positive().optional(),
  })
  .refine(
    (data) =>
      data.enabled !== undefined ||
      data.executionInterval !== undefined ||
      data.minGasWei !== undefined ||
      data.gasCheckIntervalSec !== undefined,
    { message: "At least one field must be provided" },
  );

const addVaultToWhitelistSchema = z.object({
  vaultAddress: z.string().refine((val) => isAddress(val), {
    message: "Invalid Ethereum address",
  }),
  vaultVersion: z.enum(["V1", "V2"]).default("V1"),
});

const addV2MarketSchema = z.object({
  vaultAddress: z.string().refine((val) => isAddress(val), {
    message: "Invalid Ethereum address",
  }),
  marketId: z.string().refine((val) => isHex(val) && val.length === 66, {
    message: "Invalid market ID (must be 32-byte hex)",
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

    // Fetch market metadata (token symbols) from blockchain - this is mandatory
    const marketMetadataResult = await metadataService.fetchMarketMetadata(
      chainId,
      marketId as Hex,
    );

    if (marketMetadataResult.isErr()) {
      console.error(
        `Failed to fetch market metadata for ${marketId} on chain ${String(chainId)}:`,
        marketMetadataResult.error.message,
      );
      return c.json(
        {
          success: false,
          error: `Could not fetch market metadata for ${marketId}. The market may not exist on chain ${String(chainId)} or the chain RPC may be unavailable.`,
        },
        400,
      );
    }

    const marketMetadata = marketMetadataResult.value;
    console.log(
      `Fetched market metadata for ${marketId} on chain ${String(chainId)}:`,
      marketMetadata.collateralSymbol,
      "/",
      marketMetadata.loanSymbol,
    );

    const result = await dbClient.upsertMarketApyRange(chainId, marketId as Hex, minApy, maxApy, {
      collateralSymbol: marketMetadata.collateralSymbol,
      loanSymbol: marketMetadata.loanSymbol,
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
      data: chainsResult.value.map((cfg) => ({
        ...cfg,
        chainName: getChainName(cfg.chainId),
        nativeSymbol: getNativeSymbol(cfg.chainId),
        minGasWei: cfg.minGasWei === null ? null : cfg.minGasWei.toString(),
      })),
    });
  });

  app.patch("/chains/:chainId", zValidator("json", updateChainSchema), async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    const { enabled, executionInterval, minGasWei, gasCheckIntervalSec } = c.req.valid("json");

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

    // Update gas-monitor settings if provided
    if (minGasWei !== undefined || gasCheckIntervalSec !== undefined) {
      const result = await dbClient.updateChainGasMonitor(chainId, {
        minGasWei:
          minGasWei === undefined ? undefined : minGasWei === null ? null : BigInt(minGasWei),
        gasCheckIntervalSec,
      });
      if (result.isErr()) {
        console.error("Error updating chain gas monitor:", result.error);
        return c.json(
          {
            success: false,
            error: "Failed to update gas monitor settings",
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
    const { vaultAddress, vaultVersion } = c.req.valid("json");

    if (isNaN(chainId)) {
      return c.json(
        {
          success: false,
          error: "Invalid chain ID",
        },
        400,
      );
    }

    // Fetch vault name from blockchain - this is mandatory
    const vaultNameResult = await metadataService.fetchVaultName(chainId, vaultAddress as Address);

    if (vaultNameResult.isErr()) {
      console.error(
        `Failed to fetch vault name for ${vaultAddress} on chain ${String(chainId)}:`,
        vaultNameResult.error.message,
      );
      return c.json(
        {
          success: false,
          error: `Could not fetch vault name for ${vaultAddress}. The address may not be a valid MetaMorpho vault or the chain RPC may be unavailable.`,
        },
        400,
      );
    }

    const vaultName = vaultNameResult.value;
    console.log(`Fetched vault name for ${vaultAddress} on chain ${String(chainId)}:`, vaultName);

    const result = await dbClient.addVaultToWhitelist(
      chainId,
      vaultAddress as Address,
      vaultName,
      vaultVersion,
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
        vaultName,
        vaultVersion,
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

  // ---- V2 vault market list (read-only) ----
  // Source of truth for "which markets is the V2 vault allowed to use" is
  // the on-chain caps map; this endpoint exposes our cached view of that
  // (the rows seeded into `vault_v2_markets` and consumed by the V2 bot).
  app.get("/chains/:chainId/v2-markets", async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    if (isNaN(chainId)) {
      return c.json({ success: false, error: "Invalid chain ID" }, 400);
    }
    const result = await dbClient.getV2VaultMarkets(chainId);
    if (result.isErr()) {
      console.error("Error loading V2 vault markets:", result.error);
      return c.json({ success: false, error: "Failed to load V2 vault markets" }, 500);
    }
    return c.json({ success: true, data: result.value });
  });

  // Add a market to a V2 vault's curated list. Validates against the on-chain cap before inserting.
  // Endpoint introduced since we don't index the chain and cannot use V2 contract to read the cap (in case of new cap for vaults)
  app.post("/chains/:chainId/v2-markets", zValidator("json", addV2MarketSchema), async (c) => {
    const chainId = parseInt(c.req.param("chainId"));
    if (isNaN(chainId)) {
      return c.json({ success: false, error: "Invalid chain ID" }, 400);
    }

    const { vaultAddress, marketId } = c.req.valid("json");
    const vault = vaultAddress as Address;
    const market = marketId as Hex;

    const infraConfig = chainConfigs[chainId];
    if (!infraConfig) {
      return c.json({ success: false, error: `Chain ${String(chainId)} not configured` }, 400);
    }

    const rpcUrl =
      process.env[`RPC_URL_${String(chainId)}`] ?? infraConfig.chain.rpcUrls.default.http[0];
    const publicClient = createPublicClient({ chain: infraConfig.chain, transport: http(rpcUrl) });

    // Single-adapter assumption: Re7 V2 vaults run one MorphoMarketV1AdapterV2.
    // If a vault has multiple adapters this picks adapters[0]; the cap read
    // below would then fail for markets capped under any other adapter.
    let adapterAddress: Address;
    try {
      adapterAddress = await readContract(publicClient, {
        address: vault,
        abi: vaultV2Abi,
        functionName: "adapters",
        args: [0n],
      });
    } catch (error) {
      console.error(`POST /v2-markets: failed to read adapter for ${vault}:`, error);
      return c.json(
        {
          success: false,
          error: `Could not read adapter for vault ${vault} — confirm it's a V2 vault on chain ${String(chainId)}.`,
        },
        400,
      );
    }

    let paramsTuple: readonly [Address, Address, Address, Address, bigint];
    try {
      paramsTuple = await readContract(publicClient, {
        address: infraConfig.morpho,
        abi: morphoBlueAbi,
        functionName: "idToMarketParams",
        args: [market],
      });
    } catch (error) {
      console.error(`POST /v2-markets: idToMarketParams failed for ${market}:`, error);
      return c.json({ success: false, error: "Failed to read market params from MorphoBlue" }, 500);
    }

    const params = {
      loanToken: paramsTuple[0],
      collateralToken: paramsTuple[1],
      oracle: paramsTuple[2],
      irm: paramsTuple[3],
      lltv: paramsTuple[4],
    };

    // MorphoBlue returns the zero tuple for unknown market IDs (no revert).
    // Reject before doing anything else.
    if (params.loanToken === "0x0000000000000000000000000000000000000000") {
      return c.json(
        {
          success: false,
          error: `Market ${market} does not exist on MorphoBlue (chain ${String(chainId)}).`,
        },
        400,
      );
    }

    const capId = marketV1CapId(params, adapterAddress);
    let absoluteCap: bigint;
    try {
      absoluteCap = await readContract(publicClient, {
        address: vault,
        abi: vaultV2Abi,
        functionName: "absoluteCap",
        args: [capId],
      });
    } catch (error) {
      console.error(`POST /v2-markets: absoluteCap read failed for ${vault}:`, error);
      return c.json({ success: false, error: "Failed to read cap from V2 vault" }, 500);
    }

    if (absoluteCap === 0n) {
      return c.json(
        {
          success: false,
          error: `Vault ${vault} has no cap for market ${market} (absoluteCap == 0). Ask the curator to set a cap on-chain first.`,
        },
        400,
      );
    }

    const insertResult = await dbClient.addV2VaultMarket(chainId, vault, adapterAddress, market);
    if (insertResult.isErr()) {
      console.error("POST /v2-markets: insert failed:", insertResult.error);
      return c.json({ success: false, error: insertResult.error.message }, 500);
    }

    if (onConfigChange) {
      await onConfigChange();
    }

    return c.json({
      success: true,
      data: {
        chainId,
        vaultAddress: vault,
        adapterAddress,
        marketId: market,
        absoluteCap: absoluteCap.toString(),
      },
    });
  });

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
