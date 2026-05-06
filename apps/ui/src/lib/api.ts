export interface ApyRangeConfig {
  min: number;
  max: number;
}

export type VaultApyRangeWithMeta = ApyRangeConfig;

export interface MarketApyRangeWithMeta extends ApyRangeConfig {
  collateralSymbol: string;
  loanSymbol: string;
}

export interface Configuration {
  vaultRanges: Record<number, Record<string, VaultApyRangeWithMeta>>;
  marketRanges: Record<number, Record<string, MarketApyRangeWithMeta>>;
  allowIdleReallocation: boolean;
  defaultMinApy: number;
  defaultMaxApy: number;
}

export interface ConfigResponse {
  success: boolean;
  data: Configuration;
}

export interface UpdateMarketRequest {
  chainId: number;
  marketId: string;
  minApy: number;
  maxApy: number;
}

export interface UpdateVaultRequest {
  chainId: number;
  vaultAddress: string;
  minApy: number;
  maxApy: number;
}

export interface UpdateStrategyRequest {
  allowIdleReallocation?: boolean;
  defaultMinApy?: number;
  defaultMaxApy?: number;
}

export type VaultVersion = "V1" | "V2";

export interface WhitelistedVault {
  address: string;
  name: string;
  vaultVersion: VaultVersion;
}

export interface V2VaultEntry {
  chainId: number;
  vaultAddress: string;
  adapterAddress: string;
  marketIds: string[];
}

export interface V2MarketsResponse {
  success: boolean;
  data: V2VaultEntry[];
}

export interface ChainConfig {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  executionInterval: number;
  enabled: boolean;
  vaultWhitelist: WhitelistedVault[];
  minGasWei: string | null;
  gasCheckIntervalSec: number;
}

export interface ChainsResponse {
  success: boolean;
  data: ChainConfig[];
}

export interface UpdateChainRequest {
  enabled?: boolean;
  executionInterval?: number;
  minGasWei?: string | null;
  gasCheckIntervalSec?: number;
}

export interface AddVaultRequest {
  vaultAddress: string;
  vaultVersion?: VaultVersion;
}

export interface UpdateVaultStatusRequest {
  enabled: boolean;
}

interface ErrorResponse {
  error?: string;
}

interface SuccessResponse {
  success: boolean;
}

export const api = {
  async getConfig(): Promise<ConfigResponse> {
    const response = await fetch("/config");
    if (!response.ok) {
      throw new Error("Failed to fetch configuration");
    }
    return response.json() as Promise<ConfigResponse>;
  },

  async updateMarketRange(data: UpdateMarketRequest): Promise<SuccessResponse> {
    const response = await fetch("/config/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to update market range");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async updateVaultRange(data: UpdateVaultRequest): Promise<SuccessResponse> {
    const response = await fetch("/config/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to update vault range");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async updateStrategy(data: UpdateStrategyRequest): Promise<SuccessResponse> {
    const response = await fetch("/config/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to update strategy");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async getChains(): Promise<ChainsResponse> {
    const response = await fetch("/chains");
    if (!response.ok) {
      throw new Error("Failed to fetch chains");
    }
    return response.json() as Promise<ChainsResponse>;
  },

  async getV2Markets(chainId: number): Promise<V2MarketsResponse> {
    const response = await fetch(`/chains/${String(chainId)}/v2-markets`);
    if (!response.ok) {
      throw new Error("Failed to fetch V2 markets");
    }
    return response.json() as Promise<V2MarketsResponse>;
  },

  async updateChain(chainId: number, data: UpdateChainRequest): Promise<SuccessResponse> {
    const response = await fetch(`/chains/${String(chainId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to update chain");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async addVaultToWhitelist(chainId: number, data: AddVaultRequest): Promise<SuccessResponse> {
    const response = await fetch(`/chains/${String(chainId)}/vaults`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to add vault");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async removeVaultFromWhitelist(chainId: number, vaultAddress: string): Promise<SuccessResponse> {
    const response = await fetch(`/chains/${String(chainId)}/vaults/${vaultAddress}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to remove vault");
    }
    return response.json() as Promise<SuccessResponse>;
  },

  async updateVaultStatus(
    chainId: number,
    vaultAddress: string,
    data: UpdateVaultStatusRequest,
  ): Promise<SuccessResponse> {
    const response = await fetch(`/chains/${String(chainId)}/vaults/${vaultAddress}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.error ?? "Failed to update vault status");
    }
    return response.json() as Promise<SuccessResponse>;
  },
};
