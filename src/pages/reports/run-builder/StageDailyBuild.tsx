import { FileSpreadsheet, FileText, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { downloadFile, toRenderableReport } from "@/lib/reportDraftHtml";
import { RunEventTimeline } from "@/components/reports/RunEventTimeline";
import type { RunBuilderContext } from "./types";

/** Daily stage C — build the day into the workbook and take both downloads. */
export function StageDailyBuild({ ctx }: { ctx: RunBuilderContext }) {
  const result = ctx.dailyResult;
  const ready = Boolean(ctx.dailyFigures);

  const openReport = async () => {
    const url = result?.reportUrl;
    if (!url) {
      toast.error("Build the day first");
      return;
    }
    const rendered = await toRenderableReport(url);
    const tab = window.open(rendered.url, "_blank", "noopener");
    if (!tab) toast.error("Allow pop-ups to open the report");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Build the day</p>
            <p className="text-sm text-muted-foreground">
              {result?.daysInWorkbook
                ? `${result.daysInWorkbook} day(s) now in this property's running workbook.`
                : "Adds this day to the running workbook and rebuilds the one-page report."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={ctx.onDailyBuild} disabled={ctx.isDailyBusy}>
              {ctx.isDailyBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {result ? "Rebuild" : "Build"}
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={ctx.onDeleteRun}
              disabled={ctx.isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete run
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Downloads</p>
            <p className="text-sm text-muted-foreground">
              {result?.excelUrl
                ? "The running workbook with this day added, and the day's report to print or save as PDF."
                : ready
                  ? "Press Build to refresh both files."
                  : "Read and build the day first."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={!result?.excelUrl}
              onClick={() => {
                if (result?.excelUrl) void downloadFile(result.excelUrl);
              }}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Daily workbook (.xlsx)
            </Button>
            <Button disabled={!result?.reportUrl} onClick={() => void openReport()}>
              <FileText className="mr-2 h-4 w-4" />
              Daily report (PDF)
            </Button>
          </div>
        </CardContent>
      </Card>

      {result?.documentTitle && (
        <p className="text-xs text-muted-foreground">
          Saves as “{result.documentTitle}”.
        </p>
      )}

      <RunEventTimeline runId={ctx.runId} isLive={ctx.run.status === "processing"} />
    </div>
  );
}
