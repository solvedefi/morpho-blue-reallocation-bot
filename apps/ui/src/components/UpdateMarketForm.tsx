import { useState, useEffect } from 'react'
import type { UpdateMarketRequest } from '../lib/api'

interface UpdateMarketFormProps {
  onSubmit: (data: UpdateMarketRequest) => void
  isLoading: boolean
  error: Error | null
  success: boolean
}

export function UpdateMarketForm({ onSubmit, isLoading, error, success }: UpdateMarketFormProps) {
  const [formData, setFormData] = useState({
    chainId: '',
    marketId: '',
    minApy: '',
    maxApy: '',
  })

  useEffect(() => {
    if (success) {
      // Reset form on success
      const timer = setTimeout(() => {
        setFormData({ chainId: '', marketId: '', minApy: '', maxApy: '' })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      chainId: parseInt(formData.chainId),
      marketId: formData.marketId,
      minApy: parseFloat(formData.minApy),
      maxApy: parseFloat(formData.maxApy),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-white">Update Market APY Range</h2>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Chain ID
        </label>
        <input
          type="number"
          required
          value={formData.chainId}
          onChange={(e) => setFormData({ ...formData, chainId: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Market ID (0x...)
        </label>
        <input
          type="text"
          required
          value={formData.marketId}
          onChange={(e) => setFormData({ ...formData, marketId: e.target.value })}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="0x..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Min APY (%)
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={formData.minApy}
            onChange={(e) => setFormData({ ...formData, minApy: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="2.5"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Max APY (%)
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={formData.maxApy}
            onChange={(e) => setFormData({ ...formData, maxApy: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="8.0"
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
          ✓ Market range updated successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {isLoading ? 'Updating...' : 'Update Market Range'}
      </button>
    </form>
  )
}
