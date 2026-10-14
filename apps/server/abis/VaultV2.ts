// ponytail: minimal VaultV2 + MorphoMarketV1AdapterV2 ABIs, only what the bot calls.
// Selectors verified against the deployed TAC USDT vault bytecode.

const marketParamsTuple = {
  name: "marketParams",
  type: "tuple",
  components: [
    { name: "loanToken", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "oracle", type: "address" },
    { name: "irm", type: "address" },
    { name: "lltv", type: "uint256" },
  ],
} as const;

export const vaultV2Abi = [
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "AbsoluteCapExceeded", inputs: [] },
  { type: "error", name: "RelativeCapExceeded", inputs: [] },
  { type: "error", name: "NotAdapter", inputs: [] },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "adaptersLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "adapters",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "absoluteCap",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "relativeCap",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allocation",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allocate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "adapter", type: "address" },
      { name: "data", type: "bytes" },
      { name: "assets", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deallocate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "adapter", type: "address" },
      { name: "data", type: "bytes" },
      { name: "assets", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [],
  },
] as const;

export const marketV1AdapterV2Abi = [
  {
    type: "function",
    name: "marketIdsLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "marketIds",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "supplyShares",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ids",
    stateMutability: "view",
    inputs: [marketParamsTuple],
    outputs: [{ type: "bytes32[]" }],
  },
] as const;
