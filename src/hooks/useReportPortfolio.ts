/**
 * Dashboard data for the Revenue Reports workspace.
 *
 * The dashboard manages *properties*, not a growing list of runs: every run is
 * attached to its property, the newest one becomes that property's headline and
 * the rest stay available as history. Each run also carries the hover summary
 * (Page 2 assessment, else Revenue Commentary) and whether a generated pack
 * exists, so Quickview and the popover need no extra round trips.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReportProperties, type ReportProperty } from "@/hooks/useReportProperties";
import { asCadence, type ReportCadence, type ReportRunStatus } from "@/hooks/useReportRuns";
import { buildRunSummary, type RunSummaryPreview } from "@/lib/reports/runSummaryPreview";

export interface PortfolioRun {
  id: string;
  propertyId: string;
  sourceType: string;
  asOfDate: string;
  /** `YYYY-MM` the review covers, when set. */
  reportMonth: string | null;
  status: ReportRunStatus;
  title: string | null;
  cadence: ReportCadence;
  /** True once a report pack has been generated for the run. */
  hasDraft: boolean;
  page2Enabled: boolean;
  summary: RunSummaryPreview;
  createdAt: string;
}

/** Where a property stands in its reporting cycle. */
export type CycleState = "published" | "in_progress" | "attention" | "overdue" | "never";

export interface PortfolioProperty extends ReportProperty {
  runs: PortfolioRun[];
  latestRun: PortfolioRun | null;
  cycleState: CycleState;
  cadence: ReportCadence;
  /** Months since the latest run's reporting month, null when never run. */
  monthsSinceReport: number | null;
}

export interface CycleStats {
  properties: number;
  published: number;
  inProgress: number;
  attention: number;
  overdue: number;
}

const asStatus = (value: string | null): ReportRunStatus =>
  value === "processing" || value === "ready" || value === "failed" ? value : "draft";

interface RunRow {
  id: string;
  property_id: string;
  source_type: string;
  as_of_date: string;
  report_month: string | null;
  status: string | null;
  title: string | null;
  cadence: string | null;
  draft_report_path: string | null;
  page2_enabled: boolean | null;
  created_at: string;
  report_insights:
    | { page2: unknown; narrative: string | null; narrative_final: string | null }[]
    | { page2: unknown; narrative: string | null; narrative_final: string | null }
    | null;
}

const firstInsight = (value: RunRow["report_insights"]) =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

/** Whole months between a `YYYY-MM` anchor and the current month. */
const monthsSince = (month: string | null): number | null => {
  if (!month) return null;
  const [year, mon] = month.split("-").map((part) => Number(part));
  if (!year || !mon) return null;
  const now = new Date();
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - mon);
};

const RUN_SELECT =
  "id, property_id, source_type, as_of_date, report_month, status, title, cadence, draft_report_path, page2_enabled, created_at, report_insights(page2, narrative, narrative_final)";

export function useReportPortfolio() {
  const { properties, isLoading: propertiesLoading, error: propertiesError } = useReportProperties();

  const runsQuery = useQuery({
    queryKey: ["reports", "portfolio", "runs"],
    staleTime: 30_000,
    queryFn: async (): Promise<PortfolioRun[]> => {
      const { data, error } = await supabase
        .from("report_runs")
        .select(RUN_SELECT)
        .order("as_of_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as RunRow[]).map((row) => {
        const insight = firstInsight(row.report_insights);
        return {
          id: row.id,
          propertyId: row.property_id,
          sourceType: row.source_type,
          asOfDate: String(row.as_of_date).slice(0, 10),
          reportMonth: row.report_month ? String(row.report_month).slice(0, 7) : null,
          status: asStatus(row.status),
          title: row.title,
          cadence: asCadence(row.cadence),
          hasDraft: Boolean(row.draft_report_path),
          page2Enabled: Boolean(row.page2_enabled),
          summary: buildRunSummary({
            page2: insight?.page2 ?? null,
            narrativeFinal: insight?.narrative_final ?? null,
            narrative: insight?.narrative ?? null,
          }),
          createdAt: row.created_at,
        } satisfies PortfolioRun;
      });
    },
  });

  const portfolio = useMemo<PortfolioProperty[]>(() => {
    const runsByProperty = new Map<string, PortfolioRun[]>();
    for (const run of runsQuery.data ?? []) {
      const list = runsByProperty.get(run.propertyId);
      if (list) list.push(run);
      else runsByProperty.set(run.propertyId, [run]);
    }

    return properties.map((property) => {
      const runs = runsByProperty.get(property.id) ?? [];
      const latestRun = runs[0] ?? null;
      const cadence = latestRun?.cadence ?? "bimonthly";
      // The reporting month anchors the cycle; fall back to the as-of month.
      const anchor = latestRun?.reportMonth ?? latestRun?.asOfDate.slice(0, 7) ?? null;
      const gap = monthsSince(anchor);
      // One period of grace past the cadence before a property reads as overdue.
      const allowance = cadence === "monthly" ? 2 : 3;

      let cycleState: CycleState;
      if (!latestRun) cycleState = "never";
      else if (latestRun.status === "failed") cycleState = "attention";
      else if (latestRun.status === "draft" || latestRun.status === "processing")
        cycleState = "in_progress";
      else if (gap !== null && gap > allowance) cycleState = "overdue";
      else cycleState = "published";

      return {
        ...property,
        runs,
        latestRun,
        cadence,
        cycleState,
        monthsSinceReport: gap,
      } satisfies PortfolioProperty;
    });
  }, [properties, runsQuery.data]);

  const stats = useMemo<CycleStats>(
    () => ({
      properties: portfolio.filter((p) => p.runs.length > 0).length,
      published: portfolio.filter((p) => p.cycleState === "published").length,
      inProgress: portfolio.filter((p) => p.cycleState === "in_progress").length,
      attention: portfolio.filter((p) => p.cycleState === "attention").length,
      overdue: portfolio.filter((p) => p.cycleState === "overdue").length,
    }),
    [portfolio],
  );

  return {
    portfolio,
    stats,
    isLoading: propertiesLoading || runsQuery.isLoading,
    error: (propertiesError ?? (runsQuery.error as Error | null)) || null,
    refetch: runsQuery.refetch,
  };
}
