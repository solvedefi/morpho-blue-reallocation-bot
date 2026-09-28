-- CreateTable
CREATE TABLE "vault_apy_config" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "vault_address" VARCHAR(42) NOT NULL,
    "min_apy" DECIMAL(10,4) NOT NULL,
    "max_apy" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_apy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_apy_config" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "market_id" VARCHAR(66) NOT NULL,
    "collateral_symbol" VARCHAR(20) NOT NULL,
    "loan_symbol" VARCHAR(20) NOT NULL,
    "min_apy" DECIMAL(10,4) NOT NULL,
    "max_apy" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_apy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apy_strategy_config" (
    "id" SERIAL NOT NULL,
    "allow_idle_reallocation" BOOLEAN NOT NULL DEFAULT true,
    "default_min_apy" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "default_max_apy" DECIMAL(10,4) NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apy_strategy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_config" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "execution_interval" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_gas_wei" TEXT,
    "gas_check_interval_sec" INTEGER NOT NULL DEFAULT 300,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_whitelist" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "vault_address" VARCHAR(42) NOT NULL,
    "vault_name" VARCHAR(100) NOT NULL,
    "vault_type" VARCHAR(20) NOT NULL DEFAULT 'morpho-v1',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_thresholds" (
    "id" SERIAL NOT NULL,
    "default_min_apy_delta_bips" INTEGER NOT NULL DEFAULT 50,
    "default_min_utilization_delta_bips" INTEGER NOT NULL DEFAULT 25,
    "default_min_apr_delta_bips" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_strategy_thresholds" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "vault_address" VARCHAR(42) NOT NULL,
    "min_apy_delta_bips" INTEGER,
    "min_utilization_delta_bips" INTEGER,
    "min_apr_delta_bips" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_strategy_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_apy_config_chain_id_idx" ON "vault_apy_config"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_apy_config_chain_id_vault_address_key" ON "vault_apy_config"("chain_id", "vault_address");

-- CreateIndex
CREATE INDEX "market_apy_config_chain_id_idx" ON "market_apy_config"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_apy_config_chain_id_market_id_key" ON "market_apy_config"("chain_id", "market_id");

-- CreateIndex
CREATE UNIQUE INDEX "chain_config_chain_id_key" ON "chain_config"("chain_id");

-- CreateIndex
CREATE INDEX "vault_whitelist_chain_id_idx" ON "vault_whitelist"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_whitelist_chain_id_vault_address_key" ON "vault_whitelist"("chain_id", "vault_address");

-- CreateIndex
CREATE INDEX "vault_strategy_thresholds_chain_id_idx" ON "vault_strategy_thresholds"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_strategy_thresholds_chain_id_vault_address_key" ON "vault_strategy_thresholds"("chain_id", "vault_address");

-- AddForeignKey
ALTER TABLE "vault_whitelist" ADD CONSTRAINT "vault_whitelist_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chain_config"("chain_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddCheckConstraint
ALTER TABLE "vault_apy_config" ADD CONSTRAINT "vault_apy_config_check_apy_range" CHECK ("min_apy" < "max_apy");

-- AddCheckConstraint
ALTER TABLE "market_apy_config" ADD CONSTRAINT "market_apy_config_check_apy_range" CHECK ("min_apy" < "max_apy");

-- Default global configuration
INSERT INTO "apy_strategy_config" ("allow_idle_reallocation", "default_min_apy", "default_max_apy", "updated_at")
VALUES (true, 0, 10, CURRENT_TIMESTAMP);

INSERT INTO "strategy_thresholds" ("default_min_apy_delta_bips", "default_min_utilization_delta_bips", "default_min_apr_delta_bips", "updated_at")
VALUES (50, 25, 0, CURRENT_TIMESTAMP);

-- Chains and vaults are not seeded here: they are synced from vaults-source-of-truth/vaults.csv on startup.
