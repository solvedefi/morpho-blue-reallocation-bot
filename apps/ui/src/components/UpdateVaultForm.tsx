import { CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";

import type { UpdateVaultRequest } from "../lib/api";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UpdateVaultFormProps {
  onSubmit: (data: UpdateVaultRequest) => void;
  isLoading: boolean;
  error: Error | null;
  success: boolean;
}

export function UpdateVaultForm({ onSubmit, isLoading, error, success }: UpdateVaultFormProps) {
  const [formData, setFormData] = useState({
    chainId: "",
    vaultAddress: "",
    minApy: "",
    maxApy: "",
  });

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setFormData({ chainId: "", vaultAddress: "", minApy: "", maxApy: "" });
      }, 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [success]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      chainId: parseInt(formData.chainId),
      vaultAddress: formData.vaultAddress,
      minApy: parseFloat(formData.minApy),
      maxApy: parseFloat(formData.maxApy),
    });
  };

  return (
    <Card className="max-w-2xl border-blue-500/20 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-500" />
          Update Vault APY Range
        </CardTitle>
        <CardDescription>Configure APY range for a specific vault</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="chainId">Chain ID</Label>
            <Input
              id="chainId"
              type="number"
              required
              value={formData.chainId}
              onChange={(e) => {
                setFormData({ ...formData, chainId: e.target.value });
              }}
              placeholder="1"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              e.g., 1 (Ethereum), 8453 (Base), 42161 (Arbitrum)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vaultAddress">Vault Address</Label>
            <Input
              id="vaultAddress"
              type="text"
              required
              value={formData.vaultAddress}
              onChange={(e) => {
                setFormData({ ...formData, vaultAddress: e.target.value });
              }}
              placeholder="0x..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              42-character hex string starting with 0x
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minApy">Min APY (%)</Label>
              <Input
                id="minApy"
                type="number"
                step="0.1"
                required
                value={formData.minApy}
                onChange={(e) => {
                  setFormData({ ...formData, minApy: e.target.value });
                }}
                placeholder="2.5"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxApy">Max APY (%)</Label>
              <Input
                id="maxApy"
                type="number"
                step="0.1"
                required
                value={formData.maxApy}
                onChange={(e) => {
                  setFormData({ ...formData, maxApy: e.target.value });
                }}
                placeholder="8.0"
                className="font-mono"
              />
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
              <p className="font-medium">Vault range updated successfully!</p>
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="w-full" size="lg">
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Updating...
              </>
            ) : (
              "Update Vault Range"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
