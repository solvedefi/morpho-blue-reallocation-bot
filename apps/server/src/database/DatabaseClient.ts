import { PrismaClient } from "@prisma/client";
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

  async connect(): Promise<void> {
    await this.prisma.$connect();
    console.log("Database connected successfully");
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Load all APY configuration from the database
   */
  async loadApyConfiguration(): Promise<ApyConfiguration> {
    // Fetch all configurations in parallel
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
    const defaultMinApy = strategyConfig ? parseFloat(strategyConfig.defaultMinApy.toString()) : 0;
    const defaultMaxApy = strategyConfig ? parseFloat(strategyConfig.defaultMaxApy.toString()) : 10; // 10%

    return {
      vaultRanges,
      marketRanges,
      allowIdleReallocation,
      defaultMinApy,
      defaultMaxApy,
    };
  }

  /**
   * Get APY range for a specific vault
   */
  async getVaultApyRange(chainId: number, vaultAddress: Address): Promise<ApyRangeConfig | null> {
    const config = await this.prisma.vaultApyConfig.findUnique({
      where: {
        unique_vault_config: {
          chainId,
          vaultAddress,
        },
      },
    });

    if (!config) return null;

    return {
      min: parseFloat(config.minApy.toString()),
      max: parseFloat(config.maxApy.toString()),
    };
  }

  /**
   * Get APY range for a specific market
   */
  async getMarketApyRange(chainId: number, marketId: Hex): Promise<ApyRangeConfig | null> {
    const config = await this.prisma.marketApyConfig.findUnique({
      where: {
        unique_market_config: {
          chainId,
          marketId,
        },
      },
    });

    if (!config) return null;

    return {
      min: parseFloat(config.minApy.toString()),
      max: parseFloat(config.maxApy.toString()),
    };
  }

  /**
   * Get global strategy configuration
   */
  async getApyStrategyConfig() {
    const config = await this.prisma.apyStrategyConfig.findFirst();

    if (!config) {
      return {
        allowIdleReallocation: true,
        defaultMinApy: 0,
        defaultMaxApy: 10,
      };
    }

    return {
      allowIdleReallocation: config.allowIdleReallocation,
      defaultMinApy: parseFloat(config.defaultMinApy.toString()),
      defaultMaxApy: parseFloat(config.defaultMaxApy.toString()),
    };
  }

  /**
   * Create or update APY range for a vault
   */
  async upsertVaultApyRange(
    chainId: number,
    vaultAddress: Address,
    minApy: number,
    maxApy: number,
  ): Promise<void> {
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
  }

  /**
   * Create or update APY range for a market
   */
  async upsertMarketApyRange(
    chainId: number,
    marketId: Hex,
    minApy: number,
    maxApy: number,
  ): Promise<void> {
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
  }

  /**
   * Update global strategy configuration
   */
  async updateApyStrategyConfig(config: {
    allowIdleReallocation?: boolean;
    defaultMinApy?: number;
    defaultMaxApy?: number;
  }): Promise<void> {
    // Get or create the first (and only) strategy config
    let existingConfig = await this.prisma.apyStrategyConfig.findFirst();

    if (!existingConfig) {
      existingConfig = await this.prisma.apyStrategyConfig.create({
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
  }

  /**
   * Delete APY range for a vault
   */
  async deleteVaultApyRange(chainId: number, vaultAddress: Address): Promise<void> {
    await this.prisma.vaultApyConfig.delete({
      where: {
        unique_vault_config: {
          chainId,
          vaultAddress,
        },
      },
    });
  }

  /**
   * Delete APY range for a market
   */
  async deleteMarketApyRange(chainId: number, marketId: Hex): Promise<void> {
    await this.prisma.marketApyConfig.delete({
      where: {
        unique_market_config: {
          chainId,
          marketId,
        },
      },
    });
  }

  /**
   * Get operational configuration for a chain (execution interval and vault whitelist)
   */
  async getChainConfig(chainId: number): Promise<ChainOperationalConfig | null> {
    const config = await this.prisma.chainConfig.findUnique({
      where: { chainId },
      include: {
        vaultWhitelist: {
          where: { enabled: true },
        },
      },
    });

    if (!config) return null;

    return {
      chainId: config.chainId,
      executionInterval: config.executionInterval,
      enabled: config.enabled,
      vaultWhitelist: config.vaultWhitelist.map((v) => v.vaultAddress as Address),
    };
  }

  /**
   * Get all enabled chain configs
   */
  async getAllChainConfigs(): Promise<ChainOperationalConfig[]> {
    const configs = await this.prisma.chainConfig.findMany({
      where: { enabled: true },
      include: {
        vaultWhitelist: {
          where: { enabled: true },
        },
      },
    });

    return configs.map((config) => ({
      chainId: config.chainId,
      executionInterval: config.executionInterval,
      enabled: config.enabled,
      vaultWhitelist: config.vaultWhitelist.map((v) => v.vaultAddress as Address),
    }));
  }

  /**
   * Upsert chain configuration
   */
  async upsertChainConfig(
    chainId: number,
    executionInterval: number,
    enabled = true,
  ): Promise<void> {
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
  }

  /**
   * Add vault to whitelist
   */
  async addVaultToWhitelist(chainId: number, vaultAddress: Address): Promise<void> {
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
  }

  /**
   * Remove vault from whitelist (soft delete by setting enabled = false)
   */
  async removeVaultFromWhitelist(chainId: number, vaultAddress: Address): Promise<void> {
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
  }

  /**
   * Get strategy thresholds
   */
  async getStrategyThresholds(): Promise<StrategyThresholds> {
    const config = await this.prisma.strategyThresholds.findFirst();

    if (!config) {
      return {
        defaultMinApyDeltaBips: 50,
        defaultMinUtilizationDeltaBips: 25,
        defaultMinAprDeltaBips: 0,
      };
    }

    return {
      defaultMinApyDeltaBips: config.defaultMinApyDeltaBips,
      defaultMinUtilizationDeltaBips: config.defaultMinUtilizationDeltaBips,
      defaultMinAprDeltaBips: config.defaultMinAprDeltaBips,
    };
  }

  /**
   * Update strategy thresholds
   */
  async updateStrategyThresholds(thresholds: Partial<StrategyThresholds>): Promise<void> {
    let existing = await this.prisma.strategyThresholds.findFirst();

    if (!existing) {
      existing = await this.prisma.strategyThresholds.create({
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
  }

  /**
   * Get vault-specific strategy threshold overrides
   */
  async getVaultStrategyThresholds(chainId: number, vaultAddress: Address) {
    const config = await this.prisma.vaultStrategyThresholds.findUnique({
      where: {
        chainId_vaultAddress: {
          chainId,
          vaultAddress,
        },
      },
    });

    if (!config) return null;

    return {
      minApyDeltaBips: config.minApyDeltaBips,
      minUtilizationDeltaBips: config.minUtilizationDeltaBips,
      minAprDeltaBips: config.minAprDeltaBips,
    };
  }
}
