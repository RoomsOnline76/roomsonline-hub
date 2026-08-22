import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SnapshotTable } from "@/components/reports/SnapshotTable";
import { ManualInputsCard } from "@/components/reports/ManualInputsCard";
import type { RunBuilderContext } from "./types";

/**
 * Stage F — review the aggregated figures for the review window (the report
 * month plus the five ahead) and capture any additional revenue.
 */
export function StageReview({ ctx }: { ctx: RunBuilderContext }) {
  const { snapshot } = ctx;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Aggregate the parsed rows</p>
            <p className="text-sm text-muted-foreground">
              {snapshot
                ? `${snapshot.months.length} month(s) in the review window from ${snapshot.totals.bookings ?? 0} booking(s).`
                : "Run the aggregation to see revenue, room nights, ADR and occupancy."}
            </p>
          </div>
          <Button onClick={ctx.onProcess} disabled={ctx.isProcessing || ctx.run.files.length === 0}>
            {ctx.isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {snapshot ? "Re-process" : "Process"}
          </Button>
        </CardContent>
      </Card>

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

      {snapshot && (
        <ManualInputsCard
          runId={ctx.runId}
          sourceType={ctx.run.sourceType}
          months={snapshot.months}
          otbRevenue={snapshot.otbRevenue}
          sections="monthly"
          onReprocess={async () => ctx.onProcess()}
          isProcessing={ctx.isProcessing}
        />
      )}
    </div>
  );
}
