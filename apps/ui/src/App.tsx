import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Settings, TrendingUp } from "lucide-react";

import { ConfigView } from "./components/ConfigView";
import { UpdateMarketForm } from "./components/UpdateMarketForm";
import { UpdateStrategyForm } from "./components/UpdateStrategyForm";
import { UpdateVaultForm } from "./components/UpdateVaultForm";
import { api } from "./lib/api";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function App() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
    refetchInterval: 5000,
  });

  const updateMarketMutation = useMutation({
    mutationFn: api.updateMarketRange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const updateVaultMutation = useMutation({
    mutationFn: api.updateVaultRange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const updateStrategyMutation = useMutation({
    mutationFn: api.updateStrategy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Activity className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                RE7 Morpho reallocation bot
              </h1>
              <p className="text-muted-foreground mt-1">Manage APY ranges for vaults and markets</p>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <Tabs defaultValue="view" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 h-auto p-1">
            <TabsTrigger value="view" className="flex items-center gap-2 py-3">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">View Config</span>
            </TabsTrigger>
            <TabsTrigger value="market" className="flex items-center gap-2 py-3">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Market</span>
            </TabsTrigger>
            <TabsTrigger value="vault" className="flex items-center gap-2 py-3">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Vault</span>
            </TabsTrigger>
            <TabsTrigger value="strategy" className="flex items-center gap-2 py-3">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Strategy</span>
            </TabsTrigger>
          </TabsList>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
                <Activity className="h-6 w-6 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-muted-foreground text-lg">Loading configuration...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-6 py-4 rounded-lg backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                <span className="font-medium">Error loading configuration</span>
              </div>
              <p className="mt-2 text-sm opacity-90">{error.message}</p>
            </div>
          )}

          {/* Content */}
          {config && (
            <>
              <TabsContent value="view" className="space-y-6">
                <ConfigView config={config} />
              </TabsContent>

              <TabsContent value="market" className="space-y-6">
                <UpdateMarketForm
                  onSubmit={(data) => {
                    updateMarketMutation.mutate(data);
                  }}
                  isLoading={updateMarketMutation.isPending}
                  error={updateMarketMutation.error}
                  success={updateMarketMutation.isSuccess}
                />
              </TabsContent>

              <TabsContent value="vault" className="space-y-6">
                <UpdateVaultForm
                  onSubmit={(data) => {
                    updateVaultMutation.mutate(data);
                  }}
                  isLoading={updateVaultMutation.isPending}
                  error={updateVaultMutation.error}
                  success={updateVaultMutation.isSuccess}
                />
              </TabsContent>

              <TabsContent value="strategy" className="space-y-6">
                <UpdateStrategyForm
                  currentConfig={config.data}
                  onSubmit={(data) => {
                    updateStrategyMutation.mutate(data);
                  }}
                  isLoading={updateStrategyMutation.isPending}
                  error={updateStrategyMutation.error}
                  success={updateStrategyMutation.isSuccess}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export default App;
