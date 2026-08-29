import { Link } from "react-router-dom";
import { AlertTriangle, Flame, Sparkles, Quote } from "lucide-react";
import { reportsPath } from "@/lib/config";
import type { PortfolioRun } from "@/hooks/useReportPortfolio";

const formatMonth = (month: string | null): string =>
  month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-ZA", {
        month: "long",
        year: "numeric",
      })
    : "Month not set";

const formatDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function BulletBlock({
  icon: Icon,
  label,
  items,
}: {
  icon: typeof Sparkles;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <ul className="space-y-1 text-xs leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The hover read for one report: TOBI's Page 2 assessment when the run has one,
 * otherwise the Revenue Commentary captured in that report.
 */
export function ReportHoverSummary({
  run,
  propertyName,
}: {
  run: PortfolioRun;
  propertyName: string;
}) {
  const { summary } = run;

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-tight">{propertyName}</p>
        <p className="text-xs text-muted-foreground">
          {formatMonth(run.reportMonth)} · as-of {formatDate(run.asOfDate)}
        </p>
      </div>

      {summary.kind === "assessment" && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
            TOBI Assessment
          </p>
          {summary.headline && (
            <p className="text-sm font-medium leading-snug">{summary.headline}</p>
          )}
          {summary.body && (
            <p className="text-xs leading-relaxed text-muted-foreground">{summary.body}</p>
          )}
          <BulletBlock icon={Sparkles} label="Highlights" items={summary.highlights} />
          <BulletBlock icon={AlertTriangle} label="Warnings" items={summary.warnings} />
          <BulletBlock icon={Flame} label="Red flags" items={summary.redFlags} />
        </div>
      )}

      {summary.kind === "commentary" && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Quote className="h-3 w-3" />
            Revenue Commentary
          </p>
          <p className="text-xs leading-relaxed">{summary.body}</p>
        </div>
      )}

      {summary.kind === "empty" && (
        <p className="text-xs text-muted-foreground">
          No commentary captured yet.{" "}
          <Link to={reportsPath(`/runs/${run.id}`)} className="underline">
            Open TOBI analysis
          </Link>
        </p>
      )}
    </div>
  );
}

export default ReportHoverSummary;
