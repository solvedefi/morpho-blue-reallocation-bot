# Morpho Blue Reallocation Bot - UI

A React-based web interface for managing APY configurations for the Morpho Blue Reallocation Bot.

## Features

- **View Configuration** - See all current vault and market APY ranges
- **Update Market Ranges** - Set APY ranges for specific markets
- **Update Vault Ranges** - Set APY ranges for specific vaults
- **Update Strategy Settings** - Configure global strategy parameters
- **Real-time Updates** - Configuration automatically refreshes every 5 seconds
- **Auto-reload Bot** - Bot automatically reloads when configurations change

## Tech Stack

- **React 18** with TypeScript
- **Vite** for blazing fast development
- **TanStack Query** for server state management
- **Tailwind CSS** for styling
- **Proxy to API** - Automatically proxies requests to http://localhost:3000

## Getting Started

### Prerequisites

Make sure the API server is running:

```bash
# In one terminal, start the bot + API server
pnpm dev
```

### Run the UI

```bash
# In another terminal, start the UI
pnpm dev:ui
```

The UI will be available at **http://localhost:3001**

## Usage

### View Current Configuration

The "View Config" tab shows:

- Global strategy settings (allow idle reallocation, default APY ranges)
- All vault APY configurations organized by chain
- All market APY configurations organized by chain

### Update Market APY Range

1. Go to "Update Market" tab
2. Enter:
   - Chain ID (e.g., 1 for Ethereum, 8453 for Base)
   - Market ID (66-character hex string starting with 0x)
   - Min APY (%)
   - Max APY (%)
3. Click "Update Market Range"
4. The bot will automatically reload with the new configuration

### Update Vault APY Range

1. Go to "Update Vault" tab
2. Enter:
   - Chain ID
   - Vault Address (42-character hex string starting with 0x)
   - Min APY (%)
   - Max APY (%)
3. Click "Update Vault Range"

### Update Strategy Settings

1. Go to "Update Strategy" tab
2. Configure:
   - Allow Idle Reallocation (checkbox)
   - Default Min APY (%)
   - Default Max APY (%)
3. Click "Update Strategy"

## Development

### Project Structure

```
apps/ui/
├── src/
│   ├── components/       # React components
│   │   ├── ConfigView.tsx
│   │   ├── UpdateMarketForm.tsx
│   │   ├── UpdateVaultForm.tsx
│   │   └── UpdateStrategyForm.tsx
│   ├── lib/
│   │   └── api.ts       # API client
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### Build for Production

```bash
pnpm build:ui
```

The built files will be in `apps/ui/dist/`

### Preview Production Build

```bash
cd apps/ui
pnpm preview
```

## API Integration

The UI communicates with the API server through a Vite proxy configuration:

- UI runs on http://localhost:3001
- API runs on http://localhost:3000
- All `/config` and `/health` requests are proxied to the API server

This avoids CORS issues during development.
