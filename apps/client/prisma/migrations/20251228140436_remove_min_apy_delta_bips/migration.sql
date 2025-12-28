-- AlterTable
ALTER TABLE "vault_apy_config" DROP COLUMN "min_apy_delta_bips";

-- AlterTable
ALTER TABLE "market_apy_config" DROP COLUMN "min_apy_delta_bips";

-- AlterTable
ALTER TABLE "apy_strategy_config" DROP COLUMN "default_min_apy_delta_bips";
