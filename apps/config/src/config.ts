import { defineChain } from "viem";
import { mainnet, base, unichain, polygon, worldchain, lisk, soneium } from "viem/chains";

import type { Config } from "./types";

const sourceId = 1; // ethereum

const plume = defineChain({
  id: 98_866,
  name: "Plume Mainnet",
  nativeCurrency: {
    name: "Plume Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.plumenetwork.xyz"],
      webSocket: ["wss://rpc.plumenetwork.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.plumenetwork.xyz",
      apiUrl: "https://explorer.plumenetwork.xyz/api",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 48_577,
    },
  },
  sourceId,
});

//TODO: configure the chains
//TODO: configure the chains
//TODO: configure the chains
//TODO: configure the chains
//TODO: configure the chains
export const chainConfigs: Record<number, Config> = {
  [base.id]: {
    chain: base,
    morpho: {
      address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      startBlock: 13977148,
    },
    adaptiveCurveIrm: {
      address: "0x46415998764C29aB2a25CbeA6254146D50D22687",
      startBlock: 13977152,
    },
    metaMorphoFactories: {
      addresses: [
        "0xFf62A7c278C62eD665133147129245053Bbf5918",
        "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      ],
      startBlock: 13978134,
    },
  },
  [mainnet.id]: {
    chain: mainnet,
    morpho: {
      address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      startBlock: 18883124,
    },
    adaptiveCurveIrm: {
      address: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
      startBlock: 18883124,
    },
    metaMorphoFactories: {
      addresses: [
        "0x1897A8997241C1cD4bD0698647e4EB7213535c24",
        "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      ],
      startBlock: 18925584,
    },
  },
  [unichain.id]: {
    chain: unichain,
    morpho: {
      address: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A",
      startBlock: 9139027,
    },
    adaptiveCurveIrm: {
      address: "0x9a6061d51743b31d2c3be75d83781fa423f53f0e",
      startBlock: 9139027,
    },
    metaMorphoFactories: {
      addresses: ["0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0"],
      startBlock: 9316789,
    },
  },
  [polygon.id]: {
    chain: polygon,
    morpho: {
      address: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
      startBlock: 66931042,
    },
    adaptiveCurveIrm: {
      address: "0xe675A2161D4a6E2de2eeD70ac98EEBf257FBF0B0",
      startBlock: 66931042,
    },
    metaMorphoFactories: {
      addresses: ["0xa9c87daB340631C34BB738625C70499e29ddDC98"],
      startBlock: 66931118,
    },
  },
  [worldchain.id]: {
    chain: worldchain,
    morpho: {
      address: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
      startBlock: 9025669,
    },
    adaptiveCurveIrm: {
      address: "0x34E99D604751a72cF8d0CFDf87069292d82De472",
      startBlock: 9025669,
    },
    metaMorphoFactories: {
      addresses: ["0x4DBB3a642a2146d5413750Cca3647086D9ba5F12"],
      startBlock: 9025733,
    },
  },
  [lisk.id]: {
    chain: lisk,
    morpho: {
      address: "0x00cD58DEEbd7A2F1C55dAec715faF8aed5b27BF8",
      startBlock: 15731231,
    },
    adaptiveCurveIrm: {
      address: "0x5576629f21D528A8c3e06C338dDa907B94563902",
      startBlock: 15731231,
    },
    metaMorphoFactories: {
      addresses: ["0x01dD876130690469F685a65C2B295A90a81BaD91"],
      startBlock: 15731333,
    },
  },
  // 98866 is the correct id, 98865 is the one which is used by viem
  [98866]: {
    chain: plume,
    morpho: {
      address: "0x42b18785CE0Aed7BF7Ca43a39471ED4C0A3e0bB5",
      startBlock: 765994,
    },
    adaptiveCurveIrm: {
      address: "0x7420302Ddd469031Cd2282cd64225cCd46F581eA",
      startBlock: 765994,
    },
    metaMorphoFactories: {
      addresses: ["0x2525D453D9BA13921D5aB5D8c12F9202b0e19456"],
      startBlock: 766078,
    },
  },
  [soneium.id]: {
    chain: soneium,
    morpho: {
      address: "0xE75Fc5eA6e74B824954349Ca351eb4e671ADA53a",
      startBlock: 6440817,
    },
    adaptiveCurveIrm: {
      address: "0x68F9b666b984527A7c145Db4103Cc6d3171C797F",
      startBlock: 6440817,
    },
    metaMorphoFactories: {
      addresses: ["0x7026b436f294e560b3C26E731f5cac5992cA2B33"],
      startBlock: 6440899,
    },
  },
};
