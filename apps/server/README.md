# Morpho Blue Reallocation Bot - Server

HTTP API server for managing APY configuration for the Morpho Blue Reallocation Bot.

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T12:00:00.000Z"
}
```

### GET /config

Get all current APY configuration including vault ranges, market ranges, and global strategy settings.

**Response:**
```json
{
  "success": true,
  "data": {
    "vaultRanges": {
      "1": {
        "0x1234...": { "min": 2.5, "max": 8.0 }
      }
    },
    "marketRanges": {
      "1": {
        "0xabcd...": { "min": 3.0, "max": 7.5 }
      }
    },
    "allowIdleReallocation": true,
    "defaultMinApy": 0,
    "defaultMaxApy": 10
  }
}
```

### POST /config/vault

Add or update APY range for a specific vault.

**Request Body:**
```json
{
  "chainId": 1,
  "vaultAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "minApy": 2.5,
  "maxApy": 8.0
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vault APY range configured successfully",
  "data": {
    "chainId": 1,
    "vaultAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "minApy": 2.5,
    "maxApy": 8.0
  }
}
```

**Validation:**
- `chainId` must be a valid number
- `vaultAddress` must be a valid Ethereum address
- `minApy` and `maxApy` must be non-negative numbers
- `minApy` must be less than `maxApy`

### POST /config/market

Add or update APY range for a specific market.

**Request Body:**
```json
{
  "chainId": 1,
  "marketId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "minApy": 3.0,
  "maxApy": 7.5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Market APY range configured successfully",
  "data": {
    "chainId": 1,
    "marketId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "minApy": 3.0,
    "maxApy": 7.5
  }
}
```

**Validation:**
- `chainId` must be a valid number
- `marketId` must be a valid hex string
- `minApy` and `maxApy` must be non-negative numbers
- `minApy` must be less than `maxApy`

### PUT /config/strategy

Update global strategy configuration.

**Request Body:**
```json
{
  "allowIdleReallocation": true,
  "defaultMinApy": 0,
  "defaultMaxApy": 10
}
```

All fields are optional - you can update one or more fields at a time.

**Response:**
```json
{
  "success": true,
  "message": "Strategy configuration updated successfully",
  "data": {
    "allowIdleReallocation": true,
    "defaultMinApy": 0,
    "defaultMaxApy": 10
  }
}
```

**Validation:**
- `allowIdleReallocation` must be a boolean (if provided)
- `defaultMinApy` must be a non-negative number (if provided)
- `defaultMaxApy` must be a non-negative number (if provided)
- `defaultMinApy` must be less than `defaultMaxApy` (if both provided)

### DELETE /config/vault

Delete APY range configuration for a specific vault.

**Request Body:**
```json
{
  "chainId": 1,
  "vaultAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vault APY range deleted successfully"
}
```

### DELETE /config/market

Delete APY range configuration for a specific market.

**Request Body:**
```json
{
  "chainId": 1,
  "marketId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Market APY range deleted successfully"
}
```

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `500` - Internal Server Error

## Features

- **Automatic Bot Reload**: When configuration is changed through any of the mutation endpoints (POST, PUT, DELETE), the server automatically triggers a reload of the bot configuration. This means all running bots will immediately start using the new APY ranges without requiring a restart.

## Usage

### Basic Usage

```typescript
import { createServer } from "@morpho-blue-reallocation-bot/server";
import { serve } from "@hono/node-server";
import { DatabaseClient } from "./database";

const dbClient = new DatabaseClient();
await dbClient.connect();

const server = createServer(dbClient);
const port = 3000;

serve({
  fetch: server.fetch,
  port,
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
```

### With Configuration Reload Callback

To enable automatic bot updates when configuration changes, provide a callback function:

```typescript
import { createServer } from "@morpho-blue-reallocation-bot/server";
import { serve } from "@hono/node-server";
import { DatabaseClient } from "./database";
import { ApyRange } from "./strategies";

const dbClient = new DatabaseClient();
await dbClient.connect();

const bots = []; // Array of ReallocationBot instances

// Create a callback to reload configuration
const reloadConfiguration = async () => {
  console.log("Reloading configuration...");
  const newApyConfig = await dbClient.loadApyConfiguration();

  // Update all bots with new configuration
  for (const bot of bots) {
    const newStrategy = new ApyRange(newApyConfig);
    bot.updateStrategy(newStrategy);
  }

  console.log("Configuration reloaded successfully");
};

const server = createServer(dbClient, reloadConfiguration);
const port = 3000;

serve({
  fetch: server.fetch,
  port,
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
```

## Examples

### Using curl

```bash
# Get current configuration
curl http://localhost:3000/config

# Add vault APY range
curl -X POST http://localhost:3000/config/vault \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "vaultAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "minApy": 2.5,
    "maxApy": 8.0
  }'

# Add market APY range
curl -X POST http://localhost:3000/config/market \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "marketId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "minApy": 3.0,
    "maxApy": 7.5
  }'

# Update strategy configuration
curl -X PUT http://localhost:3000/config/strategy \
  -H "Content-Type: application/json" \
  -d '{
    "allowIdleReallocation": false,
    "defaultMinApy": 1.0,
    "defaultMaxApy": 9.0
  }'

# Delete vault configuration
curl -X DELETE http://localhost:3000/config/vault \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "vaultAddress": "0x1234567890abcdef1234567890abcdef12345678"
  }'
```
