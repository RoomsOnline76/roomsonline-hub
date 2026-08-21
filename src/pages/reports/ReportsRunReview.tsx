import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Building2, Loader2, Play, Trash2 } from "lucide-react";
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
import { BaselineCard } from "@/components/reports/BaselineCard";
import { DownloadBar } from "@/components/reports/DownloadBar";
import { AiInsightsPanel } from "@/components/reports/AiInsightsPanel";
import { DraftReportPreview } from "@/components/reports/DraftReportPreview";
import { useReportDraft } from "@/hooks/useReportDraft";
import { SourceFileList } from "@/components/reports/SourceFileList";
import { RunEventTimeline } from "@/components/reports/RunEventTimeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ReportSourceFile } from "@/hooks/useReportRuns";


import { FileDropZone, type DropZoneFileState } from "@/components/reports/FileDropZone";
import { getSourceFileUrl, uploadSourceFiles } from "@/lib/reportUpload";
import { getAdapter } from "@/lib/report-adapters";
import { SpecialReportsCard } from "@/components/reports/SpecialReportsCard";
import { usePropertyReportSettings } from "@/hooks/usePropertyReportSettings";


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
  const { process, isProcessing } = useProcessReportRun(runId, run?.sourceType);
  const { generate, isGenerating } = useReportExcel(runId);
  const {
    generate: generateDraft,
    buildPack,
    isGenerating: isDraftBusy,
    isPacking,
  } = useReportDraft(runId);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [fileStates, setFileStates] = useState<Record<number, DropZoneFileState>>({});
  const [busy, setBusy] = useState(false);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  /** Source-specific behaviour (parser, expected columns, template). */
  const adapter = getAdapter(run?.sourceType);
  /** CheetaPlains and friends add bespoke slides to the standard pack. */
  const { settings: propertySettings } = usePropertyReportSettings(run?.propertyId);
  const specialSet = propertySettings?.specialReportSet ?? null;



  usePageSEO({
    title: run?.title ? `${run.title} | Rooms Online` : "Report run | Rooms Online",
    description: "Review the uploaded source files for a revenue report run.",
    noIndex: true,
  });

  const handleProcess = useCallback(async () => {
    const result = await process();
    if (!result.ok) {
      if (result.partial) {
        toast.warning("Processing incomplete", {
          description: `${result.message} — press Process again to continue.`,
        });
      } else {
        toast.error("Processing failed", { description: result.message });
      }
    } else {
      toast.success(`${result.rowsParsed ?? 0} booking row(s) aggregated`, {
        description: `${result.months?.length ?? 0} month(s) covered`,
      });
    }
    await Promise.all([refetch(), refetchSnapshot()]);
  }, [process, refetch, refetchSnapshot]);

  const handleDraft = useCallback(async () => {
    const result = await generateDraft();
    if (result.ok && result.url) setDraftUrl(result.url);
    return result;
  }, [generateDraft]);


  const handleUpload = useCallback(async () => {
    if (!run || pending.length === 0) return;
    setBusy(true);
    try {
      const result = await uploadSourceFiles({
        runId: run.id,
        propertyId: run.propertyId,
        files: pending,
        acceptedExtensions: adapter.acceptedFileTypes,
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
  }, [run, pending, refetch, adapter]);

  const handleDownload = useCallback(async (storagePath: string) => {
    const url = await getSourceFileUrl(storagePath);
    if (!url) {
      toast.error("Could not create a download link");
      return;
    }
    window.open(url, "_blank", "noopener");
  }, []);

  const handleReparse = useCallback(
    async (file: ReportSourceFile) => {
      setReparsingId(file.id);
      try {
        const result = await process(file.id);
        if (result.ok) {
          toast.success(`${file.originalFilename} re-parsed`, {
            description: `${result.rowsParsed ?? 0} row(s) read. Re-process the run to refresh totals.`,
          });
        } else {
          toast.error(`${file.originalFilename} could not be parsed`, {
            description: result.message,
          });
        }
        await Promise.all([refetch(), refetchSnapshot()]);
      } finally {
        setReparsingId(null);
      }
    },
    [process, refetch, refetchSnapshot],
  );

  const handleRemoveFile = useCallback(
    async (file: ReportSourceFile) => {
      try {
        await deleteFile.mutateAsync({
          id: file.id,
          storagePath: file.storagePath,
          runId: file.runId,
          filename: file.originalFilename,
        });
        toast.success(`${file.originalFilename} removed`);
        await refetch();
      } catch (error) {
        toast.error("Could not remove the file", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [deleteFile, refetch],
  );

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
          <Badge variant="secondary" className="font-normal">
            {adapter.label}
          </Badge>
        </div>
      </div>

      {adapter.status !== "ready" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{adapter.label} runs cannot be processed yet</AlertTitle>
          <AlertDescription>{adapter.notes}</AlertDescription>
        </Alert>
      )}

      {run.status === "failed" && run.errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Last processing attempt did not finish</AlertTitle>
          <AlertDescription>{run.errorMessage}</AlertDescription>
        </Alert>
      )}

      {run.status === "processing" && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Processing</AlertTitle>
          <AlertDescription>
            {run.processingNote ?? "Reading the uploaded workbooks…"}
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Stored source files ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Source files{" "}
            <span className="text-muted-foreground font-normal">({run.files.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SourceFileList
            files={run.files}
            editable={editable}
            reparsingId={reparsingId}
            onDownload={(path) => void handleDownload(path)}
            onReparse={(file) => void handleReparse(file)}
            onRemove={(file) => void handleRemoveFile(file)}
          />
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-medium">{adapter.label} expected columns</p>
            <p className="text-xs text-muted-foreground">{adapter.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {adapter.getExpectedColumns().map((column) => (
                <Badge key={column} variant="outline" className="font-normal text-[11px]">
                  {column}
                </Badge>
              ))}
            </div>
          </div>
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
              acceptedExtensions={adapter.acceptedFileTypes}
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

      <DownloadBar
        hasSnapshot={Boolean(snapshot)}
        isExcelBusy={isGenerating}
        isDraftBusy={isDraftBusy}
        isPackBusy={isPacking}
        onExcel={generate}
        onDraft={handleDraft}
        onPack={buildPack}
      />

      {snapshot && (
        <DraftReportPreview
          url={draftUrl}
          isGenerating={isDraftBusy}
          onGenerate={() => void handleDraft()}
          pageCount={Object.keys(snapshot.sourceBreakdown ?? {}).length > 0 ? 5 : 4}
        />
      )}

      <BaselineCard run={run} onChanged={async () => { await refetch(); }} />

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

      {snapshot && runId && <AiInsightsPanel runId={runId} />}

      {snapshot && runId && (
        <ManualInputsCard
          runId={runId}
          months={snapshot.months}
          otbRevenue={snapshot.otbRevenue}
          onReprocess={handleProcess}
          isProcessing={isProcessing}
        />
      )}

      {specialSet === "cheetaplains" && runId && <SpecialReportsCard runId={runId} />}

      <RunEventTimeline runId={runId} isLive={run.status === "processing"} />
    </div>

  );
}
