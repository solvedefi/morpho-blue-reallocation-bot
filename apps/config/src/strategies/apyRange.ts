import { base, mainnet } from "viem/chains";

export interface Range {
  min: number;
  max: number;
}

export const DEFAULT_APY_RANGE: Range = {
  min: 3,
  max: 8,
};

/**
 * If set to true, the bot might reallocate liquidity into the idle market if it's necessary to reach the target apy ranges.
 * If set to false, the bot will not reallocate liquidity into the idle market.
 */
export const ALLOW_IDLE_REALLOCATION = true;

export const vaultsDefaultApyRanges: Record<number, Record<string, Range>> = {
  [mainnet.id]: {
    "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB": {
      min: 4,
      max: 6,
    },
    "0xBEeFFF209270748ddd194831b3fa287a5386f5bC": {
      min: 5,
      max: 7,
    },
  },
  [base.id]: {
    "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A": {
      min: 4.25,
      max: 6.25,
    },
  },
};

export const marketsApyRanges: Record<number, Record<string, Range>> = {
  // [mainnet.id]: {
  //   "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49": {
  //     min: 5.25,
  //     max: 6.25,
  //   },
  //   "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64": {
  //     min: 5.15,
  //     max: 6.15,
  //   },
  // },
  [base.id]: {
    // // uXRP/USDC
    // "0xa426ca680bd5a7dc0f95942ba876a7df399cdf8149f798bcc4e94f03e35d08fa": {
    //   min: 7,
    //   max: 8,
    // },
    // // uSUI/USDC
    // "0x5d96564285fc3830f51fe495f88c29cc1232fbca61ca8b6edc25bff921efdef2": {
    //   min: 6,
    //   max: 7,
    // },
    // // cbBTC/USDC
    // "0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836": {
    //   min: 6,
    //   max: 7,
    // },
    // // uSOL/USDC
    // "0xa60e9b888f343351dece4df8251abe5858fc5db96e8624d614a6500c3a3085ea": {
    //   min: 6,
    //   max: 7,
    // },

    // mBASIS/USDC
    "0x45f3b5688e7ba25071f78d1ce51d1b893faa3c86897b12204cdff3af6b3611f8": {
      min: 6,
      max: 7,
    },
    // cbBTC/USDC
    "0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836": {
      min: 6,
      max: 7,
    },
    // wbCOIN/USDC
    "0x34f676bd8db106d6cdc90d0fb44145cea2f393310a794812cb1c5a8726b60913": {
      min: 6,
      max: 7,
    },
    // LBTC/USDC
    "0x52a2a376586d0775e3e80621facc464f6e96d81c8cb70fd461527dde195a079f": {
      min: 6,
      max: 7,
    },
  },
};

export const DEFAULT_MIN_APY_DELTA_BIPS = 25;

export const vaultsDefaultMinApsDeltaBips: Record<number, Record<string, number>> = {};
export const marketsMinApsDeltaBips: Record<number, Record<string, number>> = {};
