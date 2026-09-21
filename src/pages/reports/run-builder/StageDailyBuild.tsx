import { useEffect, useMemo, useState } from "react";
import { FileText, FileType2, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toRenderableReport } from "@/lib/reportDraftHtml";
import { downloadReportAsWord } from "@/lib/reports/wordDownload";

import { RunEventTimeline } from "@/components/reports/RunEventTimeline";
import type { RunBuilderContext } from "./types";

/** Daily stage C — build the day and take the report. */
export function StageDailyBuild({ ctx }: { ctx: RunBuilderContext }) {
  const result = ctx.dailyResult;
  const ready = Boolean(ctx.dailyFigures);
  const [storedReportUrl, setStoredReportUrl] = useState<string | undefined>();

  // A run built in an earlier session still has its report — sign it so the
  // download works without pressing Build again.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (result || ctx.run.status !== "ready") return;
      const { data } = await supabase
        .from("report_runs")
        .select("draft_report_path")
        .eq("id", ctx.runId)
        .maybeSingle();
      if (!data?.draft_report_path || cancelled) return;
      const signed = await supabase.storage
        .from("revenue-reports")
        .createSignedUrl(data.draft_report_path, 60 * 60);
      if (!cancelled) setStoredReportUrl(signed.data?.signedUrl);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx.runId, ctx.run.status, result]);

  const reportUrl = useMemo(() => result?.reportUrl ?? storedReportUrl, [result, storedReportUrl]);

  const openReport = async () => {
    if (!reportUrl) {
      toast.error("Build the day first");
      return;
    }
    const rendered = await toRenderableReport(reportUrl);
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
              {ctx.isDailyBusy && ctx.dailyProgress
                ? `Reading the day's files — ${ctx.dailyProgress.read} of ${ctx.dailyProgress.total}…`
                : result?.daysStored
                  ? `${result.daysStored} day(s) now stored for this property.`
                  : "Stores this day's figures and rebuilds the one-page report."}
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
            <p className="text-sm font-medium">Download</p>
            <p className="text-sm text-muted-foreground">
              {reportUrl
                ? "The day's report, ready to print or save as PDF, or as a Word document in the same layout."
                : ready
                  ? "Press Build to refresh the report."
                  : "Read and build the day first."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!reportUrl} onClick={() => void openReport()}>
              <FileText className="mr-2 h-4 w-4" />
              Daily report (PDF)
            </Button>
            <Button
              variant="outline"
              disabled={!reportUrl || savingWord}
              onClick={() => void saveWord()}
            >
              {savingWord ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileType2 className="mr-2 h-4 w-4" />
              )}
              Word
            </Button>
          </div>
        </CardContent>
      </Card>


      {result?.documentTitle && (
        <p className="text-xs text-muted-foreground">Saves as “{result.documentTitle}”.</p>
      )}

      <RunEventTimeline runId={ctx.runId} isLive={ctx.run.status === "processing"} />
    </div>
  );
}
