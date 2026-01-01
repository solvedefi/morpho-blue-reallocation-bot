export interface ApyRangeConfig {
  min: number;
  max: number;
}

export interface Configuration {
  vaultRanges: Record<number, Record<string, ApyRangeConfig>>;
  marketRanges: Record<number, Record<string, ApyRangeConfig>>;
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

export interface VaultWhitelist {
  vaultAddress: string;
  enabled: boolean;
}

export interface ChainConfig {
  chainId: number;
  executionInterval: number;
  enabled: boolean;
  vaultWhitelist: VaultWhitelist[];
}

export interface ChainsResponse {
  success: boolean;
  data: ChainConfig[];
}

export interface UpdateChainRequest {
  enabled?: boolean;
  executionInterval?: number;
}

export interface AddVaultRequest {
  vaultAddress: string;
}

export interface UpdateVaultRequest {
  enabled: boolean;
}

export const api = {
  async getConfig(): Promise<ConfigResponse> {
    const response = await fetch("/config");
    if (!response.ok) {
      throw new Error("Failed to fetch configuration");
    }
    return response.json();
  },

  async updateMarketRange(data: UpdateMarketRequest) {
    const response = await fetch("/config/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update market range");
    }
    return response.json();
  },

  async updateVaultRange(data: UpdateVaultRequest) {
    const response = await fetch("/config/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update vault range");
    }
    return response.json();
  },

  async updateStrategy(data: UpdateStrategyRequest) {
    const response = await fetch("/config/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update strategy");
    }
    return response.json();
  },

  async getChains(): Promise<ChainsResponse> {
    const response = await fetch("/chains");
    if (!response.ok) {
      throw new Error("Failed to fetch chains");
    }
    return response.json();
  },

  async updateChain(chainId: number, data: UpdateChainRequest) {
    const response = await fetch(`/chains/${chainId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update chain");
    }
    return response.json();
  },

  async addVaultToWhitelist(chainId: number, data: AddVaultRequest) {
    const response = await fetch(`/chains/${chainId}/vaults`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to add vault");
    }
    return response.json();
  },

  async removeVaultFromWhitelist(chainId: number, vaultAddress: string) {
    const response = await fetch(`/chains/${chainId}/vaults/${vaultAddress}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to remove vault");
    }
    return response.json();
  },

  async updateVaultStatus(chainId: number, vaultAddress: string, data: UpdateVaultRequest) {
    const response = await fetch(`/chains/${chainId}/vaults/${vaultAddress}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update vault status");
    }
    return response.json();
  },
};
