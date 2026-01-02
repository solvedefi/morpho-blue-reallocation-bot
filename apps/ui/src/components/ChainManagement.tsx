import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Settings, Loader2 } from "lucide-react";
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

export function ChainManagement() {
  const queryClient = useQueryClient();
  const [editingChain, setEditingChain] = useState<number | null>(null);
  const [intervalValue, setIntervalValue] = useState<number>(300);

  const {
    data: chainsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chains"],
    queryFn: api.getChains,
    refetchInterval: 5000,
  });

  const updateChainMutation = useMutation({
    mutationFn: ({
      chainId,
      data,
    }: {
      chainId: number;
      data: { enabled?: boolean; executionInterval?: number };
    }) => api.updateChain(chainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
      setEditingChain(null);
    },
  });

  const handleToggleEnabled = (chainId: number, currentEnabled: boolean) => {
    updateChainMutation.mutate({
      chainId,
      data: { enabled: !currentEnabled },
    });
  };

  const handleUpdateInterval = (chainId: number) => {
    if (intervalValue > 0) {
      updateChainMutation.mutate({
        chainId,
        data: { executionInterval: intervalValue },
      });
    }
  };

  const startEditing = (chainId: number, currentInterval: number) => {
    setEditingChain(chainId);
    setIntervalValue(currentInterval);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
          <Settings className="h-6 w-6 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground text-lg">Loading chains...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive px-6 py-4 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="font-medium">Error loading chains</span>
        </div>
        <p className="mt-2 text-sm opacity-90">{error.message}</p>
      </div>
    );
  }

  const chains = chainsData?.data || [];

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Chain Configuration
          </CardTitle>
          <CardDescription>
            Manage chain execution and vault monitoring across {chains.length} chains
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {chains.map((chain: ChainConfig) => (
            <div
              key={chain.chainId}
              className="group p-6 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors border border-transparent hover:border-primary/20 space-y-4"
            >
              {/* Chain Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-base px-3 py-1">
                      {CHAIN_NAMES[chain.chainId] || `Chain ${chain.chainId}`}
                    </Badge>
                    <Badge variant="secondary" className="font-mono">
                      ID: {chain.chainId}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {chain.enabled ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <Badge
                          variant="default"
                          className="bg-green-500/10 text-green-500 border-green-500/20"
                        >
                          Active
                        </Badge>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        <Badge
                          variant="destructive"
                          className="bg-red-500/10 text-red-500 border-red-500/20"
                        >
                          Inactive
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    {chain.vaultWhitelist.length} vault
                    {chain.vaultWhitelist.length !== 1 ? "s" : ""}
                  </div>
                  <Switch
                    checked={chain.enabled}
                    onCheckedChange={() => handleToggleEnabled(chain.chainId, chain.enabled)}
                    disabled={updateChainMutation.isPending}
                  />
                </div>
              </div>

              {/* Execution Interval */}
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`interval-${chain.chainId}`} className="text-sm">
                    Execution Interval (seconds)
                  </Label>
                  {editingChain === chain.chainId ? (
                    <div className="flex items-center gap-2">
                      <Input
                        id={`interval-${chain.chainId}`}
                        type="number"
                        min="1"
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdateInterval(chain.chainId)}
                        disabled={updateChainMutation.isPending}
                      >
                        {updateChainMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingChain(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="px-4 py-2 rounded-md bg-background border font-mono text-sm">
                        {chain.executionInterval}s
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditing(chain.chainId, chain.executionInterval)}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Vaults Summary */}
              {chain.vaultWhitelist.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Configured Vaults:</p>
                  <div className="flex flex-wrap gap-2">
                    {chain.vaultWhitelist.slice(0, 3).map((vaultAddress) => (
                      <Badge
                        key={vaultAddress}
                        variant="default"
                        className="font-mono text-xs"
                      >
                        {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
                      </Badge>
                    ))}
                    {chain.vaultWhitelist.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{chain.vaultWhitelist.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {updateChainMutation.isError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
          <p className="text-sm">{updateChainMutation.error.message}</p>
        </div>
      )}

      {updateChainMutation.isSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-lg">
          <p className="text-sm">Chain configuration updated successfully!</p>
        </div>
      )}
    </div>
  );
}
