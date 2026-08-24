import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { usePageSEO } from "@/hooks/usePageSEO";
import {
  useReportRun,
  useReportRunMutations,
  CADENCE_LABEL,
  type ReportCadence,
  type ReportSourceFile,
} from "@/hooks/useReportRuns";
import { supabase } from "@/integrations/supabase/client";
import { useProcessReportRun, useReportExcel, useReportSnapshot } from "@/hooks/useReportSnapshot";
import { useReportDraft } from "@/hooks/useReportDraft";
import { useReportMedia } from "@/hooks/useReportMedia";
import { useReportInsights } from "@/hooks/useReportInsights";
import { usePropertyReportSettings } from "@/hooks/usePropertyReportSettings";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import type { DropZoneFileState } from "@/components/reports/FileDropZone";
import { getSourceFileUrl, uploadSourceFiles } from "@/lib/reportUpload";
import { getAdapter } from "@/lib/report-adapters";
import { reportsPath } from "@/lib/config";
import { monthsInWindow, windowMonths } from "@/lib/reportWindow";
import { defaultRunTitle, isGeneratedRunTitle } from "@/lib/reportTitle";
import {
  deriveStageCompletion,
  nextStage,
  previousStage,
  resumeStage,
  STAGE_META,
  type RunBuildStage,
} from "@/lib/runBuildStages";
import { StageRail } from "./run-builder/StageRail";
import { StageParse } from "./run-builder/StageParse";
import { StageMoreFiles } from "./run-builder/StageMoreFiles";
import { StagePriorUpload } from "./run-builder/StagePriorUpload";
import { StagePriorIngest } from "./run-builder/StagePriorIngest";
import { StageBaseline } from "./run-builder/StageBaseline";
import { StageReview } from "./run-builder/StageReview";
import { StageMedia } from "./run-builder/StageMedia";
import { StageOrganize } from "./run-builder/StageOrganize";
import { StageInsights } from "./run-builder/StageInsights";
import { StageBuild } from "./run-builder/StageBuild";
import type { RunBuilderContext } from "./run-builder/types";

const formatDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Guided report builder. The run walks through compartmentalised stages
 * (A parse → H build); progress is remembered on the run so a reviewer can
 * leave and come back, and any stage can be revisited without losing work.
 */
export default function ReportsRunReview() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, isLoading, refetch } = useReportRun(runId);
  const { deleteRun, deleteFile, setSpecialReportSet, setBuildStage, setPriorReportDeclined } =
    useReportRunMutations();
  const { snapshot, refetch: refetchSnapshot } = useReportSnapshot(runId);
  const { process, isProcessing } = useProcessReportRun(runId, run?.sourceType);
  const { generate, isGenerating } = useReportExcel(runId);
  const {
    generate: generateDraft,
    buildPack,
    isGenerating: isDraftBusy,
    isPacking,
  } = useReportDraft(runId);
  const { total: mediaTotal } = useReportMedia(runId, run?.sourceType);
  const { insights } = useReportInsights(runId);

  const [stage, setStage] = useState<RunBuildStage | null>(null);
  const [savingCadence, setSavingCadence] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [fileStates, setFileStates] = useState<Record<number, DropZoneFileState>>({});
  const [uploadBusy, setUploadBusy] = useState(false);
  const [reparsingId, setReparsingId] = useState<string | null>(null);

  const adapter = getAdapter(run?.sourceType);
  const { settings: propertySettings } = usePropertyReportSettings(run?.propertyId);
  const specialSet = run
    ? (run.specialReportSet ?? propertySettings?.specialReportSet ?? null)
    : null;
  /** Only Cheetah Plains properties (or runs already carrying the set) see it. */
  const ownerSlidesOffered =
    propertySettings?.specialReportSet === "cheetaplains" ||
    run?.specialReportSet === "cheetaplains";

  usePageSEO({
    title: run?.title ? `${run.title} | Rooms Online` : "Report run | Rooms Online",
    description: "Build a revenue report run stage by stage.",
    noIndex: true,
  });

  const completion = useMemo(
    () =>
      deriveStageCompletion({
        sourceFiles: (run?.files ?? [])
          .filter((file) => file.fileRole !== "prior_report")
          .map((file) => ({ parsedOk: file.parsedOk })),
        priorFiles: (run?.files ?? []).filter((file) => file.fileRole === "prior_report"),
        priorDeclined: Boolean(run?.priorReportDeclined),
        hasBaseline: Boolean(run?.previousRunId),
        hasSnapshot: Boolean(snapshot),
        hasMedia: mediaTotal > 0,
        insightsReviewed: Boolean(insights?.generatedAt),
      }),
    [run, snapshot, mediaTotal, insights],
  );

  /** Land on the remembered stage the first time the run loads. */
  useEffect(() => {
    if (!run || stage) return;
    setStage(resumeStage(run.buildStage, completion));
  }, [run, stage, completion]);

  /**
   * Everything downstream sees the review month plus five ahead — every one of
   * them, so a month with no uploaded extract shows as a gap rather than
   * disappearing from the review.
   */
  const windowedSnapshot = useMemo(() => {
    if (!snapshot || !run) return snapshot ?? null;
    return { ...snapshot, months: windowMonths(run.asOfDate, run.reportMonth) };
  }, [snapshot, run]);

  /** Window months the parsed sources did not cover. */
  const missingMonths = useMemo(() => {
    if (!snapshot || !run) return [] as string[];
    const present = new Set(monthsInWindow(snapshot.months, run.asOfDate, run.reportMonth));
    return windowMonths(run.asOfDate, run.reportMonth).filter((key) => !present.has(key));
  }, [snapshot, run]);

  /** The month the review covers — the anchor for the six-month window. */
  const handleSetReportMonth = useCallback(
    async (month: string) => {
      if (!runId || !/^\d{4}-\d{2}$/.test(month)) return;
      const { error } = await supabase
        .from("report_runs")
        .update({ report_month: `${month}-01` })
        .eq("id", runId);
      if (error) {
        toast.error("Could not change the report month", { description: error.message });
        return;
      }
      await refetch();
      toast.success("Report month updated", {
        description: "Re-process the run so the window and figures line up.",
      });
    },
    [runId, refetch],
  );

  /**
   * Stage A reset: the run's as-of date. It decides the OTB column read from a
   * previous report and anchors the window, so the baseline import and parse
   * both have to be re-run afterwards.
   */
  const handleSetAsOfDate = useCallback(
    async (isoDate: string) => {
      if (!runId || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;
      const patch: { as_of_date: string; title?: string } = { as_of_date: isoDate };
      // A title we generated tracks the date; a hand-written one is left alone.
      if (run && isGeneratedRunTitle(run.title, run.asOfDate)) {
        patch.title = defaultRunTitle(isoDate, run.cadence);
      }
      const { error } = await supabase.from("report_runs").update(patch).eq("id", runId);
      if (error) {
        toast.error("Could not change the report date", { description: error.message });
        return;
      }
      await refetch();
      toast.success("Report date updated", {
        description: "Parse again and re-read the previous report so the baseline matches.",
      });
    },
    [runId, refetch, run],
  );


  const goToStage = useCallback(
    (next: RunBuildStage) => {
      setStage(next);
      if (runId) void setBuildStage.mutateAsync({ runId, stage: next }).catch(() => undefined);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [runId, setBuildStage],
  );

  const refresh = useCallback(async () => {
    await Promise.all([refetch(), refetchSnapshot()]);
  }, [refetch, refetchSnapshot]);

  /** Cadence drives the printed wording, so the draft is stale after a change. */
  const setCadence = useCallback(
    async (cadence: ReportCadence) => {
      if (!runId) return;
      setSavingCadence(true);
      const patch: { cadence: ReportCadence; title?: string } = { cadence };
      if (run && isGeneratedRunTitle(run.title, run.asOfDate)) {
        patch.title = defaultRunTitle(run.asOfDate, cadence);
      }
      const { error } = await supabase.from("report_runs").update(patch).eq("id", runId);
      setSavingCadence(false);
      if (error) {
        toast.error("Could not change the cadence", { description: error.message });
        return;
      }
      await refetch();
      toast.success(`${CADENCE_LABEL[cadence]} review`, {
        description: "Regenerate the draft to update the printed wording.",
      });
    },
    [runId, refetch, run],
  );

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
    await refresh();
  }, [process, refresh]);

  const handleDraft = useCallback(async () => {
    const result = await generateDraft();
    if (result.ok && result.url) {
      setDraftUrl(result.url);
      setDraftTitle(result.documentTitle ?? null);
    }
    return result;
  }, [generateDraft]);

  const handleUpload = useCallback(async () => {
    if (!run || pending.length === 0) return;
    setUploadBusy(true);
    try {
      const result = await uploadSourceFiles({
        runId: run.id,
        propertyId: run.propertyId,
        files: pending,
        acceptedExtensions: adapter.acceptedFileTypes,
        existingHashes: run.files
          .filter((f) => f.fileRole !== "prior_report")
          .map((f) => f.fileHash ?? "")
          .filter(Boolean),
        onProgress: ({ index, phase, message }) =>
          setFileStates((prev) => ({ ...prev, [index]: { phase, message } })),
      });
      if (result.failed.length) {
        toast.error(`${result.failed.length} file(s) failed`, {
          description: result.failed[0]?.message,
        });
      } else if (result.uploaded === 0 && result.skipped.length) {
        toast.info(`${result.skipped.length} file(s) already on this run`, {
          description: "Identical files were skipped — nothing new was added.",
        });
      } else {
        toast.success(`${result.uploaded} file(s) added`, {
          description: result.skipped.length
            ? `${result.skipped.length} duplicate(s) skipped`
            : undefined,
        });
      }
      setPending([]);
      setFileStates({});
      await refetch();
      if (result.uploaded) await handleProcess();
    } finally {
      setUploadBusy(false);
    }
  }, [run, pending, refetch, adapter, handleProcess]);

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
        await refresh();
      } finally {
        setReparsingId(null);
      }
    },
    [process, refresh],
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
      navigate(reportsPath("/"));
    } catch (error) {
      toast.error("Could not delete the run", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [run, deleteRun, navigate]);

  const handleToggleExtras = useCallback(
    async (enabled: boolean) => {
      if (!runId) return;
      await setSpecialReportSet.mutateAsync({
        runId,
        value: enabled ? "cheetaplains" : null,
      });
      await refetch();
    },
    [runId, setSpecialReportSet, refetch],
  );

  const handleDeclinePrior = useCallback(
    async (value: boolean) => {
      if (!runId) return;
      await setPriorReportDeclined.mutateAsync({ runId, value });
      await refetch();
    },
    [runId, setPriorReportDeclined, refetch],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!run || !runId) {
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <p className="text-sm font-medium">Run not found</p>
          <Button asChild variant="outline" size="sm">
            <Link to={reportsPath("/")}>Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currentStage: RunBuildStage = stage ?? "parse";
  const meta = STAGE_META[currentStage];
  const back = previousStage(currentStage);
  const forward = nextStage(currentStage);

  const ctx: RunBuilderContext = {
    run,
    runId,
    adapter,
    snapshot: windowedSnapshot ?? null,
    missingMonths,
    onSetReportMonth: handleSetReportMonth,
    onSetAsOfDate: handleSetAsOfDate,
    // A finished ("ready") run stays editable: reviewers routinely swap a file
    // or correct the report date and rebuild. Only archived runs are locked.
    editable: run.status === "draft" || run.status === "ready",
    refresh,
    reparsingId,
    onDownload: (path) => void handleDownload(path),
    onReparse: (file) => void handleReparse(file),
    onRemoveFile: (file) => void handleRemoveFile(file),
    pending,
    fileStates,
    uploadBusy,
    addPending: (files) => setPending((prev) => [...prev, ...files]),
    removePending: (index) => setPending((prev) => prev.filter((_, i) => i !== index)),
    onUpload: () => void handleUpload(),
    onProcess: () => void handleProcess(),
    isProcessing,
    onExcel: generate,
    onDraft: handleDraft,
    onPack: buildPack,
    isExcelBusy: isGenerating,
    isDraftBusy,
    isPackBusy: isPacking,
    draftUrl,
    draftTitle,
    onDeleteRun: () => void handleDeleteRun(),
    isDeleting: deleteRun.isPending,
    priorDeclined: run.priorReportDeclined,
    onDeclinePrior: (value) => void handleDeclinePrior(value),
    isSavingPriorDecline: setPriorReportDeclined.isPending,
    ownerSlidesOffered,
    ownerSlidesEnabled: specialSet === "cheetaplains",
    onToggleOwnerSlides: (enabled) => void handleToggleExtras(enabled),
    isTogglingOwnerSlides: setSpecialReportSet.isPending,
  };

  const stageView = {
    parse: <StageParse ctx={ctx} />,
    more_files: <StageMoreFiles ctx={ctx} />,
    prior_upload: <StagePriorUpload ctx={ctx} />,
    prior_ingest: <StagePriorIngest ctx={ctx} />,
    baseline: <StageBaseline ctx={ctx} />,
    review: <StageReview ctx={ctx} />,
    media: <StageMedia ctx={ctx} />,
    organize: <StageOrganize ctx={ctx} />,
    insights: <StageInsights ctx={ctx} />,
    build: <StageBuild ctx={ctx} />,
  }[currentStage];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={reportsPath("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {run.propertyLogoUrl ? (
            <img
              src={run.propertyLogoUrl}
              alt={`${run.propertyName ?? "Property"} logo`}
              className="h-11 w-11 rounded bg-muted object-contain"
            />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </span>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isGeneratedRunTitle(run.title, run.asOfDate)
                ? defaultRunTitle(run.asOfDate, run.cadence)
                : run.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {run.propertyName ?? "Unknown property"} · as-of {formatDate(run.asOfDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            {(["monthly", "bimonthly"] as ReportCadence[]).map((option) => (
              <button
                key={option}
                type="button"
                disabled={savingCadence}
                onClick={() => void setCadence(option)}
                className={
                  "px-3 py-1.5 text-xs transition-colors " +
                  (run.cadence === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted")
                }
              >
                {CADENCE_LABEL[option]}
              </button>
            ))}
          </div>
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

      <StageRail stage={currentStage} completion={completion} onSelect={goToStage} />

      <div className="space-y-1">
        <h2 className="text-lg font-medium">
          Step {meta.letter} · {meta.label}
          {meta.optional && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{meta.blurb}</p>
      </div>

      {stageView}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          variant="outline"
          disabled={!back}
          onClick={() => back && goToStage(back)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {forward && (
          <Button onClick={() => goToStage(forward)}>
            Continue to {STAGE_META[forward].label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
