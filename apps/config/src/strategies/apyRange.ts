import { base, berachain, worldchain } from "viem/chains";

import { plume } from "../config";

export interface Range {
  min: number;
  max: number;
}

export const DEFAULT_APY_RANGE: Range = {
  min: 0,
  max: 15,
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
  [base.id]: {
    //mBasis/usdc - 8%
    "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8": {
      min: 7.5,
      max: 8.5,
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
