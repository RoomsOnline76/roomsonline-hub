import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportPortfolio, type PortfolioRun } from "@/hooks/useReportPortfolio";
import { NewReportsClientDialog } from "@/components/reports/NewReportsClientDialog";
import { CycleStatsBar, type CycleFilter } from "@/components/reports/dashboard/CycleStatsBar";
import {
  DEFAULT_FILTERS,
  PortfolioFilters,
  type PortfolioFilterState,
} from "@/components/reports/dashboard/PortfolioFilters";
import { PropertyReportRow } from "@/components/reports/dashboard/PropertyReportRow";
import { TimelineView } from "@/components/reports/dashboard/TimelineView";
import {
  ReportQuickViewDialog,
  type QuickViewTarget,
} from "@/components/reports/dashboard/ReportQuickViewDialog";
import { runLabel } from "@/components/reports/dashboard/RunHistoryList";
import { reportsPath } from "@/lib/config";

const CYCLE_ORDER: Record<string, number> = {
  attention: 0,
  overdue: 1,
  in_progress: 2,
  published: 3,
  never: 4,
};

export default function ReportsDashboard() {
  const { portfolio, stats, isLoading, error, refetch } = useReportPortfolio();
  const [filters, setFilters] = useState<PortfolioFilterState>(DEFAULT_FILTERS);
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("all");
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);

  usePageSEO({
    title: "Revenue Reports | Rooms Online",
    description:
      "Internal Rooms Online workspace for building consolidated revenue reviews per property.",
    noIndex: true,
  });

  const updateFilters = useCallback((next: Partial<PortfolioFilterState>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const openQuickView = useCallback((run: PortfolioRun, propertyName: string) => {
    setQuickView({ runId: run.id, propertyName, label: runLabel(run) });
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const property of portfolio) {
      for (const run of property.runs) set.add(run.reportMonth ?? run.asOfDate.slice(0, 7));
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [portfolio]);

  /** Properties that have reports, narrowed by the tiles, search and selects. */
  const visible = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    const rows = portfolio
      .filter((property) => property.runs.length > 0)
      .filter((property) => cycleFilter === "all" || property.cycleState === cycleFilter)
      .filter((property) => !needle || property.name.toLowerCase().includes(needle))
      .map((property) => {
        // Source and month narrow the run list too, so history stays honest.
        const runs = property.runs.filter(
          (run) =>
            (filters.source === "all" || run.sourceType === filters.source) &&
            (filters.month === "all" ||
              (run.reportMonth ?? run.asOfDate.slice(0, 7)) === filters.month),
        );
        return { ...property, runs, latestRun: runs[0] ?? null };
      })
      .filter((property) => property.runs.length > 0);

    return rows.sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name);
      if (filters.sort === "recent")
        return (b.latestRun?.asOfDate ?? "").localeCompare(a.latestRun?.asOfDate ?? "");
      const byCycle = CYCLE_ORDER[a.cycleState] - CYCLE_ORDER[b.cycleState];
      return byCycle !== 0
        ? byCycle
        : (b.latestRun?.asOfDate ?? "").localeCompare(a.latestRun?.asOfDate ?? "");
    });
  }, [portfolio, cycleFilter, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revenue Reports</h1>
          <p className="text-sm text-muted-foreground">
            Every reporting property, its current cycle and its report history in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            className="text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <NewReportsClientDialog />
          <Button asChild>
            <Link to={reportsPath("/new")}>
              <FilePlus2 className="h-4 w-4 mr-2" />
              New report
            </Link>
          </Button>
        </div>
      </div>

      <CycleStatsBar stats={stats} active={cycleFilter} onSelect={setCycleFilter} />

      <PortfolioFilters value={filters} months={months} onChange={updateFilters} />

      {error && (
        <p className="text-sm text-destructive">Could not load reports: {error.message}</p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">No reports match this view</p>
          <p>
            Clear the filters, or configure a property under{" "}
            <Link to={reportsPath("/settings")} className="underline">
              reporting settings
            </Link>
            .
          </p>
        </div>
      ) : filters.view === "timeline" ? (
        <TimelineView portfolio={visible} onQuickView={openQuickView} />
      ) : (
        <div className="space-y-2">
          {visible.map((property) => (
            <PropertyReportRow
              key={property.id}
              property={property}
              onQuickView={openQuickView}
            />
          ))}
        </div>
      )}

      <ReportQuickViewDialog target={quickView} onClose={() => setQuickView(null)} />
    </div>
  );
}
