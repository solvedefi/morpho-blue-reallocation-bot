import { Result, err, ok } from "neverthrow";
import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";

import { erc20Abi } from "../../abis/ERC20";
import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { morphoBlueAbi } from "../../abis/MorphoBlue";
import { chainConfigs } from "../config";

export interface MarketMetadata {
  collateralSymbol: string;
  loanSymbol: string;
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
    const existingClient = this.clients.get(chainId);
    if (existingClient) {
      return existingClient;
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
  async fetchVaultName(chainId: number, vaultAddress: Address): Promise<Result<string, Error>> {
    const client = this.getClient(chainId);
    if (!client) {
      return err(new Error(`No client available for chainId ${String(chainId)}`));
    }

    try {
      const name = await client.readContract({
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "name",
      });
      return ok(name);
    } catch (error) {
      return err(
        new Error(
          `Failed to fetch vault name for ${vaultAddress} on chain ${String(chainId)}: ${String(error)}`,
        ),
      );
    }
  }

  /**
   * Fetch market params from Morpho Blue contract
   */
  async fetchMarketParams(chainId: number, marketId: Hex): Promise<Result<MarketParams, Error>> {
    const client = this.getClient(chainId);
    if (!client) {
      return err(new Error(`No client available for chainId ${String(chainId)}`));
    }

    const chainConfig = chainConfigs[chainId];
    if (!chainConfig) {
      return err(new Error(`No chain config found for chainId ${String(chainId)}`));
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

      return ok({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      });
    } catch (error) {
      return err(
        new Error(
          `Failed to fetch market params for ${marketId} on chain ${String(chainId)}: ${String(error)}`,
        ),
      );
    }
  }

  /**
   * Fetch token symbol from ERC20 contract
   */
  async fetchTokenSymbol(chainId: number, tokenAddress: Address): Promise<Result<string, Error>> {
    // Skip zero address (used for idle markets)
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return err(new Error("Cannot fetch symbol for zero address (idle market)"));
    }

    const client = this.getClient(chainId);
    if (!client) {
      return err(new Error(`No client available for chainId ${String(chainId)}`));
    }

    try {
      const symbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      });
      return ok(symbol);
    } catch (error) {
      return err(
        new Error(
          `Failed to fetch token symbol for ${tokenAddress} on chain ${String(chainId)}: ${String(error)}`,
        ),
      );
    }
  }

  /**
   * Fetch market metadata (collateral and loan token symbols)
   */
  async fetchMarketMetadata(
    chainId: number,
    marketId: Hex,
  ): Promise<Result<MarketMetadata, Error>> {
    const marketParamsResult = await this.fetchMarketParams(chainId, marketId);
    if (marketParamsResult.isErr()) {
      return err(marketParamsResult.error);
    }

    const marketParams = marketParamsResult.value;

    // Fetch both symbols in parallel
    const [collateralSymbolResult, loanSymbolResult] = await Promise.all([
      this.fetchTokenSymbol(chainId, marketParams.collateralToken),
      this.fetchTokenSymbol(chainId, marketParams.loanToken),
    ]);

    if (collateralSymbolResult.isErr()) {
      return err(collateralSymbolResult.error);
    }

    if (loanSymbolResult.isErr()) {
      return err(loanSymbolResult.error);
    }

    return ok({
      collateralSymbol: collateralSymbolResult.value,
      loanSymbol: loanSymbolResult.value,
    });
  }
}
