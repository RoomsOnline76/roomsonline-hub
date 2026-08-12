import React, { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { queueChannelContentSync, queueChannelRatesSync } from "@/lib/channelContentSync";
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

type SyncKind = "content" | "rates";

const KIND_CONFIG: Record<
  SyncKind,
  { queryKey: string; actions: string[]; skipAction: string; noun: string; button: string }
> = {
  content: {
    queryKey: "channel-content-sync",
    actions: ["static_delta", "static_delta_skipped"],
    skipAction: "static_delta_skipped",
    noun: "content",
    button: "Sync content now",
  },
  rates: {
    queryKey: "channel-rates-sync",
    actions: ["refresh_ari", "refresh_ari_skipped"],
    skipAction: "refresh_ari_skipped",
    noun: "rates & availability",
    button: "Sync rates now",
  },
};

const SyncLine: React.FC<{ propertyId: string; kind: SyncKind }> = ({ propertyId, kind }) => {
  const config = KIND_CONFIG[kind];
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [config.queryKey, propertyId],
    staleTime: 15_000,
    queryFn: async (): Promise<SyncRow | null> => {
      const { data: rows } = await supabase
        .from("ru_sync_runs")
        .select("action, success, error_message, created_at, details")
        .eq("property_id", propertyId)
        .in("action", config.actions)
        .order("created_at", { ascending: false })
        .limit(1);
      return ((rows ?? [])[0] as SyncRow | undefined) ?? null;
    },
  });

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const trigger = kind === "content" ? "manual_content_sync" : "manual_rates_sync";
      const result =
        kind === "content"
          ? await queueChannelContentSync(propertyId, trigger, { force: true, wait: true })
          : await queueChannelRatesSync(propertyId, trigger, { force: true, wait: true });
      if (result?.queued && !result?.error) {
        toast({
          title: kind === "content" ? "Content pushed" : "Rates pushed",
          description: "The Channel Manager listing was refreshed.",
        });
      } else {
        toast({
          title: kind === "content" ? "Content not pushed" : "Rates not pushed",
          description: result?.error ?? `Skipped: ${result?.reason ?? "unknown reason"}`,
          variant: "destructive",
        });
      }
    } finally {
      setSyncing(false);
      void queryClient.invalidateQueries({ queryKey: [config.queryKey, propertyId] });
    }
  }, [propertyId, kind, config.queryKey, queryClient]);

  const when = data?.created_at ? formatDistanceToNow(new Date(data.created_at), { addSuffix: true }) : null;
  const skipped = data?.action === config.skipAction;
  const reason = typeof data?.details?.reason === "string" ? (data.details.reason as string) : null;

  const label = isLoading
    ? `Checking last ${config.noun} sync…`
    : !data
      ? `Last ${config.noun} sync: never`
      : skipped
        ? `Last ${config.noun} sync ${when} — skipped (${reason ?? "no change"})`
        : data.success
          ? `${config.noun === "content" ? "Content" : "Rates & availability"} pushed ${when}`
          : `${config.noun === "content" ? "Content" : "Rates"} push failed ${when}${data.error_message ? ` — ${data.error_message}` : ""}`;

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
        {syncing ? "Syncing…" : config.button}
      </Button>
    </div>
  );
};

/**
 * "Did my save reach the Channel Manager?" — the last static content delta and the last
 * rates & availability delta for this property, whether each pushed, was skipped
 * (not listed / paused / nothing changed) or failed, plus a manual force for both.
 */
export const ChannelContentSyncStatus: React.FC<ChannelContentSyncStatusProps> = ({ propertyId }) => {
  if (!propertyId) return null;
  return (
    <div className="space-y-1">
      <SyncLine propertyId={propertyId} kind="content" />
      <SyncLine propertyId={propertyId} kind="rates" />
    </div>
  );
};

export default ChannelContentSyncStatus;
