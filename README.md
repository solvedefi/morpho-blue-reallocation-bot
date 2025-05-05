# Morpho Blue Reallocation Bot

A simple, fast, and easily deployable reallocation bot for the **Morpho Blue** protocol. This bot is entirely based on **RPC calls** and is designed to
meet borrow demand within MetaMorpho vaults by equalizing utilization rates across markets.

## Features

- Automatically rebalances assets within MetaMorpho vaults to maintain capital efficiency
- Equalizes utilization rates across markets
- Multi-chain compatible (Ethereum, Base, and more)
- Minimal setup and dependencies (RPC-only, no extra infra required)
- Configurable minimum threshold for utilization changes (2.5% by default)

### ⚠️ Disclaimer

This bot is provided as-is, without any warranty. The **Morpho Association is not responsible** for any potential loss of funds resulting from the use of this bot, including (but not limited to) gas fees, failed transactions, or reallocations on malicious or misconfigured markets.

Use at your own risk.

## Requirements

- Node.js >= 20
- [pnpm](https://pnpm.io/) (this repo uses `pnpm` as package manager)
- [Docker](https://www.docker.com/) (optional, only needed if you want to run the database locally)
- A valid RPC URL (via Alchemy, Infura, etc)
- The private key of an EOA with enough funds to pay for gas

## Installation

```bash
git clone https://github.com/morpho-org/morpho-blue-reallocation-bot.git
cd morpho-blue-reallocation-bot
pnpm install
```

## Chain Configuration

The bot can be configured to run on any EVM-compatible chain where the Morpho stack has been deployed. The chain configuration is done in the `apps/config/config.ts` file.

### Morpho Stack parameters (addresses and start blocks)

**If you don't plan on supporting a new chain, you can ignore this section.**

Morpho Blue:

- `morpho.address`: The address of the Morpho contract.
- `morpho.startBlock`: The block number of the Morpho contract deployment.

Adaptive Curve IRM:

- `adaptiveCurveIrm.address`: The address of the Adaptive Curve IRM contract.
- `adaptiveCurveIrm.startBlock`: The block number of the Adaptive Curve IRM contract deployment.

Meta Morpho Factories:

- `metaMorphoFactories.addresses`: The addresses of the MetaMorpho factories.
- `metaMorphoFactories.startBlock`: The block number of the oldest MetaMorpho factory deployment.

### Secrets

**Database secrets (optional):**

- `POSTGRES_DATABASE_URL`: The URL of the postgres database that will be used by the bot. If not set, the bot will launch a docker container with a local postgres database.

**Chain secrets:**

For each chain, the following secrets must be set:

- `RPC_URL`: The RPC URL of the chain that will be used by the bot.
- `REALLOCATOR_PRIVATE_KEY`: The private key of the EOA that will be used to execute the reallocations.

**Vault Whitelist**: The bot will only rebalance assets within vaults that are whitelisted:

- `VAULT_WHITELIST`: List of MetaMorpho vaults addresses.

**Execution Interval**: The bot will run once every N seconds, with this value as N:

- `EXECUTION_INTERVAL`: Seconds to wait between runs.

The secrets must be set in the `.env` file at the root of the repository, with the following keys:

- `RPC_URL_<chainId>`
- `REALLOCATOR_PRIVATE_KEY_<chainId>`
- `VAULT_WHITELIST_<chainId>`
- `EXECUTION_INTERVAL_<chainId>`

Example for mainnet (chainId 1):

```
RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/<your-alchemy-api-key>
REALLOCATOR_PRIVATE_KEY_1=0x1234567890123456789012345678901234567890123456789012345678901234
VAULT_WHITELIST_1=0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183,0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458
EXECUTION_INTERVAL_1=900
```

### Strategies config

Some strategies require some chains and vaults specific configutation.
This configuration is handled in the `apps/config/src/strategies` folder, which contains the config files of every configurable strategies.

## Reallocation Strategy

The bot uses by default an `EquilizeUtilizations` strategy that:

1. Calculates a target utilization rate across all markets within a vault
2. Identifies markets with higher-than-target and lower-than-target utilization
3. Determines optimal withdrawals and deposits to balance utilization rates
4. Only executes reallocations when the utilization delta exceeds a minimum threshold (2.5% by default)

## Apy Range Strategy

The bot can also use the `ApyRange` strategy (if you change the strategy passed to the bot in the `apps/client/src/index.ts` file).

This strategy tries to keep vaults listed markets borrow APY within the ranges defined in `apps/config/src/strategies/apyRange.ts`.
Ranges can be defined at the global level, at the vaults level, or/and at the markets level.

## Run the bot

Once the bot is installed and configured, you can run it by executing the following command:

```bash
pnpm reallocate
```

This command will start the bot, which will start reallocating once the configured chains are fully indexed.

⚠⏱️ The indexing process can take some time depending on the number of blocks to index.

## Config Changes

Unfortunately, Ponder doesn't allow the same schema to be used with different configs.
In this project, the config changes only if you add, remove, or modify a chain.

So, if you try to run the bot with a set of chains that's different from the one used in your initial run, indexing will fail.
There are two ways to handle this:

### Reset the postgres database

This is the easiest and most direct solution, but you will lose the indexed data for the previous chains.

If you're using Docker to run the local Postgres database, you can simply stop and remove the container and its volume:

```bash
docker compose down -v
```

### Use a new database

This way you can have different containers storing different indexing data for different sets of chains.

- If you're using Docker to run the local Postgres database, just change the port both in the postgres url given to ponder (in `apps/ponder/ponder.config.ts`) and in `docker-compose.yml`.
- If you are using an external postgres database, you just need to change the `POSTGRES_DATABASE_URL`.
