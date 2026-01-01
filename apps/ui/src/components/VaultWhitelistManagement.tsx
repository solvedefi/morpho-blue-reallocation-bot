import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Trash2, Plus, Loader2, Wallet } from "lucide-react";
import { useState } from "react";

import type { ChainConfig } from "../lib/api";
import { api } from "../lib/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  80094: "Bera",
  480: "Worldchain",
  98866: "Plume",
  130: "Unichain",
  1868: "Soneium",
  42161: "Arbitrum",
  239: "Neon",
  747474: "Form",
  137: "Polygon",
  1135: "Lisk",
};

export function VaultWhitelistManagement() {
  const queryClient = useQueryClient();
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [newVaultAddress, setNewVaultAddress] = useState("");

  const {
    data: chainsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chains"],
    queryFn: api.getChains,
    refetchInterval: 5000,
  });

  const addVaultMutation = useMutation({
    mutationFn: ({ chainId, vaultAddress }: { chainId: number; vaultAddress: string }) =>
      api.addVaultToWhitelist(chainId, { vaultAddress }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
      setNewVaultAddress("");
      setSelectedChainId(null);
    },
  });

  const removeVaultMutation = useMutation({
    mutationFn: ({ chainId, vaultAddress }: { chainId: number; vaultAddress: string }) =>
      api.removeVaultFromWhitelist(chainId, vaultAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
    },
  });

  const updateVaultStatusMutation = useMutation({
    mutationFn: ({
      chainId,
      vaultAddress,
      enabled,
    }: {
      chainId: number;
      vaultAddress: string;
      enabled: boolean;
    }) => api.updateVaultStatus(chainId, vaultAddress, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
    },
  });

  const handleAddVault = () => {
    if (selectedChainId && newVaultAddress) {
      addVaultMutation.mutate({
        chainId: selectedChainId,
        vaultAddress: newVaultAddress,
      });
    }
  };

  const handleToggleVault = (chainId: number, vaultAddress: string, currentEnabled: boolean) => {
    updateVaultStatusMutation.mutate({
      chainId,
      vaultAddress,
      enabled: !currentEnabled,
    });
  };

  const handleRemoveVault = (chainId: number, vaultAddress: string) => {
    if (confirm(`Are you sure you want to remove vault ${vaultAddress}?`)) {
      removeVaultMutation.mutate({ chainId, vaultAddress });
    }
  };

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
      {/* Add Vault Form */}
      <Card className="border-green-500/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-green-500" />
            Add Vault to Whitelist
          </CardTitle>
          <CardDescription>Add a new vault to monitor on a specific chain</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chain-select">Chain</Label>
              <select
                id="chain-select"
                value={selectedChainId || ""}
                onChange={(e) => setSelectedChainId(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a chain...</option>
                {chains.map((chain: ChainConfig) => (
                  <option key={chain.chainId} value={chain.chainId}>
                    {CHAIN_NAMES[chain.chainId] || `Chain ${chain.chainId}`} (ID: {chain.chainId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vault-address">Vault Address</Label>
              <Input
                id="vault-address"
                placeholder="0x..."
                value={newVaultAddress}
                onChange={(e) => setNewVaultAddress(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={handleAddVault}
            disabled={!selectedChainId || !newVaultAddress || addVaultMutation.isPending}
            className="w-full"
          >
            {addVaultMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding Vault...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Vault
              </>
            )}
          </Button>

          {addVaultMutation.isError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
              <p className="text-sm">{addVaultMutation.error.message}</p>
            </div>
          )}

          {addVaultMutation.isSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-lg">
              <p className="text-sm">Vault added successfully!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vault List */}
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Vault Whitelist
          </CardTitle>
          <CardDescription>
            Manage vaults across {chains.length} chains •{" "}
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
                      key={vault.vaultAddress}
                      className="group flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors border border-transparent hover:border-primary/20"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {vault.enabled ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        <span className="font-mono text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate">
                          {vault.vaultAddress}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={vault.enabled}
                          onCheckedChange={() =>
                            handleToggleVault(chain.chainId, vault.vaultAddress, vault.enabled)
                          }
                          disabled={updateVaultStatusMutation.isPending}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveVault(chain.chainId, vault.vaultAddress)}
                          disabled={removeVaultMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {(removeVaultMutation.isError || updateVaultStatusMutation.isError) && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
          <p className="text-sm">
            {removeVaultMutation.error?.message || updateVaultStatusMutation.error?.message}
          </p>
        </div>
      )}

      {(removeVaultMutation.isSuccess || updateVaultStatusMutation.isSuccess) && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-lg">
          <p className="text-sm">Vault updated successfully!</p>
        </div>
      )}
    </div>
  );
}
