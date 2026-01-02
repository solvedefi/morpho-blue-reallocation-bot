# Morpho Blue Reallocation Bot Server

This package contains the complete reallocation bot system, including:

- **HTTP API Server**: Configuration management endpoints
- **Reallocation Bot**: Automated vault reallocation logic
- **Database Client**: PostgreSQL/Prisma integration
- **Strategies**: APY Range and Equalize Utilizations strategies
- **Morpho Client**: Blockchain interaction layer

## Architecture

```
apps/server/
├── src/
│   ├── index.ts                 # Main entry point - starts server & bots
│   ├── server.ts                # HTTP API (Hono)
│   ├── bot/
│   │   └── ReallocationBot.ts   # Bot orchestration
│   ├── contracts/
│   │   ├── MorphoClient.ts      # Blockchain client
│   │   ├── helpers.ts           # IRM calculations
│   │   └── types.ts             # Contract types
│   ├── database/
│   │   └── DatabaseClient.ts    # Prisma client wrapper
│   ├── strategies/
│   │   ├── strategy.ts          # Strategy interface
│   │   ├── apyRange/            # APY Range strategy
│   │   └── equilizeUtilizations/ # Equalize strategy
│   └── utils/
│       ├── maths.ts             # Math utilities
│       └── types.ts             # Shared types
├── abis/                        # Contract ABIs
├── prisma/                      # Database schema & migrations
└── test/                        # Test files
```

## Features

### 1. HTTP API Server (Port 3000)

Configuration management endpoints:

- `GET /config` - Get current configuration
- `POST /config/vault` - Set vault APY range
- `POST /config/market` - Set market APY range
- `PUT /config/strategy` - Update global strategy config
- `DELETE /config/vault` - Remove vault config
- `DELETE /config/market` - Remove market config
- `GET /health` - Health check

### 2. Reallocation Bot

- Monitors configured vaults across multiple chains
- Executes reallocation strategies automatically
- Supports hot-reload of configuration changes
- Runs on configurable intervals per chain

### 3. Database Integration

- PostgreSQL with Prisma ORM
- Stores vault and market APY configurations
- Global strategy settings
- Supports runtime configuration updates

## Getting Started

### Prerequisites

- Node.js >= 18.14
- PostgreSQL database
- Environment variables configured (see `.env.example`)

### Installation

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate
```

### Development

```bash
# Start in development mode with hot reload
pnpm dev

# Build
pnpm build

# Start production server
pnpm start
```

### Database Commands

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Create new migration
pnpm db:migrate:dev

# Open Prisma Studio
pnpm db:studio

# Reset database
pnpm db:reset
```

## Configuration

The bot loads configuration from:

1. **Environment Variables**: Chain configs, RPC URLs, private keys
2. **Database**: APY ranges, strategy settings (runtime configurable via API)

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/morpho"

# Server
PORT=3000

# Chain Configuration (loaded from src/config)
```

### Runtime Configuration (via API)

Configure APY ranges and strategy settings through the HTTP API:

```bash
# Set vault APY range
curl -X POST http://localhost:3000/config/vault \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "vaultAddress": "0x...",
    "minApy": 2.5,
    "maxApy": 8.0
  }'

# Update global strategy
curl -X PUT http://localhost:3000/config/strategy \
  -H "Content-Type: application/json" \
  -d '{
    "allowIdleReallocation": true,
    "defaultMinApy": 0,
    "defaultMaxApy": 10
  }'
```

## Strategies

### APY Range Strategy

Maintains market APY within configured ranges:

- Deposits assets when APY > max (lower utilization)
- Withdraws assets when APY < min (increase utilization)
- Handles Adaptive IRM curve shifts for markets below target

### Equalize Utilizations Strategy

Balances utilization across all markets in a vault to a target average.

## Development

### Adding a New Strategy

1. Create strategy file in `src/strategies/`
2. Implement the `Strategy` interface
3. Export from `src/strategies/index.ts`
4. Update bot initialization in `src/index.ts`

### Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Deployment

The server can be deployed as a single service that handles both:

- HTTP API for configuration management
- Background bot processes for each chain

Recommended deployment:

- Docker container with PostgreSQL
- Health check endpoint: `GET /health`
- Environment variables for secrets
- Persistent volume for database

## Monitoring

- Bot logs reallocation attempts and results
- Configuration changes are logged
- Health endpoint for uptime monitoring
- Database stores historical configurations
