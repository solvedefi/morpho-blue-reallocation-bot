export interface ApyRangeConfig {
  min: number
  max: number
}

export interface Configuration {
  vaultRanges: Record<number, Record<string, ApyRangeConfig>>
  marketRanges: Record<number, Record<string, ApyRangeConfig>>
  allowIdleReallocation: boolean
  defaultMinApy: number
  defaultMaxApy: number
}

export interface ConfigResponse {
  success: boolean
  data: Configuration
}

export interface UpdateMarketRequest {
  chainId: number
  marketId: string
  minApy: number
  maxApy: number
}

export interface UpdateVaultRequest {
  chainId: number
  vaultAddress: string
  minApy: number
  maxApy: number
}

export interface UpdateStrategyRequest {
  allowIdleReallocation?: boolean
  defaultMinApy?: number
  defaultMaxApy?: number
}

export const api = {
  async getConfig(): Promise<ConfigResponse> {
    const response = await fetch('/config')
    if (!response.ok) {
      throw new Error('Failed to fetch configuration')
    }
    return response.json()
  },

  async updateMarketRange(data: UpdateMarketRequest) {
    const response = await fetch('/config/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update market range')
    }
    return response.json()
  },

  async updateVaultRange(data: UpdateVaultRequest) {
    const response = await fetch('/config/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update vault range')
    }
    return response.json()
  },

  async updateStrategy(data: UpdateStrategyRequest) {
    const response = await fetch('/config/strategy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update strategy')
    }
    return response.json()
  },
}
