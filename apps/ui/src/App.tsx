import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfigView } from './components/ConfigView'
import { UpdateMarketForm } from './components/UpdateMarketForm'
import { UpdateVaultForm } from './components/UpdateVaultForm'
import { UpdateStrategyForm } from './components/UpdateStrategyForm'
import { api } from './lib/api'

function App() {
  const [activeTab, setActiveTab] = useState<'view' | 'market' | 'vault' | 'strategy'>('view')
  const queryClient = useQueryClient()

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['config'],
    queryFn: api.getConfig,
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const updateMarketMutation = useMutation({
    mutationFn: api.updateMarketRange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })

  const updateVaultMutation = useMutation({
    mutationFn: api.updateVaultRange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })

  const updateStrategyMutation = useMutation({
    mutationFn: api.updateStrategy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Morpho Blue Reallocation Bot
          </h1>
          <p className="text-slate-400">
            Manage APY ranges for vaults and markets
          </p>
        </header>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-700">
          <nav className="flex space-x-8">
            {[
              { id: 'view' as const, label: 'View Config' },
              { id: 'market' as const, label: 'Update Market' },
              { id: 'vault' as const, label: 'Update Vault' },
              { id: 'strategy' as const, label: 'Update Strategy' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="bg-slate-800 rounded-lg shadow-xl p-6">
          {isLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-slate-400">Loading configuration...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded">
              Error loading configuration: {error.message}
            </div>
          )}

          {config && activeTab === 'view' && <ConfigView config={config} />}

          {activeTab === 'market' && (
            <UpdateMarketForm
              onSubmit={(data) => updateMarketMutation.mutate(data)}
              isLoading={updateMarketMutation.isPending}
              error={updateMarketMutation.error}
              success={updateMarketMutation.isSuccess}
            />
          )}

          {activeTab === 'vault' && (
            <UpdateVaultForm
              onSubmit={(data) => updateVaultMutation.mutate(data)}
              isLoading={updateVaultMutation.isPending}
              error={updateVaultMutation.error}
              success={updateVaultMutation.isSuccess}
            />
          )}

          {activeTab === 'strategy' && (
            <UpdateStrategyForm
              currentConfig={config?.data}
              onSubmit={(data) => updateStrategyMutation.mutate(data)}
              isLoading={updateStrategyMutation.isPending}
              error={updateStrategyMutation.error}
              success={updateStrategyMutation.isSuccess}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
