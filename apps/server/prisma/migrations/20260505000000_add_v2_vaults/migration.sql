ALTER TABLE "vault_whitelist" ADD COLUMN "vault_version" TEXT NOT NULL DEFAULT 'V1';

-- Disable stale "Re7 TAC Vault" — no longer in Feather's curated list for chain 239.
UPDATE "vault_whitelist"
   SET "enabled" = false
 WHERE "chain_id" = 239
   AND "vault_address" = '0x341193ED21711472e71aECa4A942123452bd0ddA';

-- Add the 3 Re7-curated Morpho V2 vaults on TAC.
INSERT INTO "vault_whitelist" ("chain_id", "vault_address", "vault_name", "vault_version", "enabled", "created_at")
VALUES
  (239, '0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC', 'Re7 USDT V2',  'V2', true, CURRENT_TIMESTAMP),
  (239, '0x47D45B47399Ccea4a89D696Aef79FF8584340334', 'Re7 cbBTC V2', 'V2', true, CURRENT_TIMESTAMP),
  (239, '0x657f5dd51D71cFbEa847fDECbca5b3fd0b82541D', 'Re7 wETH V2',  'V2', true, CURRENT_TIMESTAMP);
