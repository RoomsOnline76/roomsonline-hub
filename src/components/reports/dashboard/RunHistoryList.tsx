import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileSpreadsheet, FileText, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import { ReportHoverSummary } from "@/components/reports/dashboard/ReportHoverSummary";
import { reportsPath } from "@/lib/config";
import { sourceLabel } from "@/lib/report-adapters";
import {
  downloadRunOwnerPack,
  downloadRunWorkbook,
  type DownloadOutcome,
} from "@/lib/reports/dashboardDownloads";
import { downloadFile } from "@/lib/reportDraftHtml";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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

const formatDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Daily runs are dated to the day; reviews to the month they cover. */
export const runPeriodLabel = (run: PortfolioRun): string =>
  run.reportKind === "daily_detailed" ? formatDay(run.asOfDate) : formatRunMonth(run);

export const runLabel = (run: PortfolioRun): string =>
  `${runPeriodLabel(run)} · as-of ${formatDay(run.asOfDate)}`;

/** The report products a single run produced. */
export type RunProduct = "monthly" | "owner_pack" | "daily";

export const runProducts = (run: PortfolioRun): RunProduct[] => {
  if (run.reportKind === "daily_detailed") return ["daily"];
  const products: RunProduct[] = ["monthly"];
  if (run.specialReportCount > 0) products.push("owner_pack");
  return products;
};

export const PRODUCT_LABEL: Record<RunProduct, string> = {
  monthly: "Monthly",
  owner_pack: "Owner pack",
  daily: "Daily",
};

export const PRODUCT_GROUP_LABEL: Record<RunProduct, string> = {
  monthly: "Monthly reviews",
  owner_pack: "Owner packs",
  daily: "Daily reports",
};

const slug = (value: string): string =>
  value
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "report";

const report = (outcome: DownloadOutcome) => {
  if (!outcome.ok) {
    toast({
      title: "Nothing downloaded",
      description: outcome.message ?? "That file is not available yet.",
      variant: "destructive",
    });
  }
};

/** One run line, with the hover summary and the ways into its files. */
export function RunHistoryRow({
  run,
  propertyName,
  onQuickView,
}: {
  run: PortfolioRun;
  propertyName: string;
  onQuickView: (run: PortfolioRun) => void;
}) {
  const [busy, setBusy] = useState<"excel" | "pack" | "report" | null>(null);
  const products = runProducts(run);
  const isDaily = run.reportKind === "daily_detailed";

  const saveWorkbook = useCallback(async () => {
    setBusy("excel");
    try {
      report(
        await downloadRunWorkbook(
          run.excelPath,
          `${slug(propertyName)}-daily-detailed-${run.asOfDate}.xlsx`,
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [run.excelPath, run.asOfDate, propertyName]);

  const saveReport = useCallback(async () => {
    setBusy("report");
    try {
      if (!run.draftPath) {
        report({ ok: false, message: "No report has been generated for this run yet." });
        return;
      }
      const { data } = await supabase.storage
        .from("revenue-reports")
        .createSignedUrl(run.draftPath, 60 * 30);
      if (!data?.signedUrl) {
        report({ ok: false, message: "Could not open the report file." });
        return;
      }
      await downloadFile(
        data.signedUrl,
        `${slug(propertyName)}-${isDaily ? "daily-report" : "report"}-${run.asOfDate}.html`,
      );
    } finally {
      setBusy(null);
    }
  }, [run.draftPath, run.asOfDate, propertyName, isDaily]);

  const savePack = useCallback(async () => {
    setBusy("pack");
    try {
      report(
        await downloadRunOwnerPack(
          run.id,
          `${propertyName} - Owner Pack - ${formatDay(run.asOfDate)}`,
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [run.id, run.asOfDate, propertyName]);

  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return (
    <HoverCard openDelay={140} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div
          tabIndex={0}
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/40"
        >
          <span className="font-medium tabular-nums">{runPeriodLabel(run)}</span>
          {products.map((product) => (
            <Badge key={product} variant="outline" className="text-[11px] font-normal">
              {PRODUCT_LABEL[product]}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground truncate">
            as-of {formatDay(run.asOfDate)} · {sourceLabel(run.sourceType)}
            {run.summary.kind === "assessment" ? " · TOBI assessment" : ""}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <RunStatusPill status={run.status} />
            {isDaily && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => void saveWorkbook()}
                disabled={!run.excelPath || busy !== null}
                title={run.excelPath ? "Download the spreadsheet" : "No spreadsheet built yet"}
              >
                {busy === "excel" ? spinner : <FileSpreadsheet className="h-3.5 w-3.5" />}
                <span className="sr-only">Download spreadsheet</span>
              </Button>
            )}
            {run.specialReportCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => void savePack()}
                disabled={busy !== null}
                title="Download the owner pack"
              >
                {busy === "pack" ? spinner : <FileText className="h-3.5 w-3.5" />}
                <span className="sr-only">Download owner pack</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void saveReport()}
              disabled={!run.hasDraft || busy !== null}
              title={run.hasDraft ? "Download the report" : "No report generated yet"}
            >
              {busy === "report" ? spinner : <FileText className="h-3.5 w-3.5" />}
              <span className="sr-only">Download report</span>
            </Button>
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
