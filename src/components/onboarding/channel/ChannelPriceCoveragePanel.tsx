/**
 * Channel price coverage — shows the stored verdict per unit instead of re-probing the channel.
 *
 * Verdicts come from the independent coverage audit (what the channel itself holds priced for the
 * next year):
 *   channel_short    – rates are being re-sent automatically, nothing for the user to do
 *   local_incomplete – ROL'OS is missing rates; the user must author them in Rate Plans
 *   unverified       – the channel read could not be performed; it re-runs on its own
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CoverageRow {
  id: string;
  unit_name: string | null;
  verdict: "verified" | "channel_short" | "local_incomplete" | "unverified";
  channel_priced_days: number | null;
  expected_days: number | null;
  local_unpriced_days: number | null;
  first_gap_date: string | null;
  gap_summary: string | null;
  last_audit_at: string | null;
}

const VERDICT_LABEL: Record<CoverageRow["verdict"], string> = {
  verified: "Priced year confirmed",
  channel_short: "Re-sending rates",
  local_incomplete: "Rates missing",
  unverified: "Not yet confirmed",
};

interface Props {
  propertyId: string;
  variant?: "admin" | "owner";
}

export function ChannelPriceCoveragePanel({ propertyId, variant = "owner" }: Props) {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("channel_price_coverage_status")
      .select(
        "id, unit_name, verdict, channel_priced_days, expected_days, local_unpriced_days, first_gap_date, gap_summary, last_audit_at",
      )
      .eq("property_id", propertyId)
      .order("unit_name", { ascending: true });
    setRows((data ?? []) as CoverageRow[]);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const problems = useMemo(() => rows.filter((r) => r.verdict !== "verified"), [rows]);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("cron-channel-price-coverage", {
        body: { property_ids: [propertyId] },
      });
      if (error) throw error;
      const summary = (data as { summary?: Record<string, number> } | null)?.summary ?? {};
      const short = (summary.channel_short ?? 0) + (summary.local_incomplete ?? 0);
      toast.success(
        short === 0
          ? "The channel holds a priced year for every unit"
          : `${short} unit(s) still need attention — details below`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check pricing coverage");
    } finally {
      setChecking(false);
    }
  }, [propertyId, load]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs text-muted-foreground">
        <span>Pricing coverage for the year ahead has not been checked yet.</span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void recheck()} disabled={checking}>
          {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Check now
        </Button>
      </div>
    );
  }

  if (problems.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5" />
          Every unit has a priced year on the channel.
        </span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void recheck()} disabled={checking}>
          {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Re-check"}
        </Button>
      </div>
    );
  }

  const rateManagerHref =
    variant === "admin" ? `/admin/properties/${propertyId}` : `/pms/rate-plans?property=${propertyId}`;

  return (
    <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          Pricing for the year ahead needs attention on {problems.length} unit
          {problems.length === 1 ? "" : "s"}
        </p>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void recheck()} disabled={checking}>
          {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Re-check
        </Button>
      </div>
      <ul className="space-y-1.5">
        {problems.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 text-[11px] text-foreground">
            <Badge variant="outline" className="text-[10px]">
              {VERDICT_LABEL[row.verdict]}
            </Badge>
            <span className="font-medium">{row.unit_name || "Whole property"}</span>
            <span className="text-muted-foreground">
              {row.gap_summary ||
                `${row.channel_priced_days ?? 0} of ${row.expected_days ?? 365} nights priced on the channel`}
            </span>
            {row.verdict === "local_incomplete" && (
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-[11px]">
                <Link to={rateManagerHref}>Author the missing rates</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ChannelPriceCoveragePanel;
