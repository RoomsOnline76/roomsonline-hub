import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatBytes } from "@/lib/reportUpload";
import type { ReportSourceFile } from "@/hooks/useReportRuns";

interface SourceFileListProps {
  files: ReportSourceFile[];
  editable: boolean;
  reparsingId: string | null;
  onDownload: (storagePath: string) => void;
  onReparse: (file: ReportSourceFile) => void;
  onRemove: (file: ReportSourceFile) => void;
}

const statusText = (file: ReportSourceFile): string => {
  if (file.parseStatus === "needs_mapping") return "Needs column mapping";
  if (file.parsedOk === null) return "Not parsed yet";
  return file.parsedOk ? `${file.rowCount ?? 0} rows` : "Parse failed";
};


/** Stored source files with parse outcome, errors and per-file retry. */
export function SourceFileList({
  files,
  editable,
  reparsingId,
  onDownload,
  onReparse,
  onRemove,
}: SourceFileListProps) {
  const [openErrors, setOpenErrors] = useState<Record<string, boolean>>({});

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No files stored on this run yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => {
        const errors = file.parseErrors ?? [];
        const failed = file.parsedOk === false;
        return (
          <div
            key={file.id}
            className={`rounded-md border px-3 py-2 text-sm ${failed ? "border-destructive/50" : ""}`}
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet
                className={`h-4 w-4 shrink-0 ${failed ? "text-destructive" : "text-muted-foreground"}`}
              />
              <span className="flex-1 min-w-0 truncate font-medium">{file.originalFilename}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(file.byteSize)}
              </span>
              <span
                className={`text-xs shrink-0 hidden sm:inline ${
                  failed ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {statusText(file)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onReparse(file)}
                disabled={reparsingId === file.id}
                aria-label={`Re-parse ${file.originalFilename}`}
                title="Re-parse this file"
              >
                {reparsingId === file.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onDownload(file.storagePath)}
                aria-label={`Download ${file.originalFilename}`}
              >
                <Download className="h-4 w-4" />
              </Button>
              {editable && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      aria-label={`Remove ${file.originalFilename}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this file?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {file.originalFilename} will be deleted from storage. Re-process the run
                        afterwards so the totals match the remaining files.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep file</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemove(file)}>
                        Remove file
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {errors.length > 0 && (
              <Collapsible
                open={Boolean(openErrors[file.id])}
                onOpenChange={(open) =>
                  setOpenErrors((prev) => ({ ...prev, [file.id]: open }))
                }
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1.5 text-xs text-destructive hover:underline"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {errors.length} issue{errors.length === 1 ? "" : "s"} recorded
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        openErrors[file.id] ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-2 space-y-1 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {errors.map((message, i) => (
                      <li key={i} className="break-words">
                        {message}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        );
      })}
    </div>
  );
}
