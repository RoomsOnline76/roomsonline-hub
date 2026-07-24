import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PriceLabsConfig {
  enabled?: boolean;
  last_push_at?: string;
  needs_repush?: boolean;
  [key: string]: unknown;
}

interface Props {
  propertyId: string;
  pricelabsAllowed: boolean;
  pricelabsSaved?: boolean;
  isRolosPms: boolean;
}

/**
 * Compact inline push-only control for admins. Rendered inside the PriceLabs
 * billing frame. Activation is handled by the client from ROL'OS → Revenue.
 */
export function PriceLabsAdminPushCard({ propertyId, pricelabsAllowed, pricelabsSaved, isRolosPms }: Props) {
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const canManage = isAdmin || isDev || isFearlessLeader;
  const isSaved = pricelabsSaved ?? pricelabsAllowed;
  const qc = useQueryClient();

  const { data: property, isLoading } = useQuery({
    queryKey: ["pricelabs-property", propertyId],
    enabled: !!propertyId && pricelabsAllowed && isRolosPms && canManage && isSaved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, pricelabs_config")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const cfg = useMemo<PriceLabsConfig>(
    () => ((property?.pricelabs_config ?? {}) as PriceLabsConfig),
    [property?.pricelabs_config],
  );

  const pushProperty = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pricelabs-api", {
        body: { action: "sync_property_to_pricelabs", property_id: propertyId },
      });
      if (error) throw new Error((error as Error).message || "Edge function error");
      const d = (data ?? {}) as { success?: boolean; error?: unknown; listings_pushed?: number; reservations_pushed?: number };
      if (d.success === false || d.error) throw new Error(String(d.error ?? "Request failed"));
      return d;
    },
    onSuccess: async (d) => {
      const next = { ...cfg, last_push_at: new Date().toISOString(), needs_repush: false };
      await supabase.from("properties").update({ pricelabs_config: next as any }).eq("id", propertyId);
      qc.invalidateQueries({ queryKey: ["pricelabs-property", propertyId] });
      toast.success(`Pushed ${d?.listings_pushed ?? 0} listings, ${d?.reservations_pushed ?? 0} reservations to PriceLabs.`);
    },
    onError: (e: Error) => toast.error(`Push failed: ${e.message}`),
  });

  if (!canManage || !isRolosPms || !pricelabsAllowed) return null;

  if (!isSaved) {
    return (
      <Alert>
        <AlertTitle className="text-xs">Save billing config to enable push</AlertTitle>
        <AlertDescription className="text-[11px]">
          PriceLabs is toggled on but not yet saved. Click "Save Billing Config" below, then push from here.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {cfg.needs_repush && (
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertTitle className="text-xs">Re-push recommended</AlertTitle>
          <AlertDescription className="text-[11px]">
            Rates were changed since the last push. Re-push so PriceLabs sees current rates before the next pull.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          {isLoading ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span>
          ) : cfg.last_push_at ? (
            <>Last push: {format(new Date(cfg.last_push_at), "PPp")}</>
          ) : (
            <>Not yet pushed. Push to send listings &amp; reservations to PriceLabs.</>
          )}
        </div>
        <Button
          size="sm"
          variant={cfg.needs_repush || !cfg.last_push_at ? "default" : "outline"}
          onClick={() => pushProperty.mutate()}
          disabled={pushProperty.isPending}
        >
          {pushProperty.isPending
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <Upload className="h-3.5 w-3.5 mr-1.5" />}
          {cfg.last_push_at ? "Re-push to PriceLabs" : "Push to PriceLabs"}
        </Button>
      </div>
    </div>
  );
}
