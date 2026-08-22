import { useEffect, useRef } from "react";
import { Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceFileList } from "@/components/reports/SourceFileList";
import type { RunBuilderContext } from "./types";

/** Stage A — parse the uploaded source files. Starts on its own. */
export function StageParse({ ctx }: { ctx: RunBuilderContext }) {
  const sourceFiles = ctx.run.files.filter((file) => file.fileRole !== "prior_report");
  const unparsed = sourceFiles.filter((file) => file.parsedOk !== true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!ctx.editable || ctx.isProcessing) return;
    if (sourceFiles.length === 0 || unparsed.length === 0) return;
    if (ctx.adapter.status !== "ready") return;
    started.current = true;
    ctx.onProcess();
  }, [ctx, sourceFiles.length, unparsed.length]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Source files{" "}
            <span className="font-normal text-muted-foreground">({sourceFiles.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {ctx.isProcessing
              ? (ctx.run.processingNote ?? "Reading the uploaded workbooks…")
              : unparsed.length === 0 && sourceFiles.length > 0
                ? "All uploaded files were read successfully."
                : `${unparsed.length} file(s) still need reading.`}
          </p>

          <SourceFileList
            files={ctx.run.files}
            editable={ctx.editable}
            reparsingId={ctx.reparsingId}
            onDownload={ctx.onDownload}
            onReparse={ctx.onReparse}
            onRemove={ctx.onRemoveFile}
          />

          <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-medium">{ctx.adapter.label} expected columns</p>
            <p className="text-xs text-muted-foreground">{ctx.adapter.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {ctx.adapter.getExpectedColumns().map((column) => (
                <Badge key={column} variant="outline" className="text-[11px] font-normal">
                  {column}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={ctx.onProcess}
              disabled={ctx.isProcessing || sourceFiles.length === 0}
            >
              {ctx.isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {unparsed.length === 0 ? "Parse again" : "Parse now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
