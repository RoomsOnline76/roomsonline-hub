import React, { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, Clock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  {
    queryKey: string;
    actions: string[];
    skipAction: string;
    pendingAction: string;
    noun: string;
    title: string;
    button: string;
  }
> = {
  content: {
    queryKey: "channel-content-sync",
    actions: ["static_delta", "static_delta_skipped", "static_delta_pending"],
    skipAction: "static_delta_skipped",
    pendingAction: "static_delta_pending",
    noun: "content",
    title: "Content",
    button: "Force content push",
  },
  rates: {
    queryKey: "channel-rates-sync",
    actions: ["refresh_ari", "refresh_ari_skipped", "ari_delta_pending"],
    skipAction: "refresh_ari_skipped",
    pendingAction: "ari_delta_pending",
    noun: "rates & availability",
    title: "Rates & availability",
    button: "Force rates push",
  },
};

const useLastRun = (propertyId: string, kind: SyncKind) => {
  const config = KIND_CONFIG[kind];
  return useQuery({
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
};

/** One read-only line describing the newest delta for this stream. */
const SyncLine: React.FC<{ propertyId: string; kind: SyncKind }> = ({ propertyId, kind }) => {
  const config = KIND_CONFIG[kind];
  const { data, isLoading } = useLastRun(propertyId, kind);

  const when = data?.created_at ? formatDistanceToNow(new Date(data.created_at), { addSuffix: true }) : null;
  const skipped = data?.action === config.skipAction;
  const pending = data?.action === config.pendingAction;
  const reason = typeof data?.details?.reason === "string" ? (data.details.reason as string) : null;
  const blockers = Array.isArray(data?.details?.blockers) ? (data!.details!.blockers as string[]) : [];

  const label = isLoading
    ? `Checking ${config.noun}…`
    : !data
      ? `${config.title}: nothing sent yet`
      : pending
        ? `${config.title} waiting on the readiness gate ${when} — pushes itself once${
          blockers.length > 0 ? `: ${blockers.slice(0, 2).join("; ")}` : " the outstanding items clear"
        }`
        : skipped
          ? `${config.title} unchanged ${when}${reason ? ` (${reason})` : ""}`
          : data.success
            ? `${config.title} delivered ${when}`
            : `${config.title} failed ${when}${data.error_message ? ` — ${data.error_message}` : ""}`;

  const tone = pending
    ? "text-amber-600 dark:text-amber-400"
    : data && !skipped && !data.success
      ? "text-destructive"
      : "text-muted-foreground";

  const Icon = pending ? Clock : data && !skipped && data.success ? Check : RefreshCw;

  return (
    <div className={`flex items-start gap-1.5 text-xs ${tone}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{label}</span>
    </div>
  );
};

/** Opt-in manual override for one stream. */
const ForceButton: React.FC<{ propertyId: string; kind: SyncKind }> = ({ propertyId, kind }) => {
  const config = KIND_CONFIG[kind];
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const trigger = kind === "content" ? "manual_content_sync" : "manual_rates_sync";
      const result =
        kind === "content"
          ? await queueChannelContentSync(propertyId, trigger, { force: true, wait: true, manual: true })
          : await queueChannelRatesSync(propertyId, trigger, { force: true, wait: true, manual: true });

      if (result?.queued && !result?.error) {
        toast({ title: `${config.title} pushed`, description: "The Channel Manager listing was refreshed." });
      } else if (result?.reason === "gate_pending") {
        toast({
          title: `${config.title} parked`,
          description:
            "The listing does not satisfy the channel readiness gate yet — this update pushes itself automatically once it does.",
        });
      } else {
        toast({
          title: `${config.title} not pushed`,
          description: result?.error ?? `Skipped: ${result?.reason ?? "unknown reason"}`,
          variant: "destructive",
        });
      }
    } finally {
      setSyncing(false);
      void queryClient.invalidateQueries({ queryKey: [config.queryKey, propertyId] });
    }
  }, [propertyId, kind, config.queryKey, config.title, queryClient]);

  return (
    <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => void syncNow()} disabled={syncing}>
      {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      {syncing ? "Pushing…" : config.button}
    </Button>
  );
};

/**
 * "Did my save reach the Channel Manager?"
 *
 * Channel updates are automatic: every save that changes content or rates pushes itself, and a
 * change that arrives while the listing is short of the mandatory gate is parked and re-fired the
 * moment readiness clears. This card therefore leads with the automatic state and keeps the
 * manual force buttons as an opt-in override behind a disclosure.
 */
export const ChannelContentSyncStatus: React.FC<ChannelContentSyncStatusProps> = ({ propertyId }) => {
  const [open, setOpen] = React.useState(false);
  if (!propertyId) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">Updates push to the Channel Manager automatically</p>
      <SyncLine propertyId={propertyId} kind="content" />
      <SyncLine propertyId={propertyId} kind="rates" />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-1 text-[11px] text-muted-foreground">
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            Manual sync (not needed)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-wrap gap-1 pt-1">
          <ForceButton propertyId={propertyId} kind="content" />
          <ForceButton propertyId={propertyId} kind="rates" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ChannelContentSyncStatus;
