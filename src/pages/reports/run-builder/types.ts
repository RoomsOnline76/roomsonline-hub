import type { ReportRunDetail, ReportSourceFile } from "@/hooks/useReportRuns";
import type { ReportSnapshot, ExcelResult } from "@/hooks/useReportSnapshot";
import type { ReportSourceAdapter } from "@/lib/report-adapters";
import type { DropZoneFileState } from "@/components/reports/FileDropZone";
import type { DailyBuildResult, DailyFigures } from "@/hooks/useDailyDetailedReport";


/**
 * Everything the stage screens need. The shell owns the hooks and hands this
 * down so each stage stays a thin, focused view.
 */
export interface RunBuilderContext {
  run: ReportRunDetail;
  runId: string;
  adapter: ReportSourceAdapter;
  snapshot: ReportSnapshot | null;
  /** Window months the uploads did not cover. */
  missingMonths: string[];
  /** Printed window shape from the property's report profile (length / start). */
  windowOptions: { months?: number | null; startOffset?: number | null };
  /** `YYYY-MM` the review covers, editable in the review stage. */
  onSetReportMonth: (month: string) => Promise<void>;
  /** `YYYY-MM-DD` the run is taken as-of, editable in stage A. */
  onSetAsOfDate: (isoDate: string) => Promise<void>;
  editable: boolean;

  refresh: () => Promise<void>;

  /* Stage A/B — source files */
  reparsingId: string | null;
  onDownload: (storagePath: string) => void;
  onReparse: (file: ReportSourceFile) => void;
  /** Re-parses one file with a reviewer-confirmed column mapping. */
  onApplyMapping: (
    fileId: string,
    mapping: Record<string, number>,
    sheet: string | null,
  ) => void;

  onRemoveFile: (file: ReportSourceFile) => void;
  pending: File[];
  fileStates: Record<number, DropZoneFileState>;
  uploadBusy: boolean;
  addPending: (files: File[]) => void;
  removePending: (index: number) => void;
  onUpload: () => void;

  /* Stage H — processing and downloads */
  onProcess: () => void;
  isProcessing: boolean;
  onExcel: () => Promise<ExcelResult>;
  onDraft: () => Promise<{ ok: boolean; message?: string; url?: string }>;
  onPack: () => Promise<{ ok: boolean; message?: string; url?: string }>;
  isExcelBusy: boolean;
  isDraftBusy: boolean;
  isPackBusy: boolean;
  draftUrl: string | null;
  draftTitle: string | null;
  onDeleteRun: () => void;
  isDeleting: boolean;

  /* Stage C — previous report workbook */
  priorDeclined: boolean;
  onDeclinePrior: (value: boolean) => void;
  isSavingPriorDecline: boolean;

  /* Cheetah Plains owner slides add-on */
  /** True for properties whose owners receive a bespoke pack with the report. */
  ownerSlidesOffered: boolean;

  /* Daily Detailed Report */
  /** The day's figures, once read from the uploaded files. */
  dailyFigures: DailyFigures | null;
  /** Reads the day, stores it and refreshes the workbook and one-page report. */
  onDailyBuild: () => void;
  isDailyBusy: boolean;
  dailyResult: DailyBuildResult | null;
}


