# Database Integration Summary

## Overview

We've successfully integrated PostgreSQL database configuration into the Morpho Blue Reallocation Bot. The bot now loads all APY range configurations from the database on startup instead of using hardcoded values.

## Changes Made

### 1. Database Client (`apps/client/src/database/client.ts`)

Created a comprehensive database client with the following features:

- **`loadApyConfiguration()`**: Loads all configuration on startup
  - Vault APY ranges (by chain + vault address)
  - Market APY ranges (by chain + market ID)
  - Global strategy settings (idle reallocation, default ranges)

- **`getVaultApyRange()`**: Get APY range for a specific vault
- **`getMarketApyRange()`**: Get APY range for a specific market
- **`getApyStrategyConfig()`**: Get global strategy configuration

### 2. APY Configuration Interface

```typescript
export interface ApyConfiguration {
  vaultRanges: Record<number, VaultApyRanges>;  // chainId -> vault -> range
  marketRanges: Record<number, MarketApyRanges>; // chainId -> market -> range
  allowIdleReallocation: boolean;
  defaultMinApy: number;
  defaultMaxApy: number;
}
```

### 3. Updated ApyRange Strategy (`apps/client/src/strategies/apyRange/index.ts`)

- Constructor now accepts `ApyConfiguration` parameter
- Uses database configuration instead of hardcoded values from config package
- Maintains the same priority logic:
  1. Market-specific configuration (highest priority)
  2. Vault-specific configuration
  3. Global default configuration (lowest priority)

### 4. Updated Service Entry Point (`apps/client/src/index.ts`)

- Creates database client on startup
- Loads complete configuration before starting bots
- Passes configuration to strategy instances
- Logs configuration summary on startup

### 5. Updated Tests (`apps/client/test/vitest/strategies/apyRange.test.ts`)

- Modified `StrategyMock` to work with new `ApyConfiguration` interface
- Tests now convert `TestConfig` to `ApyConfiguration` format
- All existing tests pass without changes to test logic

## Database Schema

The database stores three types of configuration:

### `vault_apy_config`
```sql
CREATE TABLE "vault_apy_config" (
    "id" SERIAL PRIMARY KEY,
    "chain_id" INTEGER NOT NULL,
    "vault_address" VARCHAR(42) NOT NULL,
    "min_apy" DECIMAL(10,4) NOT NULL,
    "max_apy" DECIMAL(10,4) NOT NULL,
    ...
    UNIQUE (chain_id, vault_address)
);
```

### `market_apy_config`
```sql
CREATE TABLE "market_apy_config" (
    "id" SERIAL PRIMARY KEY,
    "chain_id" INTEGER NOT NULL,
    "market_id" VARCHAR(66) NOT NULL,
    "min_apy" DECIMAL(10,4) NOT NULL,
    "max_apy" DECIMAL(10,4) NOT NULL,
    ...
    UNIQUE (chain_id, market_id)
);
```

### `apy_strategy_config`
```sql
CREATE TABLE "apy_strategy_config" (
    "id" SERIAL PRIMARY KEY,
    "allow_idle_reallocation" BOOLEAN DEFAULT true,
    "default_min_apy" DECIMAL(10,4) DEFAULT 0,
    "default_max_apy" DECIMAL(10,4) DEFAULT 10,
    ...
);
```

## Data Format

APY values are stored as percentages:
- Database: `5.5` = 5.5%
- Application: Converted to WAD format internally (18 decimals)

## Configuration Priority

When determining APY ranges for a market:

1. **Market-specific** (`market_apy_config`) - Highest priority
2. **Vault-specific** (`vault_apy_config`) - Medium priority
3. **Global default** (`apy_strategy_config`) - Lowest priority

## Startup Flow

1. Service starts
2. Database client connects to PostgreSQL
3. Loads all APY configuration from database
4. Logs configuration summary
5. Creates strategy instances with loaded configuration
6. Starts reallocation bots for each chain
7. Bots use database configuration for all reallocation decisions

## Example Startup Output

```
Loading APY configuration from database...
APY configuration loaded successfully
- Allow idle reallocation: true
- Default APY range: 0 - 10
- Vault configurations: 1 chains
- Market configurations: 5 chains
```

## Migration Data

All existing configuration from the config package has been migrated to the database:

- **2 vault configurations** (Worldchain)
- **58 market configurations** across:
  - Plume (8 markets)
  - Mainnet (24 markets)
  - Base (15 markets)
  - Worldchain (1 market)
  - Berachain (1 market)
- **1 global strategy config** (allow idle reallocation, default 0-10% range)

## Benefits

1. **Dynamic Configuration**: APY ranges can be updated without code changes
2. **Centralized Management**: All configuration in one place
3. **Easy Updates**: Use Prisma Studio or SQL to modify ranges
4. **Audit Trail**: Database tracks creation and update timestamps
5. **Type Safety**: Full TypeScript support with Prisma client

## Commands

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Open Prisma Studio (GUI)
pnpm db:studio

# Reset database
pnpm db:reset
```

## Next Steps

The bot is now fully integrated with the database and ready to run. All APY range configurations are loaded from the database on startup and used for reallocation decisions.
