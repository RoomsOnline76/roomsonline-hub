import { useCallback, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Search, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileDropZone, type DropZoneFileState } from "@/components/reports/FileDropZone";
import { uploadSourceFiles } from "@/lib/reportUpload";
import {
  useReportPriorImport,
  type PriorImportSelections,
} from "@/hooks/useReportPriorImport";
import type { ReportRunDetail } from "@/hooks/useReportRuns";

const PRIOR_EXTENSIONS = [".xlsx", ".xls"] as const;

const formatDate = (iso: string | null): string =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "not found";

interface Props {
  run: ReportRunDetail;
  onChanged: () => void | Promise<void>;
}

/**
 * First-run helper: read the property's existing consolidated revenue report
 * workbook (the one the owner already receives) and use it to fill the gaps a
 * first run has no history for — previous OTB, last-year actuals, the manual
 * monthly inputs and the multi-year historical baseline.
 */
export function PriorReportImportCard({ run, onChanged }: Props) {
  const { inspect, apply, preview, isWorking } = useReportPriorImport(run.id);
  const [pending, setPending] = useState<File[]>([]);
  const [states, setStates] = useState<Record<number, DropZoneFileState>>({});
  const [uploading, setUploading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [selections, setSelections] = useState<PriorImportSelections>({
    previousOtb: true,
    lastYear: true,
    additionalInputs: true,
    historical: true,
  });

  const priorFiles = useMemo(
    () => run.files.filter((file) => file.fileRole === "prior_report"),
    [run.files],
  );

  const handleUpload = useCallback(async () => {
    if (!pending.length) return;
    setUploading(true);
    try {
      const result = await uploadSourceFiles({
        runId: run.id,
        propertyId: run.propertyId,
        files: pending,
        fileRole: "prior_report",
        acceptedExtensions: PRIOR_EXTENSIONS,
        existingHashes: run.files.map((file) => file.fileHash ?? "").filter(Boolean),
        onProgress: ({ index, phase, message }) =>
          setStates((prev) => ({ ...prev, [index]: { phase, message } })),
      });
      if (result.failed.length) {
        toast.error("Some files were not stored", {
          description: result.failed.map((f) => `${f.filename}: ${f.message}`).join("; "),
        });
      }
      if (result.uploaded) {
        setPending([]);
        setStates({});
        toast.success(`${result.uploaded} previous report workbook(s) stored`);
        await onChanged();
        const read = await inspect();
        if (!read.ok) {
          toast.error("Could not read the workbook", { description: read.message });
        }
      }
    } finally {
      setUploading(false);
    }
  }, [inspect, onChanged, pending, run.files, run.id, run.propertyId]);

  const handleInspect = useCallback(async () => {
    const result = await inspect();
    if (!result.ok) {
      toast.error("Could not read the workbook", { description: result.message });
      return;
    }
    toast.success("Workbook read", {
      description: `As-of ${formatDate(result.preview?.asOfDate ?? null)} · ${result.preview?.months.length ?? 0} month(s).`,
    });
  }, [inspect]);

  const handleApply = useCallback(async () => {
    const result = await apply(selections, replaceExisting);
    if (!result.ok) {
      toast.error("Import failed", { description: result.message });
      return;
    }
    toast.success("Previous report imported", {
      description: result.summary?.length
        ? `${result.summary.join(", ")}. Re-process the run to see it in the table.`
        : "Re-process the run to refresh the comparison columns.",
    });
    await onChanged();
  }, [apply, onChanged, replaceExisting, selections]);

  const found = preview?.found;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Previous report workbook
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {run.previousRunId
            ? "This run already has an earlier run as its baseline. Importing a previous workbook overrides it."
            : "This is the property's first run, so there is no previous run to compare against. Upload the consolidated revenue report the owner currently receives and its figures will fill the gaps."}
        </p>

        {priorFiles.length > 0 && (
          <div className="space-y-1.5">
            {priorFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="truncate">{file.originalFilename}</span>
                <Badge variant="outline" className="font-normal text-[11px]">
                  baseline import
                </Badge>
              </div>
            ))}
          </div>
        )}

        <FileDropZone
          files={pending}
          states={states}
          disabled={uploading || isWorking}
          acceptedExtensions={[...PRIOR_EXTENSIONS]}
          onFilesAdded={(incoming) => setPending((prev) => [...prev, ...incoming])}
          onRemove={(index) => setPending((prev) => prev.filter((_, i) => i !== index))}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleUpload()} disabled={!pending.length || uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload &amp; read
          </Button>
          {priorFiles.length > 0 && (
            <Button variant="outline" onClick={() => void handleInspect()} disabled={isWorking}>
              {isWorking ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Read again
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-normal">
                {preview.otbColumnLabel ?? `OTB @ ${formatDate(preview.asOfDate)}`}
              </Badge>
              <span className="text-muted-foreground">
                Sheets read: {preview.sheetsRead.join(", ") || "none"}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={selections.previousOtb}
                  onCheckedChange={(value) =>
                    setSelections((prev) => ({ ...prev, previousOtb: value === true }))
                  }
                />
                <span>
                  Previous OTB revenue &amp; room nights
                  <span className="text-muted-foreground"> — {found?.previous_otb_months ?? 0} month(s)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={selections.lastYear}
                  onCheckedChange={(value) =>
                    setSelections((prev) => ({ ...prev, lastYear: value === true }))
                  }
                />
                <span>
                  Last-year actuals
                  <span className="text-muted-foreground"> — {found?.last_year_months ?? 0} month(s)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={selections.additionalInputs}
                  onCheckedChange={(value) =>
                    setSelections((prev) => ({ ...prev, additionalInputs: value === true }))
                  }
                />
                <span>
                  Manual monthly inputs
                  <span className="text-muted-foreground">
                    {" "}
                    — dinner {found?.dinner_months ?? 0}, other {found?.room0_months ?? 0}, comp{" "}
                    {found?.comp_months ?? 0}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={selections.historical}
                  onCheckedChange={(value) =>
                    setSelections((prev) => ({ ...prev, historical: value === true }))
                  }
                />
                <span>
                  Historical baseline (property settings)
                  <span className="text-muted-foreground">
                    {" "}
                    — {found?.historical_revenue_months ?? 0} month(s) revenue
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 pt-1">
                <Checkbox
                  checked={replaceExisting}
                  onCheckedChange={(value) => setReplaceExisting(value === true)}
                />
                <span>
                  Overwrite values already captured
                  <span className="text-muted-foreground"> — off keeps existing figures</span>
                </span>
              </label>
            </div>

            {preview.warnings.length > 0 && (
              <Alert>
                <AlertTitle className="text-xs">Not everything could be read</AlertTitle>
                <AlertDescription className="text-xs">
                  {preview.warnings.join(" ")}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button onClick={() => void handleApply()} disabled={isWorking}>
                {isWorking ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Import selected
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
