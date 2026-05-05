ALTER TABLE "chain_config" ADD COLUMN "min_gas_wei" TEXT;
ALTER TABLE "chain_config" ADD COLUMN "gas_check_interval_sec" INTEGER NOT NULL DEFAULT 300;

-- Backfill min_gas_wei for chains already present so monitoring runs immediately.
-- Keep these in sync with DEFAULT_MIN_GAS_WEI in apps/server/src/constants.ts.
UPDATE "chain_config" SET "min_gas_wei" = '50000000000000000'    WHERE "chain_id" = 1;       -- Ethereum: 0.05 ETH
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 8453;    -- Base: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '500000000000000000'   WHERE "chain_id" = 80094;   -- Berachain: 0.5 BERA
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 480;     -- Worldchain: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '500000000000000000'   WHERE "chain_id" = 98866;   -- Plume: 0.5 PLUME
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 130;     -- Unichain: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 1868;    -- Soneium: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 42161;   -- Arbitrum: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '500000000000000000'   WHERE "chain_id" = 239;     -- TAC: 0.5 native
UPDATE "chain_config" SET "min_gas_wei" = '5000000000000000'     WHERE "chain_id" = 747474;  -- Katana: 0.005 ETH
UPDATE "chain_config" SET "min_gas_wei" = '20000000000000000000' WHERE "chain_id" = 137;     -- Polygon: 20 POL
UPDATE "chain_config" SET "min_gas_wei" = '1000000000000000'     WHERE "chain_id" = 1135;    -- Lisk: 0.001 ETH

CREATE TABLE "tx_gas_log" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "gas_used" TEXT NOT NULL,
    "gas_price" TEXT NOT NULL,
    "block_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tx_gas_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tx_gas_log_chain_id_created_at_idx" ON "tx_gas_log"("chain_id", "created_at");
