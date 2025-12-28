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
}
