import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SnapshotTable } from "@/components/reports/SnapshotTable";
import { BookingTrendsCard } from "@/components/reports/BookingTrendsCard";
import { ManualInputsCard } from "@/components/reports/ManualInputsCard";
import { ExcludedRowsCard } from "@/components/reports/ExcludedRowsCard";
import { monthLabel } from "@/lib/historicalBaseline";
import { reportMonthAnchor, windowMonths } from "@/lib/reportWindow";
import type { RunBuilderContext } from "./types";

/**
 * Stage F — review the aggregated figures for the review window (the report
 * month plus the five ahead) and capture any additional revenue.
 */
export function StageReview({ ctx }: { ctx: RunBuilderContext }) {
  const { snapshot, run, missingMonths } = ctx;
  const anchor = reportMonthAnchor(run.asOfDate, run.reportMonth);
  const [monthDraft, setMonthDraft] = useState(anchor);
  const [savingMonth, setSavingMonth] = useState(false);

  const window = useMemo(
    () => windowMonths(run.asOfDate, run.reportMonth),
    [run.asOfDate, run.reportMonth],
  );

  const saveMonth = async () => {
    setSavingMonth(true);
    await ctx.onSetReportMonth(monthDraft);
    setSavingMonth(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Aggregate the parsed rows</p>
              <p className="text-sm text-muted-foreground">
                {snapshot
                  ? `Window ${monthLabel(window[0])} – ${monthLabel(window[window.length - 1])} from ${snapshot.totals.bookings ?? 0} booking(s).`
                  : "Run the aggregation to see revenue, room nights, ADR and occupancy."}
              </p>
            </div>
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
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-month" className="text-xs">
                Month this review is for
              </Label>
              <Input
                id="report-month"
                type="month"
                className="w-44"
                value={monthDraft}
                onChange={(event) => setMonthDraft(event.target.value)}
                disabled={!ctx.editable || savingMonth}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => void saveMonth()}
              disabled={!ctx.editable || savingMonth || monthDraft === anchor}
            >
              {savingMonth && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set month
            </Button>
            <p className="text-xs text-muted-foreground">
              The report prints this month plus the five that follow.
            </p>
          </div>
        </CardContent>
      </Card>

      {snapshot && missingMonths.length > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="flex gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">
                No data for {missingMonths.map(monthLabel).join(", ")}
              </p>
              <p className="text-muted-foreground">
                These months are inside the review window and will print as blank rows. Upload the
                missing source files, or change the month this review is for.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Aggregated results</CardTitle>
          </CardHeader>
          <CardContent>
            <SnapshotTable snapshot={snapshot} missingMonths={missingMonths} />
          </CardContent>
        </Card>
      )}

      {snapshot?.bookingTrends && (
        <BookingTrendsCard trends={snapshot.bookingTrends} months={snapshot.months} />
      )}

      {snapshot && (
        <ManualInputsCard
          runId={ctx.runId}
          sourceType={ctx.run.sourceType}
          months={snapshot.months}
          otbRevenue={snapshot.otbRevenue}
          derivedInputs={snapshot.derivedInputs}
          sections="monthly"
          onReprocess={async () => ctx.onProcess()}
          isProcessing={ctx.isProcessing}
        />
      )}

      {snapshot && <ExcludedRowsCard excludedRows={snapshot.excludedRows} />}

    </div>
  );
}
