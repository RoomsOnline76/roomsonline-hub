import { useMemo } from "react";
import { RunHistoryRow } from "@/components/reports/dashboard/RunHistoryList";
import type { PortfolioProperty, PortfolioRun } from "@/hooks/useReportPortfolio";

interface TimelineEntry {
  run: PortfolioRun;
  propertyName: string;
}

const monthKey = (run: PortfolioRun): string => run.reportMonth ?? run.asOfDate.slice(0, 7);

const monthTitle = (key: string): string =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });

/** Every run in the filtered portfolio, grouped by the month it reports on. */
export function TimelineView({
  portfolio,
  onQuickView,
}: {
  portfolio: PortfolioProperty[];
  onQuickView: (run: PortfolioRun, propertyName: string) => void;
}) {
  const groups = useMemo(() => {
    const byMonth = new Map<string, TimelineEntry[]>();
    for (const property of portfolio) {
      for (const run of property.runs) {
        const key = monthKey(run);
        const entry = { run, propertyName: property.name };
        const list = byMonth.get(key);
        if (list) list.push(entry);
        else byMonth.set(key, [entry]);
      }
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, entries]) => ({
        month,
        entries: entries.sort((a, b) => a.propertyName.localeCompare(b.propertyName)),
      }));
  }, [portfolio]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.month} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-medium tracking-tight">{monthTitle(group.month)}</h3>
            <span className="text-xs text-muted-foreground">
              {group.entries.length} report{group.entries.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            {group.entries.map(({ run, propertyName }) => (
              <div key={run.id} className="space-y-1">
                <p className="px-1 text-xs font-medium text-muted-foreground">{propertyName}</p>
                <RunHistoryRow
                  run={run}
                  propertyName={propertyName}
                  onQuickView={(target) => onQuickView(target, propertyName)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default TimelineView;
