-- AlterTable
ALTER TABLE "vault_whitelist" ADD COLUMN "strategy" VARCHAR(32) NOT NULL DEFAULT 'apyRange';
ALTER TABLE "vault_whitelist" ADD COLUMN "target_utilization" DECIMAL(5,2);

-- AddCheckConstraint
ALTER TABLE "vault_whitelist" ADD CONSTRAINT "vault_whitelist_check_strategy" CHECK ("strategy" IN ('apyRange', 'equalizeUtilizations'));
ALTER TABLE "vault_whitelist" ADD CONSTRAINT "vault_whitelist_check_target_utilization" CHECK ("target_utilization" > 0 AND "target_utilization" <= 100);
