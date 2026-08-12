import React, { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { queueChannelContentSync } from "@/lib/channelContentSync";
import { toast } from "@/hooks/use-toast";

interface ChannelContentSyncStatusProps {
  propertyId: string | null | undefined;
}

interface SyncRow {
  action: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

/**
 * "Did my save reach the Channel Manager?" — the last content delta for this property, whether it
 * pushed, was skipped (not listed / paused / nothing changed) or failed, plus a manual force.
 */
export const ChannelContentSyncStatus: React.FC<ChannelContentSyncStatusProps> = ({ propertyId }) => {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["channel-content-sync", propertyId],
    enabled: !!propertyId,
    staleTime: 15_000,
    queryFn: async (): Promise<SyncRow | null> => {
      const { data: rows } = await supabase
        .from("ru_sync_runs")
        .select("action, success, error_message, created_at, details")
        .eq("property_id", propertyId!)
        .in("action", ["static_delta", "static_delta_skipped"])
        .order("created_at", { ascending: false })
        .limit(1);
      return ((rows ?? [])[0] as SyncRow | undefined) ?? null;
    },
  });

  const syncNow = useCallback(async () => {
    if (!propertyId) return;
    setSyncing(true);
    try {
      const result = await queueChannelContentSync(propertyId, "manual_content_sync", {
        force: true,
        wait: true,
      });
      if (result?.queued) {
        toast({ title: "Content pushed", description: "The Channel Manager listing was refreshed." });
      } else {
        toast({
          title: "Content not pushed",
          description: result?.error ?? `Skipped: ${result?.reason ?? "unknown reason"}`,
          variant: "destructive",
        });
      }
    } finally {
      setSyncing(false);
      void queryClient.invalidateQueries({ queryKey: ["channel-content-sync", propertyId] });
    }
  }, [propertyId, queryClient]);

  if (!propertyId) return null;

  const when = data?.created_at ? formatDistanceToNow(new Date(data.created_at), { addSuffix: true }) : null;
  const skipped = data?.action === "static_delta_skipped";
  const reason = typeof data?.details?.reason === "string" ? (data.details.reason as string) : null;

  const label = isLoading
    ? "Checking last content sync…"
    : !data
      ? "Last content sync: never"
      : skipped
        ? `Last content sync ${when} — skipped (${reason ?? "no change"})`
        : data.success
          ? `Content pushed ${when}`
          : `Content push failed ${when}${data.error_message ? ` — ${data.error_message}` : ""}`;

  const tone = !data || (data && !skipped && !data.success) ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className={tone}>{label}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs gap-1"
        onClick={() => void syncNow()}
        disabled={syncing}
      >
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {syncing ? "Syncing…" : "Sync content now"}
      </Button>
    </div>
  );
};

export default ChannelContentSyncStatus;
