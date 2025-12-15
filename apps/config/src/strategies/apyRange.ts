import { base, berachain, mainnet, worldchain } from "viem/chains";

import { plume } from "../config";

export interface Range {
  min: number;
  max: number;
}

export const DEFAULT_APY_RANGE: Range = {
  min: 0,
  max: 10,
};

/**
 * If set to true, the bot might reallocate liquidity into the idle market if it's necessary to reach the target apy ranges.
 * If set to false, the bot will not reallocate liquidity into the idle market.
 */
export const ALLOW_IDLE_REALLOCATION = true;

export const vaultsDefaultApyRanges: Record<number, Record<string, Range>> = {
  [worldchain.id]: {
    "0xb1E80387EbE53Ff75a89736097D34dC8D9E9045B": {
      min: 5.5,
      max: 6.5,
    },
    "0xdaa79e066dee8c8c15ffb37b1157f7eb8e0d1b37": {
      min: 3.5,
      max: 4.5,
    },
  },
};

export const marketsApyRanges: Record<number, Record<string, Range>> = {
  [plume.id]: {
    // nbasis/pusd - 5%
    "0x970b184db9382337bf6b693017cf30936a26001fb26bac24e238c77629a75046": {
      min: 4.5,
      max: 5.5,
    },
    //nalpha/pusd - 9%
    "0x7a96549cae736c913d12c78ee4c155c2d2f874031fce5acdd07bdbf23d7644c7": {
      min: 8.5,
      max: 9.5,
    },
    //tbill/pusd - 3%
    "0xcf3bb7b9935f60d79da7b7bc6405328e6f990b6894895f1df7acfb4c82bc4c5a": {
      min: 2.5,
      max: 3.5,
    },
    //WPlume/pusd - other pusd markets 7%
    "0x4e5b50278bf256f0af3d2b696545cba3de02dacba6bea930bdd5cf83dd4304f4": {
      min: 6.5,
      max: 7.5,
    },
    //nAlpha/pusd - 9%
    "0xe70dd0172a62a91b8e9d67bf4815a2f72120b7f92dacac5448c2f075cd6f1079": {
      min: 8.5,
      max: 9.5,
    },
    //nCredit/pusd - 9%
    "0xa05b28928ab7aea096978928cfb3545333b30b36695bf1510922ac1d6a2c044a": {
      min: 6.5,
      max: 7.5,
    },
    //WETH/pusd - other pusd markets 7%
    "0xa39e210a871820d48b6c96e441c0b0fd2dddde3cfcc0074ab7e716df0751b549": {
      min: 6.5,
      max: 7.5,
    },
    //nCredit/pusd - other pusd markets 7%
    "0x8243ee11b8f23c49d7734907316031d0a5030cbc0a77d5e649422678708c9798": {
      min: 6.5,
      max: 7.5,
    },
  },
  [mainnet.id]: {
    // Renzo Restaked ETH/Wrapped Ether
    "0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped liquid staked Ether 2.0/Wrapped Ether
    "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped eETH/Wrapped Ether
    "0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7": {
      min: 2.0,
      max: 3.0,
    },
    // rsETH/Wrapped Ether
    "0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped liquid staked Ether 2.0/Wrapped Ether
    "0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41": {
      min: 2.0,
      max: 3.0,
    },
    // ETHPlus/Wrapped Ether
    "0x5f8a138ba332398a9116910f4d5e5dcd9b207024c5290ce5bc87bc2dbd8e4a86": {
      min: 2.0,
      max: 3.0,
    },
    // Aladdin rUSD/USD Coin
    "0x6c65bb7104ae6fc1dc2cdc97fcb7df2a4747363e76135b32d9170b2520bb65eb": {
      min: 4.5,
      max: 5.5,
    },
    // Staked USDe/Tether USD
    "0xdc5333039bcf15f1237133f74d5806675d83d9cf19cfd4cfdd9be674842651bf": {
      min: 4.5,
      max: 5.5,
    },
    // USDe/Tether USD
    "0xcec858380cba2d9ca710fce3ce864d74c3f620d53826f69d08508902e09be86f": {
      min: 4.5,
      max: 5.5,
    },
    // Savings Dai/Tether USD
    "0x1ca7ff6b26581fe3155f391f3960d32a033b5f7d537b1f1932b2021a6cf4f706": {
      min: 4.5,
      max: 5.5,
    },
    // Staked Falcon USD/Falcon USD
    "0x2e09b73c35e0769bdf589a9556e6ac3c892485ea502ac8c445cec9e79b0378af": {
      min: 4.5,
      max: 5.5,
    },
    // PT Staked Falcon USD 25SEP2025/Falcon USD
    "0x06cd324a963c18a7c046be97dba2a4af9b82f0ca3a2e451a38ccfb9c76667e5f": {
      min: 4.5,
      max: 5.5,
    },
    // Wrapped liquid staked Ether 2.0/USD Coin
    "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc": {
      min: 4.5,
      max: 5.5,
    },
    // Savings USDS/USD Coin
    "0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b": {
      min: 4.5,
      max: 5.5,
    },
    // USDe/Frax
    "0x5109cda72b0603e1bac4631ddebd3104bea6414e686c3f7aa2cb3c65795602f0": {
      min: 4.5,
      max: 5.5,
    },
    // Staked USDe/Frax
    "0x3df62177d8dd48708addac57caad778286f104c98a6866817b105795be0605e8": {
      min: 4.5,
      max: 5.5,
    },
    // USDe/Frax
    "0x3c81a7e3cbcdeeecc7d9f7c45ed28ef62d63357cfcc7295e9d2b3368f0386b46": {
      min: 4.5,
      max: 5.5,
    },
    // Staked USDe/Frax
    "0x8a8650a5ed923712ca86a9b83bd12ea520131c646c4da5de3a443416e1bb8c98": {
      min: 4.5,
      max: 5.5,
    },
    // USDe/Frax
    "0x08cfaaa2e7797b4e1326d1d174dd364c9fb3a2a718623a3b7f97ea1debba47b8": {
      min: 4.5,
      max: 5.5,
    },
    // Staked USDe/Frax
    "0x7e72f1671f1fd2c0900b6ef8bb6b55299d6a58fd398e3b8e05c12e3c429c401b": {
      min: 4.5,
      max: 5.5,
    },
    // Pareto AA Tranche - RockawayXUSDC/USD Coin
    "0x96cad5abf2bd0b30de441639a54125b6d1c6ba14c211fdc1d21abe5ec2bef542": {
      min: 4.5,
      max: 5.5,
    },
    // Savings rUSD/USD Coin
    "0xbfed072faee09b963949defcdb91094465c34c6c62d798b906274ef3563c9cac": {
      min: 4.5,
      max: 5.5,
    },
    // Syrup USDC/USD Coin
    "0x729badf297ee9f2f6b3f717b96fd355fc6ec00422284ce1968e76647b258cf44": {
      min: 4.5,
      max: 5.5,
    },
    // Resolv USD/USD Coin
    "0x8e7cc042d739a365c43d0a52d5f24160fa7ae9b7e7c9a479bd02a56041d4cf77": {
      min: 4.5,
      max: 5.5,
    },
  },
  [base.id]: {
    //mBasis/usdc - 8%
    "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8": {
      min: 7.5,
      max: 8.5,
    },
    // Wrapped liquid staked Ether 2.0/Electronic Dollar
    "0xce89aeb081d719cd35cb1aafb31239c4dfd9c017b2fec26fc2e9a443461e9aea": {
      min: 4.5,
      max: 5.5,
    },
    // Based ETH/Electronic Dollar
    "0xf9ed1dba3b6ba1ede10e2115a9554e9c52091c9f1b1af21f9e0fecc855ee74bf": {
      min: 4.5,
      max: 5.5,
    },
    // Coinbase Wrapped Staked ETH/Electronic Dollar
    "0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d": {
      min: 4.5,
      max: 5.5,
    },
    // Coinbase Wrapped Staked ETH/USD Coin
    "0x1c21c59df9db44bf6f645d854ee710a8ca17b479451447e9f56758aee10a2fad": {
      min: 4.5,
      max: 5.5,
    },
    // Wrapped Super OETH/Wrapped Ether
    "0x144bf18d6bf4c59602548a825034f73bf1d20177fc5f975fc69d5a5eba929b45": {
      min: 2.0,
      max: 3.0,
    },
    // Based ETH/Wrapped Ether
    "0x7f90d72667171d72d10d62b5828d6a5ef7254b1e33718fe0c1f7dcf56dd1edc7": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped liquid staked Ether 2.0/Wrapped Ether
    "0x6aa81f51dfc955df598e18006deae56ce907ac02b0b5358705f1a28fcea23cc0": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped liquid staked Ether 2.0/Wrapped Ether
    "0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba": {
      min: 2.0,
      max: 3.0,
    },
    // rsETHWrapper/Wrapped Ether
    "0x214c2bf3c899c913efda9c4a49adff23f77bbc2dc525af7c05be7ec93f32d561": {
      min: 2.0,
      max: 3.0,
    },
    // Renzo Restaked ETH/Wrapped Ether
    "0x86021ffe2f778ed8aacecdf3dae2cdef77dbfa5e133b018cca16c52ceab58996": {
      min: 2.0,
      max: 3.0,
    },
    // Coinbase Wrapped Staked ETH/Wrapped Ether
    "0x6600aae6c56d242fa6ba68bd527aff1a146e77813074413186828fd3f1cdca91": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped eETH/Wrapped Ether
    "0x78d11c03944e0dc298398f0545dc8195ad201a18b0388cb8058b1bcb89440971": {
      min: 2.0,
      max: 3.0,
    },
    // Wrapped liquid staked Ether 2.0/Wrapped Ether
    "0xe3c4d4d0e214fdc52635d7f9b2f7b3b0081771ae2efeb3cb5aae26009f34f7a7": {
      min: 2.0,
      max: 3.0,
    },
  },
  [worldchain.id]: {
    "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8": {
      min: 7.5,
      max: 8.5,
    },
  },
  [berachain.id]: {
    //susde/honey
    "0x1ba7904c73d337c39cb88b00180dffb215fc334a6ff47bbe829cd9ee2af00c97": {
      min: 2.5,
      max: 3.5,
    },
  },
};

export const DEFAULT_MIN_APY_DELTA_BIPS = 25;

export const vaultsDefaultMinApsDeltaBips: Record<number, Record<string, number>> = {};
export const marketsMinApsDeltaBips: Record<number, Record<string, number>> = {};
