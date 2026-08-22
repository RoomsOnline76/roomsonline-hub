import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorReportImportCard } from "@/components/reports/PriorReportImportCard";
import type { RunBuilderContext } from "./types";

/** Stage C — upload the previous consolidated report workbook. */
export function StagePriorUpload({ ctx }: { ctx: RunBuilderContext }) {
  const priorFiles = ctx.run.files.filter((file) => file.fileRole === "prior_report");

  return (
    <div className="space-y-4">
      <PriorReportImportCard mode="upload" run={ctx.run} onChanged={ctx.refresh} />

      <Card>
        <CardContent className="py-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={ctx.priorDeclined}
              disabled={ctx.isSavingPriorDecline || priorFiles.length > 0}
              onCheckedChange={(value) => ctx.onDeclinePrior(value === true)}
            />
            <span>
              There is no previous report workbook for this property
              <span className="block text-muted-foreground">
                {priorFiles.length > 0
                  ? "A workbook is already attached, so this run has its history."
                  : "Required on a first run — tick this to carry on without one."}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
