import { Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SnapshotTable } from "@/components/reports/SnapshotTable";
import { ManualInputsCard } from "@/components/reports/ManualInputsCard";
import { AiInsightsPanel } from "@/components/reports/AiInsightsPanel";
import { DownloadBar } from "@/components/reports/DownloadBar";
import { DraftReportPreview } from "@/components/reports/DraftReportPreview";
import { RunEventTimeline } from "@/components/reports/RunEventTimeline";
import { reportsPath } from "@/lib/config";
import type { RunBuilderContext } from "./types";

/** Stage H — process the run, review the figures and take the downloads. */
export function StageBuild({ ctx }: { ctx: RunBuilderContext }) {
  const { snapshot } = ctx;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Process run</p>
            <p className="text-sm text-muted-foreground">
              {snapshot
                ? `${snapshot.months.length} month(s) aggregated from ${snapshot.totals.bookings ?? 0} booking(s).`
                : "Aggregate the parsed rows into revenue, room nights, ADR and occupancy."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={ctx.onProcess}
              disabled={ctx.isProcessing || ctx.run.files.length === 0}
            >
              {ctx.isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {snapshot ? "Re-process" : "Process"}
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

      <DownloadBar
        hasSnapshot={Boolean(snapshot)}
        isExcelBusy={ctx.isExcelBusy}
        isDraftBusy={ctx.isDraftBusy}
        isPackBusy={ctx.isPackBusy}
        onExcel={ctx.onExcel}
        onDraft={ctx.onDraft}
        onPack={ctx.onPack}
      />

      {snapshot && (
        <DraftReportPreview
          url={ctx.draftUrl}
          documentTitle={ctx.draftTitle}
          viewerHref={reportsPath(`/runs/${ctx.runId}/draft`)}
          isGenerating={ctx.isDraftBusy}
          onGenerate={ctx.onDraft}
          pageCount={Object.keys(snapshot.sourceBreakdown ?? {}).length > 0 ? 5 : 4}
        />
      )}

      {snapshot && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Aggregated results</CardTitle>
          </CardHeader>
          <CardContent>
            <SnapshotTable snapshot={snapshot} />
          </CardContent>
        </Card>
      )}

      {snapshot && <AiInsightsPanel runId={ctx.runId} />}

      {snapshot && (
        <ManualInputsCard
          runId={ctx.runId}
          sourceType={ctx.run.sourceType}
          months={snapshot.months}
          otbRevenue={snapshot.otbRevenue}
          onReprocess={async () => ctx.onProcess()}
          isProcessing={ctx.isProcessing}
        />
      )}

      <RunEventTimeline runId={ctx.runId} isLive={ctx.run.status === "processing"} />
    </div>
  );
}
