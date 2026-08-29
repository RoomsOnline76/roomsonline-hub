import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorReportImportCard } from "@/components/reports/PriorReportImportCard";
import { usePropertyReportSettings } from "@/hooks/usePropertyReportSettings";
import { parseReportProfile } from "@/lib/reportProfile";
import type { RunBuilderContext } from "./types";

/** Stage C — upload the previous consolidated report workbook. */
export function StagePriorUpload({ ctx }: { ctx: RunBuilderContext }) {
  const priorFiles = ctx.run.files.filter((file) => file.fileRole === "prior_report");
  const { settings } = usePropertyReportSettings(ctx.run.propertyId);
  /**
   * When the client's comparison column is the on-the-books figure from the pack
   * we sent a year ago, there is no substitute for the workbook itself.
   */
  const stlyRequired = parseReportProfile(settings?.reportProfile ?? null)
    .stly_from_prior_workbook;

  return (
    <div className="space-y-4">
      <PriorReportImportCard
        mode="upload"
        run={ctx.run}
        onChanged={ctx.refresh}
        onRemoveFile={ctx.editable ? ctx.onRemoveFile : undefined}
      />

      <Card>
        <CardContent className="py-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={ctx.priorDeclined}
              disabled={ctx.isSavingPriorDecline || priorFiles.length > 0 || stlyRequired}
              onCheckedChange={(value) => ctx.onDeclinePrior(value === true)}
            />
            <span>
              There is no previous report workbook for this property
              <span className="block text-muted-foreground">
                {priorFiles.length > 0
                  ? "A workbook is already attached, so this run has its history."
                  : stlyRequired
                    ? "This client compares against the report sent a year ago, so that workbook has to be attached."
                    : "Required on a first run — tick this to carry on without one."}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
