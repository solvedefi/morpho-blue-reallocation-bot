import { PrismaClient } from "@prisma/client";
import { Result, ok, err } from "neverthrow";
import { Address, Hex } from "viem";

export interface ApyRangeConfig {
  min: number;
  max: number;
}

export type VaultApyRanges = Record<string, ApyRangeConfig>;
export type MarketApyRanges = Record<string, ApyRangeConfig>;

export interface ApyConfiguration {
  vaultRanges: Record<number, VaultApyRanges>; // chainId -> vault address -> range
  marketRanges: Record<number, MarketApyRanges>; // chainId -> market id -> range
  allowIdleReallocation: boolean;
  defaultMinApy: number;
  defaultMaxApy: number;
}

export interface ChainOperationalConfig {
  chainId: number;
  executionInterval: number; // in seconds
  vaultWhitelist: Address[];
  enabled: boolean;
}

export interface StrategyThresholds {
  defaultMinApyDeltaBips: number;
  defaultMinUtilizationDeltaBips: number;
  defaultMinAprDeltaBips: number;
}

export class DatabaseClient {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect(): Promise<Result<null, Error>> {
    try {
      await this.prisma.$connect();
      console.log("Database connected successfully");
      return ok(null);
    } catch (error) {
      return err(new Error(`Failed to connect to database: ${String(error)}`));
    }
  }

  async disconnect(): Promise<Result<null, Error>> {
    try {
      await this.prisma.$disconnect();
      return ok(null);
    } catch (error) {
      return err(new Error(`Failed to disconnect from database: ${String(error)}`));
    }
  }

  /**
   * Load all APY configuration from the database
   */
  async loadApyConfiguration(): Promise<Result<ApyConfiguration, Error>> {
    try {
      const [vaultConfigs, marketConfigs, strategyConfig] = await Promise.all([
        this.prisma.vaultApyConfig.findMany(),
        this.prisma.marketApyConfig.findMany(),
        this.prisma.apyStrategyConfig.findFirst(),
      ]);

      // Group vault configs by chainId
      const vaultRanges: Record<number, VaultApyRanges> = {};
      for (const config of vaultConfigs) {
        vaultRanges[config.chainId] ??= {};
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        vaultRanges[config.chainId]![config.vaultAddress] = {
          min: parseFloat(config.minApy.toString()),
          max: parseFloat(config.maxApy.toString()),
        };
      }

      // Group market configs by chainId
      const marketRanges: Record<number, MarketApyRanges> = {};
      for (const config of marketConfigs) {
        marketRanges[config.chainId] ??= {};
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        marketRanges[config.chainId]![config.marketId] = {
          min: parseFloat(config.minApy.toString()),
          max: parseFloat(config.maxApy.toString()),
        };
      }

      // Use defaults if no strategy config exists
      const allowIdleReallocation = strategyConfig?.allowIdleReallocation ?? true;
      const defaultMinApy = strategyConfig
        ? parseFloat(strategyConfig.defaultMinApy.toString())
        : 0;
      const defaultMaxApy = strategyConfig
        ? parseFloat(strategyConfig.defaultMaxApy.toString())
        : 10; // 10%

      return ok({
        vaultRanges,
        marketRanges,
        allowIdleReallocation,
        defaultMinApy,
        defaultMaxApy,
      });
    } catch (error) {
      return err(new Error(`Failed to load APY configuration: ${String(error)}`));
    }
  }

  /**
   * Get APY range for a specific vault
   */
  async getVaultApyRange(
    chainId: number,
    vaultAddress: Address,
  ): Promise<Result<ApyRangeConfig | null, Error>> {
    try {
      const config = await this.prisma.vaultApyConfig.findUnique({
        where: {
          unique_vault_config: {
            chainId,
            vaultAddress,
          },
        },
      });

      if (!config) return ok(null);

      return ok({
        min: parseFloat(config.minApy.toString()),
        max: parseFloat(config.maxApy.toString()),
      });
    } catch (error) {
      return err(new Error(`Failed to get vault APY range for ${vaultAddress}: ${String(error)}`));
    }
  }

  /**
   * Get APY range for a specific market
   */
  async getMarketApyRange(
    chainId: number,
    marketId: Hex,
  ): Promise<Result<ApyRangeConfig | null, Error>> {
    try {
      const config = await this.prisma.marketApyConfig.findUnique({
        where: {
          unique_market_config: {
            chainId,
            marketId,
          },
        },
      });

      if (!config) return ok(null);

      return ok({
        min: parseFloat(config.minApy.toString()),
        max: parseFloat(config.maxApy.toString()),
      });
    } catch (error) {
      return err(new Error(`Failed to get market APY range for ${marketId}: ${String(error)}`));
    }
  }

  /**
   * Get global strategy configuration
   */
  async getApyStrategyConfig(): Promise<
    Result<{ allowIdleReallocation: boolean; defaultMinApy: number; defaultMaxApy: number }, Error>
  > {
    try {
      const config = await this.prisma.apyStrategyConfig.findFirst();

      if (!config) {
        return ok({
          allowIdleReallocation: true,
          defaultMinApy: 0,
          defaultMaxApy: 10,
        });
      }

      return ok({
        allowIdleReallocation: config.allowIdleReallocation,
        defaultMinApy: parseFloat(config.defaultMinApy.toString()),
        defaultMaxApy: parseFloat(config.defaultMaxApy.toString()),
      });
    } catch (error) {
      return err(new Error(`Failed to get APY strategy config: ${String(error)}`));
    }
  }

  /**
   * Create or update APY range for a vault
   */
  async upsertVaultApyRange(
    chainId: number,
    vaultAddress: Address,
    minApy: number,
    maxApy: number,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.vaultApyConfig.upsert({
        where: {
          unique_vault_config: {
            chainId,
            vaultAddress,
          },
        },
        create: {
          chainId,
          vaultAddress,
          minApy,
          maxApy,
        },
        update: {
          minApy,
          maxApy,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(
        new Error(`Failed to upsert vault APY range for ${vaultAddress}: ${String(error)}`),
      );
    }
  }

  /**
   * Create or update APY range for a market
   */
  async upsertMarketApyRange(
    chainId: number,
    marketId: Hex,
    minApy: number,
    maxApy: number,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.marketApyConfig.upsert({
        where: {
          unique_market_config: {
            chainId,
            marketId,
          },
        },
        create: {
          chainId,
          marketId,
          minApy,
          maxApy,
        },
        update: {
          minApy,
          maxApy,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to upsert market APY range for ${marketId}: ${String(error)}`));
    }
  }

  /**
   * Update global strategy configuration
   */
  async updateApyStrategyConfig(config: {
    allowIdleReallocation?: boolean;
    defaultMinApy?: number;
    defaultMaxApy?: number;
  }): Promise<Result<void, Error>> {
    try {
      const existingConfig = await this.prisma.apyStrategyConfig.findFirst();

      if (!existingConfig) {
        await this.prisma.apyStrategyConfig.create({
          data: {
            allowIdleReallocation: config.allowIdleReallocation ?? true,
            defaultMinApy: config.defaultMinApy ?? 0,
            defaultMaxApy: config.defaultMaxApy ?? 10,
          },
        });
      } else {
        await this.prisma.apyStrategyConfig.update({
          where: { id: existingConfig.id },
          data: config,
        });
      }
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to update APY strategy config: ${String(error)}`));
    }
  }

  /**
   * Delete APY range for a vault
   */
  async deleteVaultApyRange(chainId: number, vaultAddress: Address): Promise<Result<void, Error>> {
    try {
      await this.prisma.vaultApyConfig.delete({
        where: {
          unique_vault_config: {
            chainId,
            vaultAddress,
          },
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(
        new Error(`Failed to delete vault APY range for ${vaultAddress}: ${String(error)}`),
      );
    }
  }

  /**
   * Delete APY range for a market
   */
  async deleteMarketApyRange(chainId: number, marketId: Hex): Promise<Result<void, Error>> {
    try {
      await this.prisma.marketApyConfig.delete({
        where: {
          unique_market_config: {
            chainId,
            marketId,
          },
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to delete market APY range for ${marketId}: ${String(error)}`));
    }
  }

  /**
   * Get operational configuration for a chain (execution interval and vault whitelist)
   */
  async getChainConfig(chainId: number): Promise<Result<ChainOperationalConfig | null, Error>> {
    try {
      const config = await this.prisma.chainConfig.findUnique({
        where: { chainId },
        include: {
          vaultWhitelist: {
            where: { enabled: true },
          },
        },
      });

      if (!config) return ok(null);

      return ok({
        chainId: config.chainId,
        executionInterval: config.executionInterval,
        enabled: config.enabled,
        vaultWhitelist: config.vaultWhitelist.map((v) => v.vaultAddress as Address),
      });
    } catch (error) {
      return err(
        new Error(`Failed to get chain config for chainId ${String(chainId)}: ${String(error)}`),
      );
    }
  }

  /**
   * Get all enabled chain configs
   */
  async getAllChainConfigs(): Promise<Result<ChainOperationalConfig[], Error>> {
    try {
      const configs = await this.prisma.chainConfig.findMany({
        where: { enabled: true },
        include: {
          vaultWhitelist: {
            where: { enabled: true },
          },
        },
      });

      return ok(
        configs.map((config) => ({
          chainId: config.chainId,
          executionInterval: config.executionInterval,
          enabled: config.enabled,
          vaultWhitelist: config.vaultWhitelist.map((v) => v.vaultAddress as Address),
        })),
      );
    } catch (error) {
      return err(new Error(`Failed to get all chain configs: ${String(error)}`));
    }
  }

  /**
   * Upsert chain configuration
   */
  async upsertChainConfig(
    chainId: number,
    executionInterval: number,
    enabled = true,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.chainConfig.upsert({
        where: { chainId },
        create: {
          chainId,
          executionInterval,
          enabled,
        },
        update: {
          executionInterval,
          enabled,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(
        new Error(`Failed to upsert chain config for chainId ${String(chainId)}: ${String(error)}`),
      );
    }
  }

  /**
   * Add vault to whitelist
   */
  async addVaultToWhitelist(chainId: number, vaultAddress: Address): Promise<Result<void, Error>> {
    try {
      await this.prisma.vaultWhitelist.upsert({
        where: {
          chainId_vaultAddress: {
            chainId,
            vaultAddress,
          },
        },
        create: {
          chainId,
          vaultAddress,
          enabled: true,
        },
        update: {
          enabled: true,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to add vault ${vaultAddress} to whitelist: ${String(error)}`));
    }
  }

  /**
   * Remove vault from whitelist (soft delete by setting enabled = false)
   */
  async removeVaultFromWhitelist(
    chainId: number,
    vaultAddress: Address,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.vaultWhitelist.update({
        where: {
          chainId_vaultAddress: {
            chainId,
            vaultAddress,
          },
        },
        data: {
          enabled: false,
        },
      });
      return ok(undefined);
    } catch (error) {
      return err(
        new Error(`Failed to remove vault ${vaultAddress} from whitelist: ${String(error)}`),
      );
    }
  }

  /**
   * Get strategy thresholds
   */
  async getStrategyThresholds(): Promise<Result<StrategyThresholds, Error>> {
    try {
      const config = await this.prisma.strategyThresholds.findFirst();

      if (!config) {
        return ok({
          defaultMinApyDeltaBips: 50,
          defaultMinUtilizationDeltaBips: 25,
          defaultMinAprDeltaBips: 0,
        });
      }

      return ok({
        defaultMinApyDeltaBips: config.defaultMinApyDeltaBips,
        defaultMinUtilizationDeltaBips: config.defaultMinUtilizationDeltaBips,
        defaultMinAprDeltaBips: config.defaultMinAprDeltaBips,
      });
    } catch (error) {
      return err(new Error(`Failed to get strategy thresholds: ${String(error)}`));
    }
  }

  /**
   * Update strategy thresholds
   */
  async updateStrategyThresholds(
    thresholds: Partial<StrategyThresholds>,
  ): Promise<Result<void, Error>> {
    try {
      const existing = await this.prisma.strategyThresholds.findFirst();

      if (!existing) {
        await this.prisma.strategyThresholds.create({
          data: {
            defaultMinApyDeltaBips: thresholds.defaultMinApyDeltaBips ?? 50,
            defaultMinUtilizationDeltaBips: thresholds.defaultMinUtilizationDeltaBips ?? 25,
            defaultMinAprDeltaBips: thresholds.defaultMinAprDeltaBips ?? 0,
          },
        });
      } else {
        await this.prisma.strategyThresholds.update({
          where: { id: existing.id },
          data: thresholds,
        });
      }
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to update strategy thresholds: ${String(error)}`));
    }
  }

  /**
   * Get vault-specific strategy threshold overrides
   */
  async getVaultStrategyThresholds(
    chainId: number,
    vaultAddress: Address,
  ): Promise<
    Result<
      {
        minApyDeltaBips: number | null;
        minUtilizationDeltaBips: number | null;
        minAprDeltaBips: number | null;
      } | null,
      Error
    >
  > {
    try {
      const config = await this.prisma.vaultStrategyThresholds.findUnique({
        where: {
          chainId_vaultAddress: {
            chainId,
            vaultAddress,
          },
        },
      });

      if (!config) return ok(null);

      return ok({
        minApyDeltaBips: config.minApyDeltaBips,
        minUtilizationDeltaBips: config.minUtilizationDeltaBips,
        minAprDeltaBips: config.minAprDeltaBips,
      });
    } catch (error) {
      return err(
        new Error(`Failed to get vault strategy thresholds for ${vaultAddress}: ${String(error)}`),
      );
    }
  }
}
