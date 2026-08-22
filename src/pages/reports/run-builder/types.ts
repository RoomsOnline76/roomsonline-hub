import type { ReportRunDetail, ReportSourceFile } from "@/hooks/useReportRuns";
import type { ReportSnapshot, ExcelResult } from "@/hooks/useReportSnapshot";
import type { ReportSourceAdapter } from "@/lib/report-adapters";
import type { DropZoneFileState } from "@/components/reports/FileDropZone";

/**
 * Everything the stage screens need. The shell owns the hooks and hands this
 * down so each stage stays a thin, focused view.
 */
export interface RunBuilderContext {
  run: ReportRunDetail;
  runId: string;
  adapter: ReportSourceAdapter;
  snapshot: ReportSnapshot | null;
  editable: boolean;

  refresh: () => Promise<void>;

  /* Stage A/B — source files */
  reparsingId: string | null;
  onDownload: (storagePath: string) => void;
  onReparse: (file: ReportSourceFile) => void;
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
  ownerSlidesOffered: boolean;
  ownerSlidesEnabled: boolean;
  onToggleOwnerSlides: (enabled: boolean) => void;
  isTogglingOwnerSlides: boolean;
}
