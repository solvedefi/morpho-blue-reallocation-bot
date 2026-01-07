-- Add metadata columns to vault_apy_config
ALTER TABLE "vault_apy_config" ADD COLUMN "vault_name" VARCHAR(100);

-- Add metadata columns to market_apy_config
ALTER TABLE "market_apy_config" ADD COLUMN "collateral_symbol" VARCHAR(20);
ALTER TABLE "market_apy_config" ADD COLUMN "loan_symbol" VARCHAR(20);
ALTER TABLE "market_apy_config" ADD COLUMN "vault_address" VARCHAR(42);

-- Vault name updates
UPDATE "vault_apy_config" SET "vault_name" = 'Re7 USDC' WHERE "chain_id" = 480 AND "vault_address" = '0xb1e80387ebe53ff75a89736097d34dc8d9e9045b';
UPDATE "vault_apy_config" SET "vault_name" = 'Re7 EURC' WHERE "chain_id" = 480 AND "vault_address" = '0xdaa79e066dee8c8c15ffb37b1157f7eb8e0d1b37';

-- Market metadata updates
-- Plume markets (chain_id: 98866)
UPDATE "market_apy_config" SET "collateral_symbol" = 'nBASIS', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0x970b184db9382337bf6b693017cf30936a26001fb26bac24e238c77629a75046';
UPDATE "market_apy_config" SET "collateral_symbol" = 'nALPHA', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0x7a96549cae736c913d12c78ee4c155c2d2f874031fce5acdd07bdbf23d7644c7';
UPDATE "market_apy_config" SET "collateral_symbol" = 'nTBILL', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0xcf3bb7b9935f60d79da7b7bc6405328e6f990b6894895f1df7acfb4c82bc4c5a';
UPDATE "market_apy_config" SET "collateral_symbol" = 'WPLUME', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0x4e5b50278bf256f0af3d2b696545cba3de02dacba6bea930bdd5cf83dd4304f4';
UPDATE "market_apy_config" SET "collateral_symbol" = 'nALPHA', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0xe70dd0172a62a91b8e9d67bf4815a2f72120b7f92dacac5448c2f075cd6f1079';
UPDATE "market_apy_config" SET "collateral_symbol" = 'nCREDIT', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0xa05b28928ab7aea096978928cfb3545333b30b36695bf1510922ac1d6a2c044a';
UPDATE "market_apy_config" SET "collateral_symbol" = 'WETH', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0xa39e210a871820d48b6c96e441c0b0fd2dddde3cfcc0074ab7e716df0751b549';
UPDATE "market_apy_config" SET "collateral_symbol" = 'nCREDIT', "loan_symbol" = 'pUSD' WHERE "chain_id" = 98866 AND "market_id" = '0x8243ee11b8f23c49d7734907316031d0a5030cbc0a77d5e649422678708c9798';

-- Mainnet markets (chain_id: 1)
UPDATE "market_apy_config" SET "collateral_symbol" = 'ezETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e';
UPDATE "market_apy_config" SET "collateral_symbol" = 'weETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7';
UPDATE "market_apy_config" SET "collateral_symbol" = 'rsETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41';
UPDATE "market_apy_config" SET "collateral_symbol" = 'ETH+', "loan_symbol" = 'WETH' WHERE "chain_id" = 1 AND "market_id" = '0x5f8a138ba332398a9116910f4d5e5dcd9b207024c5290ce5bc87bc2dbd8e4a86';
UPDATE "market_apy_config" SET "collateral_symbol" = 'arUSD', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0x6c65bb7104ae6fc1dc2cdc97fcb7df2a4747363e76135b32d9170b2520bb65eb';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDe', "loan_symbol" = 'USDT' WHERE "chain_id" = 1 AND "market_id" = '0xdc5333039bcf15f1237133f74d5806675d83d9cf19cfd4cfdd9be674842651bf';
UPDATE "market_apy_config" SET "collateral_symbol" = 'USDe', "loan_symbol" = 'USDT' WHERE "chain_id" = 1 AND "market_id" = '0xcec858380cba2d9ca710fce3ce864d74c3f620d53826f69d08508902e09be86f';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sDAI', "loan_symbol" = 'USDT' WHERE "chain_id" = 1 AND "market_id" = '0x1ca7ff6b26581fe3155f391f3960d32a033b5f7d537b1f1932b2021a6cf4f706';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDf', "loan_symbol" = 'USDf' WHERE "chain_id" = 1 AND "market_id" = '0x2e09b73c35e0769bdf589a9556e6ac3c892485ea502ac8c445cec9e79b0378af';
UPDATE "market_apy_config" SET "collateral_symbol" = 'PT-sUSDf-25SEP2025', "loan_symbol" = 'USDf' WHERE "chain_id" = 1 AND "market_id" = '0x06cd324a963c18a7c046be97dba2a4af9b82f0ca3a2e451a38ccfb9c76667e5f';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDS', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b';
UPDATE "market_apy_config" SET "collateral_symbol" = 'USDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x5109cda72b0603e1bac4631ddebd3104bea6414e686c3f7aa2cb3c65795602f0';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x3df62177d8dd48708addac57caad778286f104c98a6866817b105795be0605e8';
UPDATE "market_apy_config" SET "collateral_symbol" = 'USDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x3c81a7e3cbcdeeecc7d9f7c45ed28ef62d63357cfcc7295e9d2b3368f0386b46';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x8a8650a5ed923712ca86a9b83bd12ea520131c646c4da5de3a443416e1bb8c98';
UPDATE "market_apy_config" SET "collateral_symbol" = 'USDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x08cfaaa2e7797b4e1326d1d174dd364c9fb3a2a718623a3b7f97ea1debba47b8';
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDe', "loan_symbol" = 'FRAX' WHERE "chain_id" = 1 AND "market_id" = '0x7e72f1671f1fd2c0900b6ef8bb6b55299d6a58fd398e3b8e05c12e3c429c401b';
UPDATE "market_apy_config" SET "collateral_symbol" = 'AA_RockawayXUSDC', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0x96cad5abf2bd0b30de441639a54125b6d1c6ba14c211fdc1d21abe5ec2bef542';
UPDATE "market_apy_config" SET "collateral_symbol" = 'srUSD', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0xbfed072faee09b963949defcdb91094465c34c6c62d798b906274ef3563c9cac';
UPDATE "market_apy_config" SET "collateral_symbol" = 'syrupUSDC', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0x729badf297ee9f2f6b3f717b96fd355fc6ec00422284ce1968e76647b258cf44';
UPDATE "market_apy_config" SET "collateral_symbol" = 'USR', "loan_symbol" = 'USDC' WHERE "chain_id" = 1 AND "market_id" = '0x8e7cc042d739a365c43d0a52d5f24160fa7ae9b7e7c9a479bd02a56041d4cf77';

-- Base markets (chain_id: 8453)
UPDATE "market_apy_config" SET "collateral_symbol" = 'mBASIS', "loan_symbol" = 'USDC' WHERE "chain_id" = 8453 AND "market_id" = '0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'eUSD' WHERE "chain_id" = 8453 AND "market_id" = '0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea';
UPDATE "market_apy_config" SET "collateral_symbol" = 'bsdETH', "loan_symbol" = 'eUSD' WHERE "chain_id" = 8453 AND "market_id" = '0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf';
UPDATE "market_apy_config" SET "collateral_symbol" = 'cbETH', "loan_symbol" = 'eUSD' WHERE "chain_id" = 8453 AND "market_id" = '0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d';
UPDATE "market_apy_config" SET "collateral_symbol" = 'cbETH', "loan_symbol" = 'USDC' WHERE "chain_id" = 8453 AND "market_id" = '0x1c21c59df9db44bf6f645d854ee710a8ca17b479451447e9f56758aee10a2fad';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wsuperOETHb', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x144bf18d6bf4c59602548a825034f73bf1d20177fc5f975fc69d5a5eba929b45';
UPDATE "market_apy_config" SET "collateral_symbol" = 'bsdETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x7f90d72667171d72d10d62b5828d6a5ef7254b1e33718fe0c1f7dcf56dd1edc7';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x6aa81f51dfc955df598e18006deae56ce907ac02b0b5358705f1a28fcea23cc0';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wrsETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x214c2bf3c899c913efda9c4a49adff23f77bbc2dc525af7c05be7ec93f32d561';
UPDATE "market_apy_config" SET "collateral_symbol" = 'ezETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x86021ffe2f778ed8aacecdf3dae2cdef77dbfa5e133b018cca16c52ceab58996';
UPDATE "market_apy_config" SET "collateral_symbol" = 'cbETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x6600aae6c56d242fa6ba68bd527aff1a146e77813074413186828fd3f1cdca91';
UPDATE "market_apy_config" SET "collateral_symbol" = 'weETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0x78d11c03944e0dc298398f0545dc8195ad201a18b0388cb8058b1bcb89440971';
UPDATE "market_apy_config" SET "collateral_symbol" = 'wstETH', "loan_symbol" = 'WETH' WHERE "chain_id" = 8453 AND "market_id" = '0xe3c4d4d0e214fdc52635d7f9b2f7b3b0081771ae2efeb3cb5aae26009f34f7a7';

-- Worldchain markets (chain_id: 480)
-- Remove idle market (zero address for both tokens) - no need to track APY for idle markets
DELETE FROM "market_apy_config" WHERE "chain_id" = 480 AND "market_id" = '0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8';

-- Berachain markets (chain_id: 80094)
UPDATE "market_apy_config" SET "collateral_symbol" = 'sUSDe', "loan_symbol" = 'HONEY' WHERE "chain_id" = 80094 AND "market_id" = '0x1ba7904c73d337c39cb88b00180dffb215fc334a6ff47bbe829cd9ee2af00c97';
