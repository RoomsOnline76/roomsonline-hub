import { Link } from "react-router-dom";
import { Eye, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import { ReportHoverSummary } from "@/components/reports/dashboard/ReportHoverSummary";
import { reportsPath } from "@/lib/config";
import { sourceLabel } from "@/lib/report-adapters";
import type { PortfolioRun } from "@/hooks/useReportPortfolio";

export const formatRunMonth = (run: PortfolioRun): string =>
  run.reportMonth
    ? new Date(`${run.reportMonth}-01T00:00:00`).toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric",
      })
    : new Date(`${run.asOfDate}T00:00:00`).toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric",
      });

export const runLabel = (run: PortfolioRun): string =>
  `${formatRunMonth(run)} · as-of ${new Date(`${run.asOfDate}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

/** One run line, with the hover summary and the two ways into the report. */
export function RunHistoryRow({
  run,
  propertyName,
  onQuickView,
}: {
  run: PortfolioRun;
  propertyName: string;
  onQuickView: (run: PortfolioRun) => void;
}) {
  return (
    <HoverCard openDelay={140} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div
          tabIndex={0}
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/40"
        >
          <span className="font-medium tabular-nums">{formatRunMonth(run)}</span>
          <span className="text-xs text-muted-foreground truncate">
            as-of{" "}
            {new Date(`${run.asOfDate}T00:00:00`).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            · {sourceLabel(run.sourceType)}
            {run.summary.kind === "assessment" ? " · TOBI assessment" : ""}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <RunStatusPill status={run.status} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onQuickView(run)}
              disabled={!run.hasDraft}
              title={run.hasDraft ? "Quickview report" : "No report generated yet"}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="sr-only">Quickview report</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
              <Link to={reportsPath(`/runs/${run.id}`)} title="Open run builder">
                <Wrench className="h-3.5 w-3.5" />
                <span className="sr-only">Open run builder</span>
              </Link>
            </Button>
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-96">
        <ReportHoverSummary run={run} propertyName={propertyName} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function RunHistoryList({
  runs,
  propertyName,
  onQuickView,
}: {
  runs: PortfolioRun[];
  propertyName: string;
  onQuickView: (run: PortfolioRun) => void;
}) {
  if (runs.length === 0) {
    return <p className="text-xs text-muted-foreground">No earlier runs.</p>;
  }
  return (
    <div className="space-y-1.5">
      {runs.map((run) => (
        <RunHistoryRow
          key={run.id}
          run={run}
          propertyName={propertyName}
          onQuickView={onQuickView}
        />
      ))}
    </div>
  );
}

export default RunHistoryList;
