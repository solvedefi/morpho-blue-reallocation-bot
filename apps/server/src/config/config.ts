import { Address, defineChain } from "viem";
import { base, mainnet, berachain, worldchain, polygon, lisk, soneium } from "viem/chains";

import type { Config } from "./types";

export const sourceId = 1; // ethereum

export const plume = defineChain({
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

export const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.unichain.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Uniscan",
      url: "https://uniscan.xyz",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 0,
    },
  },
  sourceId,
});

export const tac = defineChain({
  id: 239,
  name: "TAC",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.tacchain.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "TAC Explorer",
      url: "https://explorer.tacchain.io",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 0,
    },
  },
  sourceId,
});

export const katana = defineChain({
  id: 747_474,
  name: "Katana",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.katana.gg"],
    },
  },
  blockExplorers: {
    default: {
      name: "Katana Explorer",
      url: "https://explorer.katana.gg",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 0,
    },
  },
  sourceId,
});

export const chainConfigs: Record<number, Config> = {
  [berachain.id]: {
    chain: berachain,
    morpho: "0x24147243f9c08d835C218Cda1e135f8dFD0517D0",
    adaptiveCurveIrm: "0xcf247Df3A2322Dea0D408f011c194906E77a6f62",
    metaMorphoFactories: ["0x5EDd48C6ACBd565Eeb31702FD9fa9Cbc86fbE616"],
  },
  [mainnet.id]: {
    chain: mainnet,
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    metaMorphoFactories: [
      "0x1897A8997241C1cD4bD0698647e4EB7213535c24",
      "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
    ],
  },
  [98866]: {
    chain: plume,
    morpho: "0x42b18785CE0Aed7BF7Ca43a39471ED4C0A3e0bB5",
    adaptiveCurveIrm: "0x7420302Ddd469031Cd2282cd64225cCd46F581eA",
    metaMorphoFactories: ["0x2525D453D9BA13921D5aB5D8c12F9202b0e19456"],
  },
  [worldchain.id]: {
    chain: worldchain,
    morpho: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
    adaptiveCurveIrm: "0x34E99D604751a72cF8d0CFDf87069292d82De472",
    metaMorphoFactories: ["0x4DBB3a642a2146d5413750Cca3647086D9ba5F12"],
  },
  [base.id]: {
    chain: base,
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    adaptiveCurveIrm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    metaMorphoFactories: [
      "0xFf62A7c278C62eD665133147129245053Bbf5918",
      "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
    ],
  },
  [polygon.id]: {
    chain: polygon,
    morpho: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
    adaptiveCurveIrm: "0xe675A2161D4a6E2de2eeD70ac98EEBf257FBF0B0",
    metaMorphoFactories: ["0xa9c87daB340631C34BB738625C70499e29ddDC98"],
  },
  [lisk.id]: {
    chain: lisk,
    morpho: "0x00cD58DEEbd7A2F1C55dAec715faF8aed5b27BF8",
    adaptiveCurveIrm: "0x5576629f21D528A8c3e06C338dDa907B94563902",
    metaMorphoFactories: ["0x01dD876130690469F685a65C2B295A90a81BaD91"],
  },
  [soneium.id]: {
    chain: soneium,
    morpho: "0xE75Fc5eA6e74B824954349Ca351eb4e671ADA53a",
    adaptiveCurveIrm: "0x68F9b666b984527A7c145Db4103Cc6d3171C797F",
    metaMorphoFactories: ["0x7026b436f294e560b3C26E731f5cac5992cA2B33"],
  },
  [130]: {
    chain: unichain,
    morpho: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A" as Address,
    adaptiveCurveIrm: "0x9a6061d51743B31D2c3Be75D83781Fa423f53F0E" as Address,
    metaMorphoFactories: ["0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0"] as Address[],
  },
  [239]: {
    chain: tac,
    morpho: "0x918B9F2E4B44E20c6423105BB6cCEB71473aD35c" as Address,
    adaptiveCurveIrm: "0x7E82b16496fA8CC04935528dA7F5A2C684A3C7A3" as Address,
    metaMorphoFactories: ["0xcDA78f4979d17Ec93052A84A12001fe0088AD734"] as Address[],
  },
  [747474]: {
    chain: katana,
    morpho: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc" as Address,
    adaptiveCurveIrm: "0x4F708C0ae7deD3d74736594C2109C2E3c065B428" as Address,
    metaMorphoFactories: ["0x1c8De6889acee12257899BFeAa2b7e534de32E16"] as Address[],
  },
};
