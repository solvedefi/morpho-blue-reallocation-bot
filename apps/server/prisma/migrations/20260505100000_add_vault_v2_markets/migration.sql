CREATE TABLE "vault_v2_markets" (
    "id"               SERIAL PRIMARY KEY,
    "chain_id"         INTEGER NOT NULL,
    "vault_address"    VARCHAR(42) NOT NULL,
    "adapter_address"  VARCHAR(42) NOT NULL,
    "market_id"        VARCHAR(66) NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "vault_v2_markets_chain_id_vault_address_market_id_key"
    ON "vault_v2_markets" ("chain_id", "vault_address", "market_id");

CREATE INDEX "vault_v2_markets_chain_id_vault_address_idx"
    ON "vault_v2_markets" ("chain_id", "vault_address");

-- Seed Re7 V2 TAC vaults with their currently-capped markets (verified
-- on-chain via apps/server/scripts/check-tac-v2-caps.ts on 2026-05-05).
-- Markets with absCap=0 are intentionally excluded.
INSERT INTO "vault_v2_markets" ("chain_id", "vault_address", "adapter_address", "market_id") VALUES
  (239, '0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC', '0x07E20Ff434D8ba9B8a68596BDeB61aE69Fb468D4', '0xa60ffde82028a9ad1ccbb9fa1f70768224fbb29513191c545ff7d4943be5b0e2'),
  (239, '0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC', '0x07E20Ff434D8ba9B8a68596BDeB61aE69Fb468D4', '0xe68ff4fea9fc7bb636792158230063cbcba566a524dc83232a5f7f0e6371caf6'),
  (239, '0x8F1DA931679dc2Ac59811ACe6A401c5C935A60DC', '0x07E20Ff434D8ba9B8a68596BDeB61aE69Fb468D4', '0xfb575234e6167abe5e47b74e4a05d087097f033b87fe0ff1695e51f92b9c35c2'),
  (239, '0x47D45B47399Ccea4a89D696Aef79FF8584340334', '0xeF119d2a5127Fd3585E06027f6f999165CcB88e6', '0x7c12126e3ac2d19ecbcfff950368c14a776fbb2200c569f0c4bfe907b29467f4'),
  (239, '0x657f5dd51D71cFbEa847fDECbca5b3fd0b82541D', '0x4ed541BaD86A8B9c44d58ac7Ad2cAe7A01b92f38', '0xe8e4b58ede8970b1920f6ec27305f2b8efd8af3cf5e1e3f4d9e57dd23acb6203');
