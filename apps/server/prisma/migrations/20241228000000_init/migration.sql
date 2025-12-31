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

-- CreateIndex
CREATE INDEX "vault_apy_config_chain_id_idx" ON "vault_apy_config"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_vault_config" ON "vault_apy_config"("chain_id", "vault_address");

-- CreateIndex
CREATE INDEX "market_apy_config_chain_id_idx" ON "market_apy_config"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_market_config" ON "market_apy_config"("chain_id", "market_id");

-- Add check constraints
ALTER TABLE "vault_apy_config" ADD CONSTRAINT "vault_apy_config_check_apy_range" CHECK ("min_apy" < "max_apy");

ALTER TABLE "market_apy_config" ADD CONSTRAINT "market_apy_config_check_apy_range" CHECK ("min_apy" < "max_apy");

-- Insert default global configuration
INSERT INTO "apy_strategy_config" ("allow_idle_reallocation", "default_min_apy", "default_max_apy", "updated_at")
VALUES (true, 0, 10, CURRENT_TIMESTAMP);

-- Insert vault APY configurations
-- Worldchain vaults
INSERT INTO "vault_apy_config" ("chain_id", "vault_address", "min_apy", "max_apy", "created_at", "updated_at") VALUES
(480, '0xb1e80387ebe53ff75a89736097d34dc8d9e9045b', 5.5, 6.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(480, '0xdaa79e066dee8c8c15ffb37b1157f7eb8e0d1b37', 3.5, 4.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insert market APY configurations
-- Plume markets (chain_id: 98866)
INSERT INTO "market_apy_config" ("chain_id", "market_id", "min_apy", "max_apy", "created_at", "updated_at") VALUES
(98866, '0x970b184db9382337bf6b693017cf30936a26001fb26bac24e238c77629a75046', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0x7a96549cae736c913d12c78ee4c155c2d2f874031fce5acdd07bdbf23d7644c7', 8.5, 9.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0xcf3bb7b9935f60d79da7b7bc6405328e6f990b6894895f1df7acfb4c82bc4c5a', 2.5, 3.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0x4e5b50278bf256f0af3d2b696545cba3de02dacba6bea930bdd5cf83dd4304f4', 6.5, 7.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0xe70dd0172a62a91b8e9d67bf4815a2f72120b7f92dacac5448c2f075cd6f1079', 8.5, 9.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0xa05b28928ab7aea096978928cfb3545333b30b36695bf1510922ac1d6a2c044a', 6.5, 7.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0xa39e210a871820d48b6c96e441c0b0fd2dddde3cfcc0074ab7e716df0751b549', 6.5, 7.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(98866, '0x8243ee11b8f23c49d7734907316031d0a5030cbc0a77d5e649422678708c9798', 6.5, 7.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Mainnet markets (chain_id: 1)
(1, '0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x5f8a138ba332398a9116910f4d5e5dcd9b207024c5290ce5bc87bc2dbd8e4a86', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x6c65bb7104ae6fc1dc2cdc97fcb7df2a4747363e76135b32d9170b2520bb65eb', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xdc5333039bcf15f1237133f74d5806675d83d9cf19cfd4cfdd9be674842651bf', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xcec858380cba2d9ca710fce3ce864d74c3f620d53826f69d08508902e09be86f', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x1ca7ff6b26581fe3155f391f3960d32a033b5f7d537b1f1932b2021a6cf4f706', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x2e09b73c35e0769bdf589a9556e6ac3c892485ea502ac8c445cec9e79b0378af', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x06cd324a963c18a7c046be97dba2a4af9b82f0ca3a2e451a38ccfb9c76667e5f', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x5109cda72b0603e1bac4631ddebd3104bea6414e686c3f7aa2cb3c65795602f0', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x3df62177d8dd48708addac57caad778286f104c98a6866817b105795be0605e8', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x3c81a7e3cbcdeeecc7d9f7c45ed28ef62d63357cfcc7295e9d2b3368f0386b46', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x8a8650a5ed923712ca86a9b83bd12ea520131c646c4da5de3a443416e1bb8c98', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x08cfaaa2e7797b4e1326d1d174dd364c9fb3a2a718623a3b7f97ea1debba47b8', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x7e72f1671f1fd2c0900b6ef8bb6b55299d6a58fd398e3b8e05c12e3c429c401b', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x96cad5abf2bd0b30de441639a54125b6d1c6ba14c211fdc1d21abe5ec2bef542', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0xbfed072faee09b963949defcdb91094465c34c6c62d798b906274ef3563c9cac', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x729badf297ee9f2f6b3f717b96fd355fc6ec00422284ce1968e76647b258cf44', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, '0x8e7cc042d739a365c43d0a52d5f24160fa7ae9b7e7c9a479bd02a56041d4cf77', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Base markets (chain_id: 8453)
(8453, '0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8', 7.5, 8.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x1c21c59df9db44bf6f645d854ee710a8ca17b479451447e9f56758aee10a2fad', 4.5, 5.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x144bf18d6bf4c59602548a825034f73bf1d20177fc5f975fc69d5a5eba929b45', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x7f90d72667171d72d10d62b5828d6a5ef7254b1e33718fe0c1f7dcf56dd1edc7', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x6aa81f51dfc955df598e18006deae56ce907ac02b0b5358705f1a28fcea23cc0', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x214c2bf3c899c913efda9c4a49adff23f77bbc2dc525af7c05be7ec93f32d561', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x86021ffe2f778ed8aacecdf3dae2cdef77dbfa5e133b018cca16c52ceab58996', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x6600aae6c56d242fa6ba68bd527aff1a146e77813074413186828fd3f1cdca91', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0x78d11c03944e0dc298398f0545dc8195ad201a18b0388cb8058b1bcb89440971', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8453, '0xe3c4d4d0e214fdc52635d7f9b2f7b3b0081771ae2efeb3cb5aae26009f34f7a7', 2.0, 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Worldchain markets (chain_id: 480)
(480, '0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8', 7.5, 8.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Berachain markets (chain_id: 80084)
(80084, '0x1ba7904c73d337c39cb88b00180dffb215fc334a6ff47bbe829cd9ee2af00c97', 2.5, 3.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "chain_config" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "execution_interval" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_whitelist" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "vault_address" VARCHAR(42) NOT NULL,
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

-- Insert default strategy thresholds
INSERT INTO "strategy_thresholds" ("default_min_apy_delta_bips", "default_min_utilization_delta_bips", "default_min_apr_delta_bips", "updated_at")
VALUES (50, 25, 0, CURRENT_TIMESTAMP);

-- Insert vault strategy threshold overrides
-- Mainnet vaults
INSERT INTO "vault_strategy_thresholds" ("chain_id", "vault_address", "min_utilization_delta_bips", "created_at", "updated_at")
VALUES (1, '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', 300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Base vaults
INSERT INTO "vault_strategy_thresholds" ("chain_id", "vault_address", "min_utilization_delta_bips", "created_at", "updated_at")
VALUES (8453, '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insert chain configurations
-- Ethereum (chainId: 1)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (1, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (1, '0x95EeF579155cd2C5510F312c8fA39208c3Be01a8', true, CURRENT_TIMESTAMP);

-- BASE (chainId: 8453) - ACTIVE
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (8453, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (8453, '0xbb819D845b573B5D7C538F5b85057160cfb5f313', true, CURRENT_TIMESTAMP);

-- Bera (chainId: 80094)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (80094, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (80094, '0x30BbA9CD9Eb8c95824aa42Faa1Bb397b07545bc1', true, CURRENT_TIMESTAMP);

-- Worldchain (chainId: 480)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (480, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (480, '0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B', true, CURRENT_TIMESTAMP);

-- Plume (chainId: 98866)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (98866, 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (98866, '0xc0Df5784f28046D11813356919B869dDA5815B16', true, CURRENT_TIMESTAMP);

-- Unichain (chainId: 130)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (130, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (130, '0x6af5E46456A8ac80BB53a02799965DEF99c26e52', true, CURRENT_TIMESTAMP),
  (130, '0xa48f8A10F16bB50A588606553D9fE7338050f8Cd', true, CURRENT_TIMESTAMP),
  (130, '0x2c0F7e917257926BA6233B20DE19d7fe3210858C', true, CURRENT_TIMESTAMP);

-- Soneium (chainId: 1868)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (1868, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (1868, '0x41baa218A118FB2249CBCf836C1E8EE336d67faA', true, CURRENT_TIMESTAMP),
  (1868, '0xbA738D34c4E278E1cd64AAA9BBd569688e8Dc5Dc', true, CURRENT_TIMESTAMP),
  (1868, '0xEcDBE2AF33E68cf96F6716f706B078fa94e978cb', true, CURRENT_TIMESTAMP),
  (1868, '0x04C451be70C41E4a88F7aC436AE767d64AE79049', true, CURRENT_TIMESTAMP);

-- Arbitrum (chainId: 42161)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (42161, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Neon (chainId: 239)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (239, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (239, '0xC5e1bD2473811bB782326006A3c03477F7834D35', true, CURRENT_TIMESTAMP),
  (239, '0x4183Bd253Dc1918A04Bd8a8dD546BaAD58898109', true, CURRENT_TIMESTAMP),
  (239, '0xf49f14Cff1bA2eE7E23222A76e0C2b3D0BDE06dC', true, CURRENT_TIMESTAMP),
  (239, '0x84BBc0be5a6f831a4E2C28a2F3b892C70AcAa5b3', true, CURRENT_TIMESTAMP),
  (239, '0xe9BD3590A68939344953b4f912d83b7c8C2A1f77', true, CURRENT_TIMESTAMP);

-- Form (chainId: 747474)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (747474, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (747474, '0x6680D2993fAadC9204Bd614a53e0c7a3f20c8ca5', true, CURRENT_TIMESTAMP),
  (747474, '0xdc97cF490b2D367F34E5AF8a5f90d2b8FCBA8ce1', true, CURRENT_TIMESTAMP);

-- Polygon (chainId: 137)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (137, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (137, '0xF91D80E43272DBC610551E8c872E0438d62C1c69', true, CURRENT_TIMESTAMP);

-- Lisk (chainId: 1135)
INSERT INTO chain_config (chain_id, execution_interval, enabled, created_at, updated_at)
VALUES (1135, 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO vault_whitelist (chain_id, vault_address, enabled, created_at)
VALUES
  (1135, '0x50cB55BE8cF05480a844642cB979820C847782aE', true, CURRENT_TIMESTAMP),
  (1135, '0x7Cbaa98bd5e171A658FdF761ED1Db33806a0d346', true, CURRENT_TIMESTAMP),
  (1135, '0x8258F0c79465c95AFAc325D6aB18797C9DDAcf55', true, CURRENT_TIMESTAMP),
  (1135, '0xD92f564A29992251297980187a6B74FAa3D50699', true, CURRENT_TIMESTAMP),
  (1135, '0xE9cB4c4d3F0798e3087D4d49D3307cDB302CEC55', true, CURRENT_TIMESTAMP),
  (1135, '0x9cF2f0AF475398ca01F099974960adbC9cB87025', true, CURRENT_TIMESTAMP);
