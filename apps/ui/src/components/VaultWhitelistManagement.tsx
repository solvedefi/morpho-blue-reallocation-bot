import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";

import type { ChainConfig } from "../lib/api";
import { api } from "../lib/api";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  80094: "Bera",
  480: "Worldchain",
  98866: "Plume",
  130: "Unichain",
  1868: "Soneium",
  42161: "Arbitrum",
  239: "TAC",
  747474: "Katana",
  137: "Polygon",
  1135: "Lisk",
};

export function VaultWhitelistManagement() {
  const {
    data: chainsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chains"],
    queryFn: api.getChains,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
          <Wallet className="h-6 w-6 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground text-lg">Loading vaults...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive px-6 py-4 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="font-medium">Error loading vaults</span>
        </div>
        <p className="mt-2 text-sm opacity-90">{error.message}</p>
      </div>
    );
  }

  const chains = chainsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Vault List */}
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Vault Whitelist
          </CardTitle>
          <CardDescription>
            Synced from vaults-source-of-truth/vaults.csv on startup • {chains.length} chains •{" "}
            {chains.reduce(
              (acc: number, chain: ChainConfig) => acc + chain.vaultWhitelist.length,
              0,
            )}{" "}
            total vaults
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {chains.map((chain: ChainConfig) => (
            <div key={chain.chainId} className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Badge variant="outline" className="font-mono">
                  {CHAIN_NAMES[chain.chainId] || `Chain ${chain.chainId}`}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {chain.vaultWhitelist.length} vault{chain.vaultWhitelist.length !== 1 ? "s" : ""}
                </span>
              </div>

              {chain.vaultWhitelist.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No vaults configured
                </p>
              ) : (
                <div className="space-y-2">
                  {chain.vaultWhitelist.map((vault) => (
                    <div
                      key={vault.address}
                      className="group flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors border border-transparent hover:border-primary/20"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <Wallet className="h-4 w-4 text-primary flex-shrink-0" />
                          {vault.name && (
                            <span className="font-medium text-sm text-foreground">
                              {vault.name}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors truncate pl-7">
                          {vault.address}
                        </span>
                      </div>

                      <Badge variant={vault.type === "morpho-v1" ? "default" : "secondary"}>
                        {vault.type === "morpho-v1" ? "V1" : "V2 (not reallocated)"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
