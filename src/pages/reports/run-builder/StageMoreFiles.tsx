import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDropZone } from "@/components/reports/FileDropZone";
import { SourceFileList } from "@/components/reports/SourceFileList";
import type { RunBuilderContext } from "./types";

/** Stage B — add any remaining exports and read them straight away. */
export function StageMoreFiles({ ctx }: { ctx: RunBuilderContext }) {
  const sourceFiles = ctx.run.files.filter((file) => file.fileRole !== "prior_report");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Any more source files?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {ctx.editable
            ? "Drop in anything still missing for this period — extras, second properties, corrected exports. Skip ahead if the list is complete."
            : "This run is no longer editable, so files cannot be added."}
        </p>

        {ctx.editable && (
          <>
            <FileDropZone
              files={ctx.pending}
              states={ctx.fileStates}
              disabled={ctx.uploadBusy}
              acceptedExtensions={ctx.adapter.acceptedFileTypes}
              onFilesAdded={ctx.addPending}
              onRemove={ctx.removePending}
            />
            {ctx.pending.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={ctx.onUpload} disabled={ctx.uploadBusy}>
                  {ctx.uploadBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload {ctx.pending.length} file(s)
                </Button>
              </div>
            )}
          </>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            On this run ({sourceFiles.length})
          </p>
          <SourceFileList
            files={ctx.run.files}
            editable={ctx.editable}
            reparsingId={ctx.reparsingId}
            onDownload={ctx.onDownload}
            onReparse={ctx.onReparse}
            onRemove={ctx.onRemoveFile}
          />
        </div>
      </CardContent>
    </Card>
  );
}
