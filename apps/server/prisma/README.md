# Database Configuration

This directory contains the Prisma schema and migrations for managing APY range configurations in the Morpho Blue Reallocation Bot.

## Database Schema

The database consists of three main tables:

### 1. `vault_apy_config`
Stores APY range configurations for specific vaults.

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| chain_id | Integer | Blockchain network ID |
| vault_address | String | Vault contract address (checksummed) |
| min_apy | Decimal(10,4) | Minimum APY percentage |
| max_apy | Decimal(10,4) | Maximum APY percentage |
| min_apy_delta_bips | Integer | Minimum APY delta in basis points (default: 25) |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last update time |

**Constraints:**
- Unique constraint on `(chain_id, vault_address)`
- Check constraint: `min_apy < max_apy`

### 2. `market_apy_config`
Stores APY range configurations for specific markets.

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| chain_id | Integer | Blockchain network ID |
| market_id | String | Market identifier (hash) |
| min_apy | Decimal(10,4) | Minimum APY percentage |
| max_apy | Decimal(10,4) | Maximum APY percentage |
| min_apy_delta_bips | Integer | Minimum APY delta in basis points (default: 25) |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last update time |

**Constraints:**
- Unique constraint on `(chain_id, market_id)`
- Check constraint: `min_apy < max_apy`

### 3. `apy_strategy_config`
Stores global APY strategy configuration (single row).

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary key |
| allow_idle_reallocation | Boolean | Whether to allow idle market reallocation |
| default_min_apy | Decimal(10,4) | Default minimum APY (default: 0) |
| default_max_apy | Decimal(10,4) | Default maximum APY (default: 10) |
| default_min_apy_delta_bips | Integer | Default min APY delta in bips (default: 25) |
| updated_at | Timestamp | Last update time |

## Environment Variables

Create a `.env` file in the `apps/client` directory with:

```env
DATABASE_URL="postgresql://morpho_user:morpho_password@localhost:5432/morpho_bot"
```

For Docker deployment, this is automatically configured in `docker-compose.yml`.

## Available Commands

Run these commands from the `apps/client` directory:

### Generate Prisma Client
```bash
pnpm db:generate
```
Generates the Prisma Client based on your schema. Run this after any schema changes.

### Run Migrations (Development)
```bash
pnpm db:migrate:dev
```
Creates and applies new migrations. Use this during development.

### Run Migrations (Production)
```bash
pnpm db:migrate
```
Applies pending migrations. Use this in production/Docker.

### Seed Database
```bash
pnpm db:seed
```
Populates the database with initial configuration from `apps/config/src/strategies/apyRange.ts`.

### Open Prisma Studio
```bash
pnpm db:studio
```
Opens a visual database browser at http://localhost:5555

### Reset Database
```bash
pnpm db:reset
```
⚠️ **Warning:** Drops the database, recreates it, runs all migrations, and seeds data.

## Docker Setup

### Start Services
```bash
docker compose up -d
```

This will:
1. Start PostgreSQL container
2. Build and start the reallocation bot
3. Automatically run migrations and seed data

### View Logs
```bash
docker compose logs -f reallocation_bot
```

### Access Database Directly
```bash
docker compose exec postgres psql -U morpho_user -d morpho_bot
```

## Development Workflow

1. **Start local database:**
   ```bash
   docker compose up -d postgres
   ```

2. **Make schema changes** in `schema.prisma`

3. **Create migration:**
   ```bash
   pnpm db:migrate:dev --name your_migration_name
   ```

4. **View data:**
   ```bash
   pnpm db:studio
   ```

## Migration from TypeScript Config

The seed script (`seed.ts`) migrates all existing configuration from:
- `apps/config/src/strategies/apyRange.ts`

Into the database tables. This ensures backward compatibility while enabling dynamic configuration management.

## Adding New Configurations

You can add configurations either by:

1. **Updating the seed script** and running `pnpm db:seed`
2. **Using Prisma Studio** (`pnpm db:studio`) to add/edit records manually
3. **Writing TypeScript scripts** using `@prisma/client` to manage configurations programmatically

## Querying Configurations

Example TypeScript code to query configurations:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Get all market configs for a chain
const marketConfigs = await prisma.marketApyConfig.findMany({
  where: { chainId: 1 }, // Mainnet
});

// Get specific vault config
const vaultConfig = await prisma.vaultApyConfig.findUnique({
  where: {
    unique_vault_config: {
      chainId: 1,
      vaultAddress: "0x...",
    },
  },
});

// Get global strategy config
const strategyConfig = await prisma.apyStrategyConfig.findFirst();
```
