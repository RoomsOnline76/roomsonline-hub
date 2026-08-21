import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportRun, useReportRunMutations } from "@/hooks/useReportRuns";
import { useProcessReportRun, useReportExcel, useReportSnapshot } from "@/hooks/useReportSnapshot";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import { SnapshotTable } from "@/components/reports/SnapshotTable";
import { ManualInputsCard } from "@/components/reports/ManualInputsCard";

import { FileDropZone, type DropZoneFileState } from "@/components/reports/FileDropZone";
import { formatBytes, getSourceFileUrl, uploadSourceFiles } from "@/lib/reportUpload";


const formatDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function ReportsRunReview() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, isLoading, refetch } = useReportRun(runId);
  const { deleteRun, deleteFile } = useReportRunMutations();
  const { snapshot, refetch: refetchSnapshot } = useReportSnapshot(runId);
  const { process, isProcessing } = useProcessReportRun(runId);
  const { generate, isGenerating } = useReportExcel(runId);
  const [pending, setPending] = useState<File[]>([]);
  const [fileStates, setFileStates] = useState<Record<number, DropZoneFileState>>({});
  const [busy, setBusy] = useState(false);

  usePageSEO({
    title: run?.title ? `${run.title} | Rooms Online` : "Report run | Rooms Online",
    description: "Review the uploaded source files for a revenue report run.",
    noIndex: true,
  });

  const handleProcess = useCallback(async () => {
    const result = await process();
    if (!result.ok) {
      toast.error("Processing failed", { description: result.message });
    } else {
      toast.success(`${result.rowsParsed ?? 0} booking row(s) aggregated`, {
        description: `${result.months?.length ?? 0} month(s) covered`,
      });
    }
    await Promise.all([refetch(), refetchSnapshot()]);
  }, [process, refetch, refetchSnapshot]);

  const handleExcel = useCallback(async () => {
    const result = await generate();
    if (!result.ok || !result.url) {
      toast.error("Could not build the workbook", { description: result.message });
      return;
    }
    window.open(result.url, "_blank", "noopener");
    toast.success("Consolidated workbook ready");

  }, [generate]);


  const handleUpload = useCallback(async () => {
    if (!run || pending.length === 0) return;
    setBusy(true);
    try {
      const result = await uploadSourceFiles({
        runId: run.id,
        propertyId: run.propertyId,
        files: pending,
        existingHashes: run.files.map((f) => f.fileHash ?? "").filter(Boolean),
        onProgress: ({ index, phase, message }) =>
          setFileStates((prev) => ({ ...prev, [index]: { phase, message } })),
      });
      if (result.failed.length) {
        toast.error(`${result.failed.length} file(s) failed`, {
          description: result.failed[0]?.message,
        });
      } else {
        toast.success(`${result.uploaded} file(s) added`);
      }
      setPending([]);
      setFileStates({});
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [run, pending, refetch]);

  const handleDownload = useCallback(async (storagePath: string) => {
    const url = await getSourceFileUrl(storagePath);
    if (!url) {
      toast.error("Could not create a download link");
      return;
    }
    window.open(url, "_blank", "noopener");
  }, []);

  const handleDeleteRun = useCallback(async () => {
    if (!run) return;
    try {
      await deleteRun.mutateAsync(run.id);
      toast.success("Run deleted");
      navigate("/");
    } catch (error) {
      toast.error("Could not delete the run", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [run, deleteRun, navigate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!run) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-sm font-medium">Run not found</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const editable = run.status === "draft";

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Dashboard
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {run.propertyLogoUrl ? (
            <img
              src={run.propertyLogoUrl}
              alt={`${run.propertyName ?? "Property"} logo`}
              className="h-11 w-11 rounded object-contain bg-muted"
            />
          ) : (
            <span className="h-11 w-11 rounded bg-muted flex items-center justify-center">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </span>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {run.title ?? "Revenue review"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {run.propertyName ?? "Unknown property"} · as-of {formatDate(run.asOfDate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusPill status={run.status} />
          <Badge variant="secondary" className="font-normal capitalize">
            {run.sourceType}
          </Badge>
        </div>
      </div>

      {/* ─── Stored source files ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Source files{" "}
            <span className="text-muted-foreground font-normal">({run.files.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {run.files.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              No files stored on this run yet.
            </p>
          )}
          {run.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 min-w-0 truncate font-medium">
                {file.originalFilename}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(file.byteSize)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                {file.parsedOk === null
                  ? "Not parsed yet"
                  : file.parsedOk
                    ? `${file.rowCount ?? 0} rows`
                    : "Parse failed"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => void handleDownload(file.storagePath)}
                aria-label={`Download ${file.originalFilename}`}
              >
                <Download className="h-4 w-4" />
              </Button>
              {editable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={async () => {
                    await deleteFile.mutateAsync({
                      id: file.id,
                      storagePath: file.storagePath,
                    });
                    await refetch();
                  }}
                  aria-label={`Remove ${file.originalFilename}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ─── Add more files ──────────────────────────────────── */}
      {editable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Add more files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropZone
              files={pending}
              states={fileStates}
              disabled={busy}
              onFilesAdded={(incoming) => setPending((prev) => [...prev, ...incoming])}
              onRemove={(index) => setPending((prev) => prev.filter((_, i) => i !== index))}
            />
            {pending.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={() => void handleUpload()} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Upload {pending.length} file(s)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Processing + snapshot ───────────────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Process run</p>
            <p className="text-sm text-muted-foreground">
              {snapshot
                ? `${snapshot.months.length} month(s) aggregated from ${snapshot.totals.bookings ?? 0} booking(s).`
                : "Parse the uploaded files into revenue, room nights, ADR and occupancy."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void handleProcess()} disabled={isProcessing || run.files.length === 0}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {snapshot ? "Re-process" : "Process"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExcel()}
              disabled={isGenerating || !snapshot}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Download Excel
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => void handleDeleteRun()}
              disabled={deleteRun.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete run
            </Button>
          </div>
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

      {snapshot && runId && <ManualInputsCard runId={runId} months={snapshot.months} />}



    </div>
  );
}
