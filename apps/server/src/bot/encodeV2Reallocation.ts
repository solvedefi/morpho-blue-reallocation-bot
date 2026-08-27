import { encodeFunctionData, type Hex } from "viem";

import { vaultV2Abi } from "../../abis/VaultV2.js";
import { Reallocation, ReallocationAction } from "../contracts/typesV2.js";

export function encodeV2Reallocation(reallocation: Reallocation): Hex[] {
  return [
    ...reallocation.deallocations.map(encodeV2Deallocation),
    ...reallocation.allocations.map(encodeV2Allocation),
  ];
}

function encodeV2Allocation(action: ReallocationAction): Hex {
  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName: "allocate",
    args: [action.adapterAddress, action.data, action.assets],
  });
}

function encodeV2Deallocation(action: ReallocationAction): Hex {
  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName: "deallocate",
    args: [action.adapterAddress, action.data, action.assets],
  });
}
