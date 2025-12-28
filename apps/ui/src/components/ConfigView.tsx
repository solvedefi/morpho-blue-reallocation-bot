import type { ConfigResponse } from '../lib/api'

interface ConfigViewProps {
  config: ConfigResponse
}

export function ConfigView({ config }: ConfigViewProps) {
  const { data } = config

  return (
    <div className="space-y-8">
      {/* Strategy Settings */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-white">Global Strategy</h2>
        <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Allow Idle Reallocation:</span>
            <span className={data.allowIdleReallocation ? 'text-green-400' : 'text-red-400'}>
              {data.allowIdleReallocation ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Default Min APY:</span>
            <span className="text-white font-mono">{data.defaultMinApy}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Default Max APY:</span>
            <span className="text-white font-mono">{data.defaultMaxApy}%</span>
          </div>
        </div>
      </section>

      {/* Vault Ranges */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-white">
          Vault APY Ranges
        </h2>
        {Object.keys(data.vaultRanges).length === 0 ? (
          <p className="text-slate-400 italic">No vault configurations</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(data.vaultRanges).map(([chainId, vaults]) => (
              <div key={chainId} className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-3 text-blue-400">
                  Chain ID: {chainId}
                </h3>
                <div className="space-y-2">
                  {Object.entries(vaults).map(([address, range]) => (
                    <div
                      key={address}
                      className="flex items-center justify-between bg-slate-800/50 rounded p-3"
                    >
                      <span className="font-mono text-sm text-slate-300 break-all">
                        {address}
                      </span>
                      <span className="ml-4 text-white font-semibold whitespace-nowrap">
                        {range.min}% - {range.max}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Market Ranges */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-white">
          Market APY Ranges
        </h2>
        {Object.keys(data.marketRanges).length === 0 ? (
          <p className="text-slate-400 italic">No market configurations</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(data.marketRanges).map(([chainId, markets]) => (
              <div key={chainId} className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-3 text-blue-400">
                  Chain ID: {chainId}
                </h3>
                <div className="space-y-2">
                  {Object.entries(markets).map(([marketId, range]) => (
                    <div
                      key={marketId}
                      className="flex items-center justify-between bg-slate-800/50 rounded p-3"
                    >
                      <span className="font-mono text-sm text-slate-300 break-all">
                        {marketId}
                      </span>
                      <span className="ml-4 text-white font-semibold whitespace-nowrap">
                        {range.min}% - {range.max}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
