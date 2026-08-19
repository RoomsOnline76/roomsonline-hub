import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, ShieldQuestion } from "lucide-react";

/**
 * Rentals United Minimum Content Quality (MCQ) — aggregated report for account managers.
 *
 * Every published listing must be checked before channel onboarding starts
 * (CM_LNM_OrderMinimumContentQualityCheck_RQ). Results arrive asynchronously as
 * PropertyMCQEligibilityCheck LNM notifications, so this surface always reads the
 * newest stored order per listing rather than assuming the order succeeded.
 */

type Outcome = "passed" | "failed" | "pending" | "blocked_upstream" | "never_ordered";

interface McqRow {
  property_id: string;
  property_name: string;
  listing_label: string;
  ru_property_id: string;
  ru_owner_id: string | number | null;
  outcome: Outcome;
  status: string | null;
  ru_status_id: string | null;
  ordered_at: string | null;
  ru_response_id: string | null;
  failing_points: string[];
}

const OUTCOME_META: Record<Outcome, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  passed: { label: "Passed", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  pending: { label: "Awaiting result", variant: "secondary" },
  blocked_upstream: { label: "Blocked at RU", variant: "destructive" },
  never_ordered: { label: "Never ordered", variant: "outline" },
};

export function RuMcqReportPanel() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<McqRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [rowRunning, setRowRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "mcq_report" },
      });
      if (error) throw error;
      setRows(((data as { rows?: McqRow[] })?.rows ?? []) as McqRow[]);
      setCounts((data as { counts?: Record<string, number> })?.counts ?? {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the content quality report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Batched bulk order — the edge function paces RU writes and reports `remaining`. */
  const orderAll = useCallback(async () => {
    setBulkRunning(true);
    try {
      let skip = 0;
      let ordered = 0;
      let failed = 0;
      for (let pass = 0; pass < 20; pass++) {
        const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: { action: "order_mcq_all", skip, limit: 12 },
        });
        if (error) throw error;
        const res = data as { ordered_count?: number; failed_count?: number; next_skip?: number; remaining?: number };
        ordered += res.ordered_count ?? 0;
        failed += res.failed_count ?? 0;
        skip = res.next_skip ?? skip;
        if (!res.remaining) break;
      }
      toast.success(`Quality checks ordered: ${ordered} accepted, ${failed} rejected`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk order failed");
    } finally {
      setBulkRunning(false);
    }
  }, [load]);

  const orderOne = useCallback(
    async (row: McqRow) => {
      setRowRunning(row.ru_property_id);
      try {
        const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: { action: "order_mcq", property_id: row.property_id, ru_property_id: row.ru_property_id },
        });
        if (error) throw error;
        const ok = (data as { success?: boolean })?.success === true;
        if (ok) toast.success(`Quality check ordered for ${row.listing_label}`);
        else toast.error((data as any)?.error?.message ?? "RU rejected the order");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Order failed");
      } finally {
        setRowRunning(null);
      }
    },
    [load],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" /> Content quality (MCQ)
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            One row per unit currently published to the channel. Every listing needs a minimum
            content quality check before go-live; results arrive asynchronously.
          </p>

        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => void orderAll()} disabled={bulkRunning}>
            {bulkRunning ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Order for all listings
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(OUTCOME_META) as Outcome[]).map((key) => (
            <div key={key} className="rounded-md border border-border p-3">
              <p className="text-lg font-semibold text-foreground">{counts[key] ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">{OUTCOME_META[key].label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published listings to check yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={`${row.property_id}-${row.ru_property_id}`}
                className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3"
              >
                {row.outcome === "passed" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : row.outcome === "never_ordered" || row.outcome === "pending" ? (
                  <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {row.property_name}
                    <span className="text-muted-foreground"> · {row.listing_label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    RU {row.ru_property_id}
                    {row.ru_owner_id ? ` · owner ${row.ru_owner_id}` : ""}
                    {row.ordered_at ? ` · ordered ${new Date(row.ordered_at).toLocaleString()}` : ""}
                  </p>
                  {row.failing_points.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-destructive">
                      {row.failing_points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {row.ru_response_id && (
                    <p className="mt-1 text-[11px] text-muted-foreground">ResponseID {row.ru_response_id}</p>
                  )}
                </div>
                <Badge variant={OUTCOME_META[row.outcome]?.variant ?? "outline"}>
                  {OUTCOME_META[row.outcome]?.label ?? row.outcome}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void orderOne(row)}
                  disabled={rowRunning === row.ru_property_id}
                >
                  {rowRunning === row.ru_property_id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {row.outcome === "never_ordered" ? "Order check" : "Re-check"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
