import { Card, CardContent } from "@/components/ui/card";
import { PriorReportImportCard } from "@/components/reports/PriorReportImportCard";
import type { RunBuilderContext } from "./types";

/** Stage D — read the workbook and choose which figures to absorb. */
export function StagePriorIngest({ ctx }: { ctx: RunBuilderContext }) {
  const priorFiles = ctx.run.files.filter((file) => file.fileRole === "prior_report");

  if (priorFiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No previous report workbook attached — nothing to ingest. Go back a step to upload one.
        </CardContent>
      </Card>
    );
  }

  return <PriorReportImportCard mode="ingest" run={ctx.run} onChanged={ctx.refresh} />;
}
