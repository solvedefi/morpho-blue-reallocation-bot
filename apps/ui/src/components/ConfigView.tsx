import { CheckCircle2, XCircle } from "lucide-react";

import type { ConfigResponse } from "../lib/api";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfigViewProps {
  config: ConfigResponse;
}

export function ConfigView({ config }: ConfigViewProps) {
  const { data } = config;

  return (
    <div className="space-y-6">
      {/* Strategy Settings */}
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Global Strategy
          </CardTitle>
          <CardDescription>Default settings for all markets and vaults</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <span className="text-sm font-medium">Idle Reallocation</span>
            <div className="flex items-center gap-2">
              {data.allowIdleReallocation ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <Badge
                    variant="default"
                    className="bg-green-500/10 text-green-500 border-green-500/20"
                  >
                    Enabled
                  </Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <Badge variant="destructive">Disabled</Badge>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground">Default Min APY</p>
              <p className="text-2xl font-bold font-mono">{data.defaultMinApy}%</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground">Default Max APY</p>
              <p className="text-2xl font-bold font-mono">{data.defaultMaxApy}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vault Ranges */}
      <Card className="border-blue-500/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Vault APY Ranges
          </CardTitle>
          <CardDescription>
            {Object.keys(data.vaultRanges).length === 0
              ? "No vault configurations"
              : `${Object.keys(data.vaultRanges).reduce((acc, chainId) => acc + Object.keys(data.vaultRanges[Number(chainId)] || {}).length, 0)} vaults configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(data.vaultRanges).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No vault configurations yet</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.vaultRanges).map(([chainId, vaults]) => (
                <div key={chainId} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      Chain {chainId}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(vaults).length} vault
                      {Object.keys(vaults).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(vaults).map(([address, range]) => (
                      <div
                        key={address}
                        className="group flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors border border-transparent hover:border-blue-500/20"
                      >
                        <span className="font-mono text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                          {address}
                        </span>
                        <div className="flex items-center gap-2 ml-4">
                          <Badge variant="secondary" className="font-mono">
                            {range.min}% - {range.max}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market Ranges */}
      <Card className="border-purple-500/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            Market APY Ranges
          </CardTitle>
          <CardDescription>
            {Object.keys(data.marketRanges).length === 0
              ? "No market configurations"
              : `${Object.keys(data.marketRanges).reduce((acc, chainId) => acc + Object.keys(data.marketRanges[Number(chainId)] || {}).length, 0)} markets configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(data.marketRanges).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No market configurations yet</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.marketRanges).map(([chainId, markets]) => (
                <div key={chainId} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      Chain {chainId}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(markets).length} market
                      {Object.keys(markets).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(markets).map(([marketId, range]) => (
                      <div
                        key={marketId}
                        className="group flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors border border-transparent hover:border-purple-500/20"
                      >
                        <span className="font-mono text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                          {marketId}
                        </span>
                        <div className="flex items-center gap-2 ml-4">
                          <Badge variant="secondary" className="font-mono">
                            {range.min}% - {range.max}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
