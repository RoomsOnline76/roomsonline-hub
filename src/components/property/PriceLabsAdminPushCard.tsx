import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PriceLabsConfig {
  enabled?: boolean;
  last_push_at?: string;
  needs_repush?: boolean;
  credentials?: { integration_name?: string; integration_token?: string };
  [key: string]: unknown;
}

interface Props {
  propertyId: string;
  pricelabsAllowed: boolean;
  pricelabsSaved?: boolean;
  isRolosPms: boolean;
}

export function PriceLabsAdminPushCard({ propertyId, pricelabsAllowed, pricelabsSaved, isRolosPms }: Props) {
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const canManage = isAdmin || isDev || isFearlessLeader;
  const isSaved = pricelabsSaved ?? pricelabsAllowed;
  const qc = useQueryClient();

  const { data: property, isLoading } = useQuery({
    queryKey: ["pricelabs-property", propertyId],
    enabled: !!propertyId && pricelabsAllowed && isRolosPms && canManage,
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

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const next = { ...cfg, enabled };
      const { error } = await supabase
        .from("properties")
        .update({ pricelabs_config: next as any })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      qc.invalidateQueries({ queryKey: ["pricelabs-property", propertyId] });
      qc.invalidateQueries({ queryKey: ["property-billing-summary", propertyId] });
      toast.success(enabled ? "PriceLabs activated for this property" : "PriceLabs deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushProperty = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pricelabs-api", {
        body: { action: "sync_property_to_pricelabs", property_id: propertyId },
      });
      if (error) throw new Error((error as Error).message || "Edge function error");
      const d = (data ?? {}) as { success?: boolean; error?: unknown; listings_pushed?: number; reservations_pushed?: number };
      if (d.success === false || d.error) {
        throw new Error(String(d.error ?? "Request failed"));
      }
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

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">PriceLabs — Activation & Push</CardTitle>
          </div>
          {cfg.enabled ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="secondary">Not activated</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading PriceLabs state…
          </div>
        ) : (
          <>
            {!isSaved && (
              <Alert>
                <AlertTitle>Save billing config to enable</AlertTitle>
                <AlertDescription className="text-xs">
                  PriceLabs is toggled on but not yet saved. Click "Save Billing Config" above, then activate and push here.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Activate PriceLabs for this property</p>
                <p className="text-[11px] text-muted-foreground">
                  Turning this on begins billing for the PriceLabs add-on and unlocks push/pull. Mirrors the toggle in ROL'OS → Revenue.
                </p>
              </div>
              <Switch
                checked={!!cfg.enabled}
                disabled={setEnabled.isPending || !isSaved}
                onCheckedChange={(v) => setEnabled.mutate(v)}
              />
            </div>

            {cfg.enabled && (
              <>
                {cfg.needs_repush && (
                  <Alert>
                    <RefreshCw className="h-4 w-4" />
                    <AlertTitle>Re-push recommended</AlertTitle>
                    <AlertDescription className="text-xs">
                      Rates were changed since the last push. Re-push so PriceLabs sees the current rates before the next pull.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    {cfg.last_push_at
                      ? <>Last push: {format(new Date(cfg.last_push_at), "PPp")}</>
                      : <>Not yet pushed. Push to send listings & reservations to PriceLabs.</>}
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
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
