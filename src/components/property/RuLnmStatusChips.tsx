import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
} from "lucide-react";

/**
 * LNM / MCQ status chips for one property (Step 5 surface).
 *
 * Read-only: the backing `lnm_status` action reads the subscription back from RU and never
 * pushes, so opening the editor can never consume a Push_* slot in RU's one-call-per-method-
 * per-minute budget. The chips are diagnostic — they never block saving or pushing.
 */

interface LnmStatus {
  property: { id: string; name: string; ru_property_id: string | null };
  account: { ru_owner_id: string | null; has_keys: boolean; scope: string | null };
  lnm: {
    state: "ok" | "stale" | "drift" | "unsubscribed" | "unmonitored";
    desired: { change_types: string[]; observed_owners: string[]; url_base: string };
    actual: { change_types: string[]; observed_owners: string[]; url_base: string | null } | null;
    drift: { in_sync: boolean; missing_change_types: string[]; missing_owners: string[]; url_matches: boolean } | null;
    read_error: string | null;
    mcq_change_type_present: boolean;
    last_subscribed_at: string | null;
    last_subscribed_hours: number | null;
    last_read_back_at: string | null;
    last_notification_at: string | null;
  };
  mcq: {
    id: string;
    status: string;
    ordered_at: string | null;
    ru_property_id: string | null;
    ru_status_id: string | null;
    blocker: string | null;
    ru_response_id: string | null;
  } | null;
}

const LNM_TONE: Record<LnmStatus["lnm"]["state"], { label: string; className: string }> = {
  ok: { label: "Live notifications active", className: "text-success border-success/40" },
  stale: { label: "Live notifications stale", className: "text-warning border-warning/40" },
  drift: { label: "Live notifications drifted", className: "text-destructive border-destructive/40" },
  unsubscribed: { label: "Live notifications not subscribed", className: "text-destructive border-destructive/40" },
  unmonitored: { label: "Live notifications unmonitored", className: "text-muted-foreground" },
};

function mcqTone(status: string | null | undefined): { label: string; className: string } {
  switch ((status ?? "").toLowerCase()) {
    case "passed":
      return { label: "Quality check passed", className: "text-success border-success/40" };
    case "failed":
      return { label: "Quality check failed", className: "text-destructive border-destructive/40" };
    case "ordered":
      return { label: "Quality check awaiting result", className: "text-warning border-warning/40" };
    default:
      return { label: "Quality check not ordered", className: "text-muted-foreground" };
  }
}

export function RuLnmStatusChips({ propertyId }: { propertyId: string }) {
  const [status, setStatus] = useState<LnmStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dupRunning, setDupRunning] = useState(false);
  const [dupResult, setDupResult] = useState<Record<string, unknown> | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "lnm_status", property_id: propertyId },
      });
      if (error) throw new Error(error.message);
      if (data?.success !== true) throw new Error(data?.error?.message ?? "Could not read the LNM status");
      setStatus(data as LnmStatus);
    } catch (e) {
      setStatus(null);
      toast.error("Live notification status unavailable", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runMcqDuplicateTest = useCallback(async () => {
    setDupRunning(true);
    setDupResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "mcq_duplicate_test", property_id: propertyId },
      });
      if (error) throw new Error(error.message);
      if (data?.success !== true) throw new Error(data?.error?.message ?? "The duplicate-order test could not run");
      setDupResult(data as Record<string, unknown>);
      if (data.passed) toast.success("The Channel Manager accepted both quality-check orders");
      else if (data.lnm_not_subscribed) toast.error("Channel status 280 — subscribe the account to LNM first");
      else if (data.ru_internal_error) toast.error("Channel status 17 — channel-side fault, escalate with the ResponseID");
      else toast.error("Duplicate-order test failed");
      await load();
    } catch (e) {
      toast.error("Duplicate-order test failed", { description: e instanceof Error ? e.message : String(e) });
    }
    setDupRunning(false);
  }, [propertyId, load]);

  /**
   * Manual repair path. Subscription is registered automatically the moment the
   * sub-account's keys verify, so this is only needed when RU dropped or drifted it.
   */
  const subscribeNow = useCallback(async () => {
    setSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "ensure_live_notifications", property_id: propertyId },
      });
      if (error) throw new Error(error.message);
      if (data?.success !== true) throw new Error(data?.error?.message ?? "Live notifications could not be registered");
      if (data.warning) toast.warning("Subscribed with a warning", { description: String(data.warning) });
      else toast.success("Live notifications registered and verified");
      await load();
    } catch (e) {
      toast.error("Could not register live notifications", { description: e instanceof Error ? e.message : String(e) });
    }
    setSubscribing(false);
  }, [propertyId, load]);


  const lnmTone = useMemo(() => LNM_TONE[status?.lnm.state ?? "unmonitored"], [status]);
  const mcq = useMemo(() => mcqTone(status?.mcq?.status), [status]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading live notification status from the Channel Manager…
      </div>
    );
  }
  if (!status) return null;

  const drift = status.lnm.drift;
  const evidence = JSON.stringify({ status, duplicate_order_test: dupResult }, null, 2);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[10px] gap-1 ${lnmTone.className}`}>
          <Radio className="h-3 w-3" /> {lnmTone.label}
        </Badge>
        <Badge variant="outline" className={`text-[10px] gap-1 ${mcq.className}`}>
          <BadgeCheck className="h-3 w-3" /> {mcq.label}
        </Badge>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-check
        </Button>
        {status.lnm.state !== "ok" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => void subscribeNow()}
            disabled={subscribing || loading}
            title="Register reservation and content notifications for this property's distribution account"
          >
            {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radio className="h-3 w-3" />}
            {subscribing ? "Subscribing…" : "Subscribe now"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Details
        </Button>
      </div>

      {expanded && (
        <div className="rounded-md border p-2.5 space-y-2 text-xs">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Account</span>
              <div className="font-medium">
                {status.account.ru_owner_id ? `OwnerID ${status.account.ru_owner_id}` : "Master account"}
                {status.account.ru_owner_id && !status.account.has_keys && " · no own API keys"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Last subscribed</span>
              <div className="font-medium">
                {status.lnm.last_subscribed_at
                  ? `${status.lnm.last_subscribed_hours ?? "?"}h ago`
                  : "Never"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Last notification received</span>
              <div className="font-medium">
                {status.lnm.last_notification_at
                  ? new Date(status.lnm.last_notification_at).toLocaleString()
                  : "None yet"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">MCQ change type subscribed</span>
              <div className="font-medium">{status.lnm.mcq_change_type_present ? "Yes" : "No"}</div>
            </div>
          </div>

          {status.lnm.read_error && (
            <p className="text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {status.lnm.read_error}
            </p>
          )}

          {status.lnm.actual && (
            <div className="space-y-1 text-muted-foreground">
              <p className="font-mono break-all">
                UrlBase at the Channel Manager: {status.lnm.actual.url_base ?? "(none)"}
                {drift && !drift.url_matches && (
                  <span className="text-destructive"> — expected {status.lnm.desired.url_base}</span>
                )}
              </p>
              {drift && drift.missing_change_types.length > 0 && (
                <p className="text-destructive">Missing change types: {drift.missing_change_types.join(", ")}</p>
              )}
              {drift && drift.missing_owners.length > 0 && (
                <p className="text-destructive">Missing observed OwnerIDs: {drift.missing_owners.join(", ")}</p>
              )}
              <p>
                Observed OwnerIDs at the Channel Manager:{" "}
                {status.lnm.actual.observed_owners.length ? status.lnm.actual.observed_owners.join(", ") : "(none)"}
              </p>
            </div>
          )}

          {status.mcq && (
            <>
              <Separator />
              <div className="space-y-1">
                <p>
                  Newest quality check: <span className="font-medium">{status.mcq.status}</span>
                  {status.mcq.ordered_at ? ` · ${new Date(status.mcq.ordered_at).toLocaleString()}` : ""}
                  {status.mcq.ru_property_id ? ` · RU ${status.mcq.ru_property_id}` : ""}
                </p>
                {status.mcq.blocker && <p className="text-destructive">{status.mcq.blocker}</p>}
                {status.mcq.ru_response_id && (
                  <p className="font-mono text-muted-foreground">RU ResponseID: {status.mcq.ru_response_id}</p>
                )}
              </div>
            </>
          )}

          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1.5"
              onClick={() => void runMcqDuplicateTest()}
              disabled={dupRunning}
            >
              {dupRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />}
              Duplicate-order test (~70s)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1.5"
              onClick={() => {
                void navigator.clipboard.writeText(evidence);
                toast.success("Evidence JSON copied");
              }}
            >
              <Copy className="h-3 w-3" /> Copy evidence JSON
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5" asChild>
              <a href="/admin/channel-monitor?tab=advanced" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> Live notifications panel
              </a>
            </Button>
          </div>

          {dupResult != null && (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
              {JSON.stringify(dupResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
