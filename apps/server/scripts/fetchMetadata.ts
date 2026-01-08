/**
 * Script to fetch vault names and market token symbols from on-chain data
 * Run with: npx tsx scripts/fetchMetadata.ts
 */

import { createPublicClient, http, defineChain, type Address, type Hex, type PublicClient } from "viem";
import {
  mainnet,
  base,
  berachain,
  worldchain,
  polygon,
  lisk,
  soneium,
} from "viem/chains";

import { metaMorphoAbi } from "../abis/MetaMorpho";
import { erc20Abi } from "../abis/ERC20";
import { morphoBlueAbi } from "../abis/MorphoBlue";

// Define custom chains
const plume = defineChain({
  id: 98_866,
  name: "Plume Mainnet",
  nativeCurrency: { name: "Plume Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.plumenetwork.xyz"] },
  },
});

const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.unichain.org"] },
  },
});

const tac = defineChain({
  id: 239,
  name: "TAC",
  nativeCurrency: { name: "TAC", symbol: "TAC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.tac.build"] },
  },
});

const katana = defineChain({
  id: 747474,
  name: "Katana",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.katana.farm"] },
  },
});

// Morpho addresses per chain
const morphoAddresses: Record<number, Address> = {
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  80094: "0x24147243f9c08d835C218Cda1e135f8dFD0517D0",
  480: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
  98866: "0x42b18785CE0Aed7BF7Ca43a39471ED4C0A3e0bB5",
  137: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
  1135: "0x00cD58DEEbd7A2F1C55dAec715faF8aed5b27BF8",
  1868: "0xE75Fc5eA6e74B824954349Ca351eb4e671ADA53a",
  130: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", // Unichain uses same as mainnet
  239: "0x2D1473b4E6c416a52CEBb62C72Fb33faC5F2A77e", // TAC
  747474: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", // Katana
};

// RPC URLs
const rpcUrls: Record<number, string> = {
  1: "https://1.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  8453: "https://magical-rough-leaf.base-mainnet.quiknode.pro/9ff9fcd100ab080c4e0929c01d7c687253640384",
  80094: "https://80094.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  480: "https://icy-powerful-pool.worldchain-mainnet.quiknode.pro/f02ccc416edd5dfbc29e2d546cf1aa5649d8a8b0/",
  98866: "https://98866.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  130: "https://convincing-yolo-cherry.unichain-mainnet.quiknode.pro/70bc08d777bf8f79d944e94939f9d0346d278e54/",
  1868: "https://autumn-alpha-pool.soneium-mainnet.quiknode.pro/a205804cacaa842f742e58fb1f87e9ef1c72329e/",
  42161: "https://virulent-little-arrow.arbitrum-mainnet.quiknode.pro/ea62f47ac6e5b1fe78a21c5d3002f9a3b992f36a",
  239: "https://239.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  747474: "https://747474.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  137: "https://137.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
  1135: "https://1135.rpc.thirdweb.com/5d4533d3262ccb63afd066df0894c9f7",
};

// Chain configs
const chainClients: Record<number, PublicClient> = {
  1: createPublicClient({ chain: mainnet, transport: http(rpcUrls[1]) }),
  8453: createPublicClient({ chain: base, transport: http(rpcUrls[8453]) }),
  80094: createPublicClient({ chain: berachain, transport: http(rpcUrls[80094]) }),
  480: createPublicClient({ chain: worldchain, transport: http(rpcUrls[480]) }),
  98866: createPublicClient({ chain: plume, transport: http(rpcUrls[98866]) }),
  137: createPublicClient({ chain: polygon, transport: http(rpcUrls[137]) }),
  1135: createPublicClient({ chain: lisk, transport: http(rpcUrls[1135]) }),
  1868: createPublicClient({ chain: soneium, transport: http(rpcUrls[1868]) }),
  130: createPublicClient({ chain: unichain, transport: http(rpcUrls[130]) }),
  239: createPublicClient({ chain: tac, transport: http(rpcUrls[239]) }),
  747474: createPublicClient({ chain: katana, transport: http(rpcUrls[747474]) }),
};

// Vault data from vault_whitelist table
const vaultConfigs = [
  // Mainnet (chain_id: 1)
  { chainId: 1, address: "0x95EeF579155cd2C5510F312c8fA39208c3Be01a8" },
  { chainId: 1, address: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0" },
  { chainId: 1, address: "0xA02F5E93f783baF150Aa1F8b341Ae90fe0a772f7" },
  { chainId: 1, address: "0x4F460bb11cf958606C69A963B4A17f9DaEEea8b6" },
  { chainId: 1, address: "0x4d52545235A3dF246a8928c583E47AE7eeC4aCfE" },
  { chainId: 1, address: "0x64964E162Aa18d32f91eA5B24a09529f811AEB8e" },
  { chainId: 1, address: "0xBE40491F3261Fd42724F1AEb465796eb11c06ddF" },
  // Base (chain_id: 8453)
  { chainId: 8453, address: "0xbb819D845b573B5D7C538F5b85057160cfb5f313" },
  // Berachain (chain_id: 80094)
  { chainId: 80094, address: "0x30BbA9CD9Eb8c95824aa42Faa1Bb397b07545bc1" },
  // Worldchain (chain_id: 480)
  { chainId: 480, address: "0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B" },
  { chainId: 480, address: "0xdaa79e066dee8c8c15ffb37b1157f7eb8e0d1b37" },
  // Plume (chain_id: 98866)
  { chainId: 98866, address: "0xc0Df5784f28046D11813356919B869dDA5815B16" },
  // Unichain (chain_id: 130)
  { chainId: 130, address: "0x6af5E46456A8ac80BB53a02799965DEF99c26e52" },
  { chainId: 130, address: "0xa48f8A10F16bB50A588606553D9fE7338050f8Cd" },
  { chainId: 130, address: "0x2c0F7e917257926BA6233B20DE19d7fe3210858C" },
  // Soneium (chain_id: 1868)
  { chainId: 1868, address: "0x41baa218A118FB2249CBCf836C1E8EE336d67faA" },
  { chainId: 1868, address: "0xbA738D34c4E278E1cd64AAA9BBd569688e8Dc5Dc" },
  { chainId: 1868, address: "0xEcDBE2AF33E68cf96F6716f706B078fa94e978cb" },
  { chainId: 1868, address: "0x04C451be70C41E4a88F7aC436AE767d64AE79049" },
  // TAC (chain_id: 239)
  { chainId: 239, address: "0xC5e1bD2473811bB782326006A3c03477F7834D35" },
  { chainId: 239, address: "0x4183Bd253Dc1918A04Bd8a8dD546BaAD58898109" },
  { chainId: 239, address: "0xf49f14Cff1bA2eE7E23222A76e0C2b3D0BDE06dC" },
  { chainId: 239, address: "0x84BBc0be5a6f831a4E2C28a2F3b892C70AcAa5b3" },
  { chainId: 239, address: "0xe9BD3590A68939344953b4f912d83b7c8C2A1f77" },
  { chainId: 239, address: "0x341193ED21711472e71aECa4A942123452bd0ddA" },
  // Katana (chain_id: 747474)
  { chainId: 747474, address: "0x6680D2993fAadC9204Bd614a53e0c7a3f20c8ca5" },
  { chainId: 747474, address: "0xdc97cF490b2D367F34E5AF8a5f90d2b8FCBA8ce1" },
  // Polygon (chain_id: 137)
  { chainId: 137, address: "0xF91D80E43272DBC610551E8c872E0438d62C1c69" },
  // Lisk (chain_id: 1135)
  { chainId: 1135, address: "0x50cB55BE8cF05480a844642cB979820C847782aE" },
  { chainId: 1135, address: "0x7Cbaa98bd5e171A658FdF761ED1Db33806a0d346" },
  { chainId: 1135, address: "0x8258F0c79465c95AFAc325D6aB18797C9DDAcf55" },
  { chainId: 1135, address: "0xD92f564A29992251297980187a6B74FAa3D50699" },
  { chainId: 1135, address: "0xE9cB4c4d3F0798e3087D4d49D3307cDB302CEC55" },
  { chainId: 1135, address: "0x9cF2f0AF475398ca01F099974960adbC9cB87025" },
];

// Market data from migration
const marketConfigs = [
  // Plume markets (chain_id: 98866)
  { chainId: 98866, marketId: "0x970b184db9382337bf6b693017cf30936a26001fb26bac24e238c77629a75046" },
  { chainId: 98866, marketId: "0x7a96549cae736c913d12c78ee4c155c2d2f874031fce5acdd07bdbf23d7644c7" },
  { chainId: 98866, marketId: "0xcf3bb7b9935f60d79da7b7bc6405328e6f990b6894895f1df7acfb4c82bc4c5a" },
  { chainId: 98866, marketId: "0x4e5b50278bf256f0af3d2b696545cba3de02dacba6bea930bdd5cf83dd4304f4" },
  { chainId: 98866, marketId: "0xe70dd0172a62a91b8e9d67bf4815a2f72120b7f92dacac5448c2f075cd6f1079" },
  { chainId: 98866, marketId: "0xa05b28928ab7aea096978928cfb3545333b30b36695bf1510922ac1d6a2c044a" },
  { chainId: 98866, marketId: "0xa39e210a871820d48b6c96e441c0b0fd2dddde3cfcc0074ab7e716df0751b549" },
  { chainId: 98866, marketId: "0x8243ee11b8f23c49d7734907316031d0a5030cbc0a77d5e649422678708c9798" },
  // Mainnet markets (chain_id: 1)
  { chainId: 1, marketId: "0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e" },
  { chainId: 1, marketId: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" },
  { chainId: 1, marketId: "0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7" },
  { chainId: 1, marketId: "0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942" },
  { chainId: 1, marketId: "0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41" },
  { chainId: 1, marketId: "0x5f8a138ba332398a9116910f4d5e5dcd9b207024c5290ce5bc87bc2dbd8e4a86" },
  { chainId: 1, marketId: "0x6c65bb7104ae6fc1dc2cdc97fcb7df2a4747363e76135b32d9170b2520bb65eb" },
  { chainId: 1, marketId: "0xdc5333039bcf15f1237133f74d5806675d83d9cf19cfd4cfdd9be674842651bf" },
  { chainId: 1, marketId: "0xcec858380cba2d9ca710fce3ce864d74c3f620d53826f69d08508902e09be86f" },
  { chainId: 1, marketId: "0x1ca7ff6b26581fe3155f391f3960d32a033b5f7d537b1f1932b2021a6cf4f706" },
  { chainId: 1, marketId: "0x2e09b73c35e0769bdf589a9556e6ac3c892485ea502ac8c445cec9e79b0378af" },
  { chainId: 1, marketId: "0x06cd324a963c18a7c046be97dba2a4af9b82f0ca3a2e451a38ccfb9c76667e5f" },
  { chainId: 1, marketId: "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" },
  { chainId: 1, marketId: "0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b" },
  { chainId: 1, marketId: "0x5109cda72b0603e1bac4631ddebd3104bea6414e686c3f7aa2cb3c65795602f0" },
  { chainId: 1, marketId: "0x3df62177d8dd48708addac57caad778286f104c98a6866817b105795be0605e8" },
  { chainId: 1, marketId: "0x3c81a7e3cbcdeeecc7d9f7c45ed28ef62d63357cfcc7295e9d2b3368f0386b46" },
  { chainId: 1, marketId: "0x8a8650a5ed923712ca86a9b83bd12ea520131c646c4da5de3a443416e1bb8c98" },
  { chainId: 1, marketId: "0x08cfaaa2e7797b4e1326d1d174dd364c9fb3a2a718623a3b7f97ea1debba47b8" },
  { chainId: 1, marketId: "0x7e72f1671f1fd2c0900b6ef8bb6b55299d6a58fd398e3b8e05c12e3c429c401b" },
  { chainId: 1, marketId: "0x96cad5abf2bd0b30de441639a54125b6d1c6ba14c211fdc1d21abe5ec2bef542" },
  { chainId: 1, marketId: "0xbfed072faee09b963949defcdb91094465c34c6c62d798b906274ef3563c9cac" },
  { chainId: 1, marketId: "0x729badf297ee9f2f6b3f717b96fd355fc6ec00422284ce1968e76647b258cf44" },
  { chainId: 1, marketId: "0x8e7cc042d739a365c43d0a52d5f24160fa7ae9b7e7c9a479bd02a56041d4cf77" },
  // Base markets (chain_id: 8453)
  { chainId: 8453, marketId: "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8" },
  { chainId: 8453, marketId: "0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea" },
  { chainId: 8453, marketId: "0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf" },
  { chainId: 8453, marketId: "0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d" },
  { chainId: 8453, marketId: "0x1c21c59df9db44bf6f645d854ee710a8ca17b479451447e9f56758aee10a2fad" },
  { chainId: 8453, marketId: "0x144bf18d6bf4c59602548a825034f73bf1d20177fc5f975fc69d5a5eba929b45" },
  { chainId: 8453, marketId: "0x7f90d72667171d72d10d62b5828d6a5ef7254b1e33718fe0c1f7dcf56dd1edc7" },
  { chainId: 8453, marketId: "0x6aa81f51dfc955df598e18006deae56ce907ac02b0b5358705f1a28fcea23cc0" },
  { chainId: 8453, marketId: "0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba" },
  { chainId: 8453, marketId: "0x214c2bf3c899c913efda9c4a49adff23f77bbc2dc525af7c05be7ec93f32d561" },
  { chainId: 8453, marketId: "0x86021ffe2f778ed8aacecdf3dae2cdef77dbfa5e133b018cca16c52ceab58996" },
  { chainId: 8453, marketId: "0x6600aae6c56d242fa6ba68bd527aff1a146e77813074413186828fd3f1cdca91" },
  { chainId: 8453, marketId: "0x78d11c03944e0dc298398f0545dc8195ad201a18b0388cb8058b1bcb89440971" },
  { chainId: 8453, marketId: "0xe3c4d4d0e214fdc52635d7f9b2f7b3b0081771ae2efeb3cb5aae26009f34f7a7" },
  // Worldchain markets (chain_id: 480)
  { chainId: 480, marketId: "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8" },
  // Berachain markets (chain_id: 80094)
  { chainId: 80094, marketId: "0x1ba7904c73d337c39cb88b00180dffb215fc334a6ff47bbe829cd9ee2af00c97" },
];

async function fetchVaultName(client: PublicClient, vaultAddress: Address): Promise<string | null> {
  try {
    const name = await client.readContract({
      address: vaultAddress,
      abi: metaMorphoAbi,
      functionName: "name",
    });
    return name as string;
  } catch (error) {
    console.error(`Error fetching vault name for ${vaultAddress}:`, error);
    return null;
  }
}

async function fetchMarketParams(
  client: PublicClient,
  morpho: Address,
  marketId: Hex
): Promise<{ loanToken: Address; collateralToken: Address } | null> {
  try {
    const params = await client.readContract({
      address: morpho,
      abi: morphoBlueAbi,
      functionName: "idToMarketParams",
      args: [marketId],
    });
    return {
      loanToken: (params as readonly [Address, Address, Address, Address, bigint])[0],
      collateralToken: (params as readonly [Address, Address, Address, Address, bigint])[1],
    };
  } catch (error) {
    console.error(`Error fetching market params for ${marketId}:`, error);
    return null;
  }
}

async function fetchTokenSymbol(client: PublicClient, tokenAddress: Address): Promise<string | null> {
  try {
    const symbol = await client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });
    return symbol as string;
  } catch (error) {
    console.error(`Error fetching token symbol for ${tokenAddress}:`, error);
    return null;
  }
}

async function main() {
  const vaultUpdates: string[] = [];
  const marketUpdates: string[] = [];

  console.log("Fetching vault names...\n");

  // Fetch vault names
  for (const vault of vaultConfigs) {
    const client = chainClients[vault.chainId];
    if (!client) {
      console.warn(`No client for chain ${vault.chainId}`);
      continue;
    }

    const name = await fetchVaultName(client, vault.address as Address);
    if (name) {
      const escapedName = name.replace(/'/g, "''");
      vaultUpdates.push(
        `UPDATE "vault_apy_config" SET "vault_name" = '${escapedName}' WHERE "chain_id" = ${vault.chainId} AND "vault_address" = '${vault.address}';`
      );
      console.log(`Chain ${vault.chainId} - Vault ${vault.address}: ${name}`);
    }
  }

  console.log("\nFetching market metadata...\n");

  // Fetch market token symbols
  for (const market of marketConfigs) {
    const client = chainClients[market.chainId];
    const morpho = morphoAddresses[market.chainId];
    if (!client || !morpho) {
      console.warn(`No client or morpho address for chain ${market.chainId}`);
      continue;
    }

    const params = await fetchMarketParams(client, morpho, market.marketId as Hex);
    if (!params) continue;

    const [collateralSymbol, loanSymbol] = await Promise.all([
      fetchTokenSymbol(client, params.collateralToken),
      fetchTokenSymbol(client, params.loanToken),
    ]);

    if (collateralSymbol && loanSymbol) {
      const escapedCollateral = collateralSymbol.replace(/'/g, "''");
      const escapedLoan = loanSymbol.replace(/'/g, "''");
      marketUpdates.push(
        `UPDATE "market_apy_config" SET "collateral_symbol" = '${escapedCollateral}', "loan_symbol" = '${escapedLoan}' WHERE "chain_id" = ${market.chainId} AND "market_id" = '${market.marketId}';`
      );
      console.log(`Chain ${market.chainId} - Market ${market.marketId.slice(0, 10)}...: ${collateralSymbol}/${loanSymbol}`);
    }
  }

  // Output SQL
  console.log("\n\n--- SQL UPDATE STATEMENTS ---\n");
  console.log("-- Vault name updates");
  for (const sql of vaultUpdates) {
    console.log(sql);
  }
  console.log("\n-- Market metadata updates");
  for (const sql of marketUpdates) {
    console.log(sql);
  }
}

main().catch(console.error);
