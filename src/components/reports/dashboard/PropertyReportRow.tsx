import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  FilePlus2,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import { ReportHoverSummary } from "@/components/reports/dashboard/ReportHoverSummary";
import { RunHistoryList, formatRunMonth } from "@/components/reports/dashboard/RunHistoryList";
import { CADENCE_LABEL } from "@/hooks/useReportRuns";
import type { CycleState, PortfolioProperty, PortfolioRun } from "@/hooks/useReportPortfolio";
import { reportsPath } from "@/lib/config";
import { sourceLabel } from "@/lib/report-adapters";
import { cn } from "@/lib/utils";

const CYCLE_COPY: Record<CycleState, { label: string; className: string }> = {
  published: { label: "Published", className: "border-primary/40 text-primary" },
  in_progress: { label: "In progress", className: "border-muted-foreground/40" },
  attention: { label: "Needs attention", className: "border-destructive/50 text-destructive" },
  overdue: { label: "Overdue", className: "border-destructive/40 text-destructive" },
  never: { label: "No reports yet", className: "border-dashed" },
};

/**
 * One property, one row — its current cycle state and headline run up front, the
 * rest of its history a click away.
 */
export function PropertyReportRow({
  property,
  onQuickView,
}: {
  property: PortfolioProperty;
  onQuickView: (run: PortfolioRun, propertyName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = property.latestRun;
  const history = property.runs.slice(1);
  const cycle = CYCLE_COPY[property.cycleState];

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="p-1 rounded hover:bg-muted disabled:opacity-40"
          disabled={history.length === 0}
          aria-label={open ? "Collapse run history" : "Expand run history"}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {property.logoUrl ? (
          <img
            src={property.logoUrl}
            alt={`${property.name} logo`}
            loading="lazy"
            className="h-10 w-10 rounded-md object-contain bg-muted"
          />
        ) : (
          <span className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{property.name}</p>
            <Badge variant="outline" className={cn("text-[11px] font-normal", cycle.className)}>
              {cycle.label}
            </Badge>
            {property.isReportsClient && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                Reporting only
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {property.city ?? "Location not set"}
            {property.roomCount ? ` · ${property.roomCount} rooms` : ""} ·{" "}
            {CADENCE_LABEL[property.cadence]}
            {latest ? ` · ${sourceLabel(latest.sourceType)}` : ""}
            {history.length > 0 ? ` · ${property.runs.length} runs` : ""}
          </p>
        </div>

        {latest ? (
          <HoverCard openDelay={140} closeDelay={80}>
            <HoverCardTrigger asChild>
              <Link
                to={reportsPath(`/runs/${latest.id}`)}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50"
              >
                <span className="font-medium tabular-nums">{formatRunMonth(latest)}</span>
                <RunStatusPill status={latest.status} />
              </Link>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-96">
              <ReportHoverSummary run={latest} propertyName={property.name} />
            </HoverCardContent>
          </HoverCard>
        ) : (
          <span className="text-xs text-muted-foreground">No run yet</span>
        )}

        <div className="flex items-center gap-1">
          {latest && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onQuickView(latest, property.name)}
              disabled={!latest.hasDraft}
              title={latest.hasDraft ? "Quickview latest report" : "No report generated yet"}
            >
              <Eye className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Quickview</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild title="Start a new report">
            <Link to={reportsPath(`/new?property=${property.id}`)}>
              <FilePlus2 className="h-4 w-4" />
              <span className="sr-only">New report</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild title="Reporting settings">
            <Link to={reportsPath(`/settings/${property.id}`)}>
              <Settings2 className="h-4 w-4" />
              <span className="sr-only">Reporting settings</span>
            </Link>
          </Button>
        </div>
      </div>

      {open && history.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-2.5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Earlier runs
          </p>
          <RunHistoryList
            runs={history}
            propertyName={property.name}
            onQuickView={(run) => onQuickView(run, property.name)}
          />
        </div>
      )}
    </div>
  );
}

export default PropertyReportRow;
