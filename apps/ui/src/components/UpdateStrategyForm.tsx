import { useState, useEffect } from 'react'
import type { UpdateStrategyRequest, Configuration } from '../lib/api'

interface UpdateStrategyFormProps {
  currentConfig?: Configuration
  onSubmit: (data: UpdateStrategyRequest) => void
  isLoading: boolean
  error: Error | null
  success: boolean
}

export function UpdateStrategyForm({ currentConfig, onSubmit, isLoading, error, success }: UpdateStrategyFormProps) {
  const [formData, setFormData] = useState({
    allowIdleReallocation: currentConfig?.allowIdleReallocation ?? true,
    defaultMinApy: currentConfig?.defaultMinApy?.toString() ?? '',
    defaultMaxApy: currentConfig?.defaultMaxApy?.toString() ?? '',
  })

  useEffect(() => {
    if (currentConfig) {
      setFormData({
        allowIdleReallocation: currentConfig.allowIdleReallocation,
        defaultMinApy: currentConfig.defaultMinApy.toString(),
        defaultMaxApy: currentConfig.defaultMaxApy.toString(),
      })
    }
  }, [currentConfig])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      allowIdleReallocation: formData.allowIdleReallocation,
      defaultMinApy: parseFloat(formData.defaultMinApy),
      defaultMaxApy: parseFloat(formData.defaultMaxApy),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-white">Update Global Strategy</h2>

      <div className="bg-slate-700/50 rounded-lg p-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.allowIdleReallocation}
            onChange={(e) => setFormData({ ...formData, allowIdleReallocation: e.target.checked })}
            className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
          />
          <span className="ml-3 text-slate-300">
            Allow Idle Reallocation
          </span>
        </label>
        <p className="mt-2 text-sm text-slate-400 ml-8">
          When enabled, the bot can reallocate assets to idle markets
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Default Min APY (%)
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={formData.defaultMinApy}
            onChange={(e) => setFormData({ ...formData, defaultMinApy: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Default Max APY (%)
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={formData.defaultMaxApy}
            onChange={(e) => setFormData({ ...formData, defaultMaxApy: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="10"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
          {error.message}
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-500 text-green-400 px-4 py-3 rounded-lg">
          ✓ Strategy updated successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {isLoading ? 'Updating...' : 'Update Strategy'}
      </button>
    </form>
  )
}
