-- AlterTable
ALTER TABLE "vault_whitelist" ADD COLUMN "emergency_withdrawals_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: emergency withdrawals allowed only for vaults currently enabled for reallocation
UPDATE "vault_whitelist" SET "emergency_withdrawals_enabled" = "enabled";
