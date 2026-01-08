import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";

import { erc20Abi } from "../../abis/ERC20";
import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { morphoBlueAbi } from "../../abis/MorphoBlue";
import { chainConfigs } from "../config";

export interface VaultMetadata {
  name: string | null;
}

export interface MarketMetadata {
  collateralSymbol: string | null;
  loanSymbol: string | null;
}

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * Service for fetching metadata from blockchain contracts
 */
export class MetadataService {
  private clients = new Map<number, PublicClient>();

  /**
   * Get or create a public client for a chain
   */
  private getClient(chainId: number): PublicClient | null {
    if (this.clients.has(chainId)) {
      return this.clients.get(chainId);
    }

    const chainConfig = chainConfigs[chainId];
    if (!chainConfig) {
      console.warn(`No chain config found for chainId ${String(chainId)}`);
      return null;
    }

    // Try to get RPC URL from environment first, then fallback to chain config
    const envRpcUrl = process.env[`RPC_URL_${String(chainId)}`];
    const defaultRpcUrl = chainConfig.chain.rpcUrls.default.http[0];
    const rpcUrl = envRpcUrl ?? defaultRpcUrl;

    if (!rpcUrl) {
      console.warn(`No RPC URL found for chainId ${String(chainId)}`);
      return null;
    }

    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(rpcUrl, {
        timeout: 30_000,
        retryCount: 2,
        retryDelay: 1000,
      }),
    });

    this.clients.set(chainId, client);
    return client;
  }

  /**
   * Fetch vault name from MetaMorpho contract
   */
  async fetchVaultName(chainId: number, vaultAddress: Address): Promise<VaultMetadata> {
    const client = this.getClient(chainId);
    if (!client) {
      return { name: null };
    }

    try {
      const name = await client.readContract({
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "name",
      });
      return { name: name };
    } catch (error) {
      console.warn(`Failed to fetch vault name for ${vaultAddress} on chain ${chainId}:`, error);
      return { name: null };
    }
  }

  /**
   * Fetch market params from Morpho Blue contract
   */
  async fetchMarketParams(chainId: number, marketId: Hex): Promise<MarketParams | null> {
    const client = this.getClient(chainId);
    if (!client) {
      return null;
    }

    const chainConfig = chainConfigs[chainId];
    if (!chainConfig) {
      return null;
    }

    try {
      const result = await client.readContract({
        address: chainConfig.morpho,
        abi: morphoBlueAbi,
        functionName: "idToMarketParams",
        args: [marketId],
      });

      // Result is a tuple: [loanToken, collateralToken, oracle, irm, lltv]
      const [loanToken, collateralToken, oracle, irm, lltv] = result as [
        Address,
        Address,
        Address,
        Address,
        bigint,
      ];

      return {
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      };
    } catch (error) {
      console.warn(`Failed to fetch market params for ${marketId} on chain ${chainId}:`, error);
      return null;
    }
  }

  /**
   * Fetch token symbol from ERC20 contract
   */
  async fetchTokenSymbol(chainId: number, tokenAddress: Address): Promise<string | null> {
    // Skip zero address (used for idle markets)
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    const client = this.getClient(chainId);
    if (!client) {
      return null;
    }

    try {
      const symbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      });
      return symbol;
    } catch (error) {
      console.warn(`Failed to fetch token symbol for ${tokenAddress} on chain ${chainId}:`, error);
      return null;
    }
  }

  /**
   * Fetch market metadata (collateral and loan token symbols)
   */
  async fetchMarketMetadata(chainId: number, marketId: Hex): Promise<MarketMetadata> {
    const marketParams = await this.fetchMarketParams(chainId, marketId);
    if (!marketParams) {
      return { collateralSymbol: null, loanSymbol: null };
    }

    // Fetch both symbols in parallel
    const [collateralSymbol, loanSymbol] = await Promise.all([
      this.fetchTokenSymbol(chainId, marketParams.collateralToken),
      this.fetchTokenSymbol(chainId, marketParams.loanToken),
    ]);

    return {
      collateralSymbol,
      loanSymbol,
    };
  }
}
