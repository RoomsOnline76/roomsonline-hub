import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfDay } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Lock, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncRestrictionsToChannels } from "@/lib/restrictionSync";
import {
  buildRatePlanClosureSpans,
  buildRestrictionSpans,
  formatSpanAttribution,
  formatSpanRange,
  RESTRICTION_KIND_LABELS,
  type AvailabilityNightRow,
  type RestrictionKind,
  type RestrictionSpan,
} from "@/lib/restrictionSpans";
import { RestrictionSpanEditor } from "./RestrictionSpanEditor";

interface RestrictionsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Properties in scope — a single property, or every property in the portfolio view. */
  propertyIds: string[];
  propertyNames?: Record<string, string>;
  /** First date to list from; defaults to today. */
  windowStart?: Date;
  /** Refresh the calendars after a change. */
  onChanged?: () => void;
  /** Open straight into the block covering this night (calendar right-click shortcut). */
  focusBlock?: { propertyId: string; roomType: string; date: string } | null;
}

const KIND_DOT: Record<RestrictionKind, string> = {
  block: "bg-red-500",
  min_stay: "bg-blue-500",
  max_stay: "bg-pink-500",
  lead_advance: "bg-yellow-500",
  lead_post: "bg-orange-500",
  rate_plan_closure: "bg-purple-500",
};

export function RestrictionsManagerDialog({
  open,
  onOpenChange,
  propertyIds,
  propertyNames,
  windowStart,
  onChanged,
  focusBlock,
}: RestrictionsManagerDialogProps) {
  const [kindFilter, setKindFilter] = useState<RestrictionKind | "all">("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [futureOnly, setFutureOnly] = useState(true);
  const [editing, setEditing] = useState<RestrictionSpan | null>(null);

  const from = format(startOfDay(windowStart ?? new Date()), "yyyy-MM-dd");
  const to = format(addMonths(windowStart ?? new Date(), 18), "yyyy-MM-dd");
  const scopeKey = propertyIds.join(",");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["restriction-spans", scopeKey, futureOnly ? from : "all", to],
    enabled: open && propertyIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const nightsQuery = supabase
        .from("property_availability")
        .select(
          "id, property_id, room_type, date, available_units, is_stop_sell, minimum_stay, maximum_stay, lead_days_advance, lead_days_post, external_system, blocked_by_label, blocked_reason, blocked_at",
        )
        .in("property_id", propertyIds)
        .lte("date", to)
        .order("date");
      if (futureOnly) nightsQuery.gte("date", from);
      const { data: nights, error } = await nightsQuery;
      if (error) throw error;

      const closuresQuery = supabase
        .from("rolos_rate_plan_stop_sell")
        .select("rate_plan_id, property_id, date")
        .in("property_id", propertyIds)
        .lte("date", to)
        .order("date");
      if (futureOnly) closuresQuery.gte("date", from);
      const { data: closures } = await closuresQuery;

      const planIds = Array.from(new Set((closures || []).map((c: any) => c.rate_plan_id)));
      let planNames: Record<string, string> = {};
      if (planIds.length > 0) {
        const { data: plans } = await supabase
          .from("rolos_rate_plans")
          .select("id, name")
          .in("id", planIds);
        planNames = Object.fromEntries((plans || []).map((p: any) => [p.id, p.name as string]));
      }

      const availabilitySpans = buildRestrictionSpans((nights || []) as AvailabilityNightRow[], propertyNames);
      const closureSpans = buildRatePlanClosureSpans((closures || []) as any[], planNames, propertyNames);
      return [...availabilitySpans, ...closureSpans].sort((a, b) => a.start.localeCompare(b.start));
    },
  });

  const spans = data ?? [];

  const targets = useMemo(
    () => Array.from(new Set(spans.map((s) => s.target))).sort((a, b) => a.localeCompare(b)),
    [spans],
  );

  const visible = useMemo(
    () =>
      spans.filter(
        (s) => (kindFilter === "all" || s.kind === kindFilter) && (targetFilter === "all" || s.target === targetFilter),
      ),
    [spans, kindFilter, targetFilter],
  );

  // Calendar right-click deep-link: open the matching span's editor once loaded.
  useEffect(() => {
    if (!open || !focusBlock) return;
    const match = spans.find(
      (s) =>
        s.kind === "block" &&
        s.propertyId === focusBlock.propertyId &&
        s.target.trim().toLowerCase() === focusBlock.roomType.trim().toLowerCase() &&
        s.dates.includes(focusBlock.date),
    );
    if (match) setEditing((current) => current ?? match);
  }, [open, focusBlock, spans]);

  const handleChanged = (span: RestrictionSpan, change: RestrictionSpanChange) => {
    // Refresh the UI first and let the Channel Manager delta run in the background — the
    // operator should never wait on an edge-function round trip to see their own edit.
    void refetch();
    onChanged?.();
    if (span.kind !== "rate_plan_closure") {
      // syncRestrictionsToChannels already stays silent for properties that are not yet
      // connected; only a genuine throw is worth an error toast. The nights the write actually
      // touched scope the channel delta — a two-night release is a two-night availability push,
      // never the whole year, and never prices.
      const nights = [...(span.dates ?? [])].sort();
      const range = change?.range ?? { from: nights[0] ?? null, to: nights[nights.length - 1] ?? null };
      const label = span.kind === "block" ? "stop_sell" : span.kind;
      void syncRestrictionsToChannels([span.propertyId], label, range, {
        // Reopened nights must reach the channel even if the availability fingerprint looks unchanged.
        forceAvailability: change?.reopened === true,
      }).catch((error) => {
        console.error("Restriction change saved but the channel push failed:", error);
      });
    }
  };


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage restrictions</DialogTitle>
            <DialogDescription>
              Every block, stay rule and rate-plan closure in place. Edit, move or remove them here.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as RestrictionKind | "all")}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(RESTRICTION_KIND_LABELS) as RestrictionKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{RESTRICTION_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={targetFilter} onValueChange={setTargetFilter}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="All room types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All room types &amp; plans</SelectItem>
                {targets.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Switch id="restrictions-future" checked={futureOnly} onCheckedChange={setFutureOnly} />
              <Label htmlFor="restrictions-future" className="text-xs text-muted-foreground">Only future</Label>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Loading restrictions…
              </div>
            )}

            {!isLoading && visible.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No restrictions in this window.
              </p>
            )}

            {visible.map((span) => (
              <div
                key={span.key}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[span.kind]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {RESTRICTION_KIND_LABELS[span.kind]}
                    {span.value != null ? ` ${span.value}` : ""} · {span.target}
                    {propertyIds.length > 1 && span.propertyName ? (
                      <span className="text-muted-foreground"> · {span.propertyName}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatSpanRange(span)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSpanAttribution(span)}
                    {span.reason ? ` · ${span.reason}` : ""}
                  </p>
                </div>
                {span.editable ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(span)}>
                    <Pencil className="mr-1 h-3 w-3" />Edit
                  </Button>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Lock className="h-3 w-3" />Channel owned
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <RestrictionSpanEditor
        span={editing}
        open={!!editing}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        onChanged={handleChanged}
      />
    </>
  );
}
