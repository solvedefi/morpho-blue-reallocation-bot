import { CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { useState, useEffect } from "react";

import type { UpdateStrategyRequest, Configuration } from "../lib/api";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface UpdateStrategyFormProps {
  currentConfig?: Configuration;
  onSubmit: (data: UpdateStrategyRequest) => void;
  isLoading: boolean;
  error: Error | null;
  success: boolean;
}

export function UpdateStrategyForm({
  currentConfig,
  onSubmit,
  isLoading,
  error,
  success,
}: UpdateStrategyFormProps) {
  const [formData, setFormData] = useState({
    allowIdleReallocation: currentConfig?.allowIdleReallocation ?? true,
    defaultMinApy: currentConfig?.defaultMinApy.toString() ?? "",
    defaultMaxApy: currentConfig?.defaultMaxApy.toString() ?? "",
  });

  useEffect(() => {
    if (currentConfig) {
      setFormData({
        allowIdleReallocation: currentConfig.allowIdleReallocation,
        defaultMinApy: currentConfig.defaultMinApy.toString(),
        defaultMaxApy: currentConfig.defaultMaxApy.toString(),
      });
    }
  }, [currentConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      allowIdleReallocation: formData.allowIdleReallocation,
      defaultMinApy: parseFloat(formData.defaultMinApy),
      defaultMaxApy: parseFloat(formData.defaultMaxApy),
    });
  };

  return (
    <Card className="max-w-2xl border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Update Global Strategy
        </CardTitle>
        <CardDescription>
          Configure default settings applied to all markets and vaults
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="idle-reallocation" className="text-base">
                Allow Idle Reallocation
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable the bot to reallocate assets to idle markets
              </p>
            </div>
            <Switch
              id="idle-reallocation"
              checked={formData.allowIdleReallocation}
              onCheckedChange={(checked) => {
                setFormData({ ...formData, allowIdleReallocation: checked });
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultMinApy">Default Min APY (%)</Label>
              <Input
                id="defaultMinApy"
                type="number"
                step="0.1"
                required
                value={formData.defaultMinApy}
                onChange={(e) => {
                  setFormData({ ...formData, defaultMinApy: e.target.value });
                }}
                placeholder="0"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Minimum APY threshold</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultMaxApy">Default Max APY (%)</Label>
              <Input
                id="defaultMaxApy"
                type="number"
                step="0.1"
                required
                value={formData.defaultMaxApy}
                onChange={(e) => {
                  setFormData({ ...formData, defaultMaxApy: e.target.value });
                }}
                placeholder="10"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Maximum APY threshold</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Update failed</p>
                <p className="text-sm opacity-90 mt-1">{error.message}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-lg">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              <p className="font-medium">Strategy updated successfully!</p>
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="w-full" size="lg">
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Updating...
              </>
            ) : (
              "Update Strategy"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
