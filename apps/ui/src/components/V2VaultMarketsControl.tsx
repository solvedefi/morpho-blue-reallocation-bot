import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/**
 * Per-V2-vault control: lists the current curated markets and offers an
 * "Add market" form. The POST endpoint validates `vault.absoluteCap(...)`
 * server-side before persisting, so the form only needs to surface the
 * server's error message — no client-side cap math.
 */
export function V2VaultMarketsControl({
  chainId,
  vaultAddress,
}: {
  chainId: number;
  vaultAddress: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [marketIdInput, setMarketIdInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["v2-markets", chainId],
    queryFn: () => api.getV2Markets(chainId),
    enabled: expanded,
  });

  const addMutation = useMutation({
    mutationFn: () => api.addV2Market(chainId, { vaultAddress, marketId: marketIdInput }),
    onSuccess: () => {
      setMarketIdInput("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["v2-markets", chainId] });
      void queryClient.invalidateQueries({ queryKey: ["chains"] });
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const vaultEntry = data?.data.find(
    (v) => v.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
  );
  const marketCount = vaultEntry?.marketIds.length ?? 0;

  const isValidMarketId = /^0x[0-9a-fA-F]{64}$/.test(marketIdInput);

  return (
    <div className="ml-6 mt-1">
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
        }}
        className="text-[10px] text-muted-foreground hover:text-foreground"
      >
        {expanded ? "▾" : "▸"}{" "}
        {expanded && !isLoading ? `${String(marketCount)} market(s)` : "markets"}
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-1">
          {isLoading && <p className="text-[10px] text-muted-foreground">Loading...</p>}
          {vaultEntry && vaultEntry.marketIds.length > 0 && (
            <ul className="font-mono text-[10px] text-muted-foreground space-y-0.5">
              {vaultEntry.marketIds.map((id) => (
                <li key={id} className="truncate">
                  {id}
                </li>
              ))}
            </ul>
          )}
          {vaultEntry && vaultEntry.marketIds.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">No markets configured</p>
          )}
          <div className="flex items-center gap-1 pt-1">
            <Input
              type="text"
              placeholder="0x… marketId (32-byte hex)"
              value={marketIdInput}
              onChange={(e) => {
                setMarketIdInput(e.target.value);
                setFormError(null);
              }}
              className="h-6 text-[10px] font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              disabled={!isValidMarketId || addMutation.isPending}
              onClick={() => {
                addMutation.mutate();
              }}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3 w-3" /> Add
                </>
              )}
            </Button>
          </div>
          {formError && <p className="text-[10px] text-destructive break-words">{formError}</p>}
        </div>
      )}
    </div>
  );
}
