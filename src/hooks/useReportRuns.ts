import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logReportRunEvent } from "@/hooks/useReportRunEvents";

export type ReportRunStatus = "draft" | "processing" | "ready" | "failed";

export interface ReportSourceFile {
  id: string;
  runId: string;
  storagePath: string;
  originalFilename: string;
  byteSize: number | null;
  fileHash: string | null;
  parsedOk: boolean | null;
  parseErrors: string[];
  rowCount: number | null;
  createdAt: string;
}

export interface ReportRunSummary {
  id: string;
  propertyId: string;
  propertyName: string | null;
  propertyLogoUrl: string | null;
  sourceType: string;
  asOfDate: string;
  status: ReportRunStatus;
  title: string | null;
  fileCount: number;
  errorMessage: string | null;
  processingNote: string | null;
  createdAt: string;
}

export interface ReportRunDetail extends ReportRunSummary {
  previousRunId: string | null;
  baselineLocked: boolean;
  files: ReportSourceFile[];
}

const RUNS_KEY = ["reports", "runs"] as const;

const asStatus = (value: string | null): ReportRunStatus =>
  value === "processing" || value === "ready" || value === "failed" ? value : "draft";

interface RunRow {
  id: string;
  property_id: string;
  source_type: string;
  as_of_date: string;
  previous_run_id: string | null;
  baseline_locked?: boolean | null;
  status: string | null;
  title: string | null;
  error_message?: string | null;
  processing_note?: string | null;
  created_at: string;
  properties?: { name: string | null; brand_logo_url: string | null } | null;
  report_source_files?: { count: number }[] | null;
}


/** parse_errors is jsonb — accept an array, a string, or an object of messages. */
const normaliseParseErrors = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(
      ([key, detail]) => `${key}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
  return [String(value)];
};

const mapSummary = (row: RunRow): ReportRunSummary => ({
  id: row.id,
  propertyId: row.property_id,
  propertyName: row.properties?.name ?? null,
  propertyLogoUrl: row.properties?.brand_logo_url ?? null,
  sourceType: row.source_type,
  asOfDate: row.as_of_date,
  status: asStatus(row.status),
  title: row.title,
  fileCount: row.report_source_files?.[0]?.count ?? 0,
  errorMessage: row.error_message ?? null,
  processingNote: row.processing_note ?? null,
  createdAt: row.created_at,
});

const RUN_SELECT =
  "id, property_id, source_type, as_of_date, previous_run_id, baseline_locked, status, title, error_message, processing_note, created_at, properties(name, brand_logo_url), report_source_files(count)";


/** Recent report runs, newest first. */
export function useReportRuns(limit = 25) {
  const query = useQuery({
    queryKey: [...RUNS_KEY, "list", limit],
    queryFn: async (): Promise<ReportRunSummary[]> => {
      const { data, error } = await supabase
        .from("report_runs")
        .select(RUN_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as RunRow[]).map(mapSummary);
    },
    staleTime: 30_000,
  });

  return {
    runs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/** A single run with its uploaded source files. */
export function useReportRun(runId: string | undefined) {
  const query = useQuery({
    queryKey: [...RUNS_KEY, "detail", runId],
    enabled: Boolean(runId),
    // While the parser is working, poll so the processing note and per-file
    // outcomes land in the UI without the user reloading.
    refetchInterval: (q) =>
      (q.state.data as ReportRunDetail | null | undefined)?.status === "processing" ? 4000 : false,
    queryFn: async (): Promise<ReportRunDetail | null> => {
      if (!runId) return null;
      const { data, error } = await supabase
        .from("report_runs")
        .select(RUN_SELECT)
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: files, error: filesError } = await supabase
        .from("report_source_files")
        .select("id, run_id, storage_path, original_filename, byte_size, file_hash, parsed_ok, parse_errors, row_count, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true });
      if (filesError) throw filesError;

      const row = data as unknown as RunRow;
      return {
        ...mapSummary(row),
        fileCount: files?.length ?? 0,
        previousRunId: row.previous_run_id,
        baselineLocked: Boolean(row.baseline_locked),
        files: (files ?? []).map((f) => ({

          id: f.id,
          runId: f.run_id,
          storagePath: f.storage_path,
          originalFilename: f.original_filename,
          byteSize: f.byte_size === null ? null : Number(f.byte_size),
          fileHash: f.file_hash,
          parsedOk: f.parsed_ok,
          parseErrors: normaliseParseErrors(f.parse_errors),
          rowCount: f.row_count,
          createdAt: f.created_at,
        })),
      };
    },
  });

  return {
    run: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

export interface CreateReportRunInput {
  propertyId: string;
  asOfDate: string;
  title: string;
  sourceType?: string;
}

export function useReportRunMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: RUNS_KEY });

  const createRun = useMutation({
    mutationFn: async (input: CreateReportRunInput): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();

      // Chain runs per property so later phases can diff against the last snapshot.
      const { data: previous } = await supabase
        .from("report_runs")
        .select("id")
        .eq("property_id", input.propertyId)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await supabase
        .from("report_runs")
        .insert({
          property_id: input.propertyId,
          as_of_date: input.asOfDate,
          title: input.title,
          source_type: isReportSourceKey(input.sourceType)
            ? input.sourceType
            : DEFAULT_REPORT_SOURCE,
          status: "draft",
          previous_run_id: previous?.id ?? null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      await logReportRunEvent(data.id, "run_created", `Run created for ${input.asOfDate}`);
      return data.id;
    },
    onSuccess: invalidate,
  });

  const deleteRun = useMutation({
    mutationFn: async (runId: string) => {
      const { data: files } = await supabase
        .from("report_source_files")
        .select("storage_path")
        .eq("run_id", runId);
      const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from("revenue-reports").remove(paths);
      }
      const { error } = await supabase.from("report_runs").delete().eq("id", runId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteFile = useMutation({
    mutationFn: async (file: {
      id: string;
      storagePath: string;
      runId?: string;
      filename?: string;
    }) => {
      await supabase.storage.from("revenue-reports").remove([file.storagePath]);
      const { error } = await supabase.from("report_source_files").delete().eq("id", file.id);
      if (error) throw error;
      if (file.runId) {
        await logReportRunEvent(file.runId, "file_removed", `Removed ${file.filename ?? "a source file"}`);
      }
    },
    onSuccess: invalidate,
  });

  return { createRun, deleteRun, deleteFile, invalidate };
}

export interface BaselineCandidate {
  id: string;
  title: string | null;
  asOfDate: string;
  status: ReportRunStatus;
}

/**
 * Earlier runs for the same property that can act as the "OTB @ previous date"
 * comparison, plus a mutation to pin (or clear) the choice.
 */
export function useReportBaseline(run: ReportRunDetail | null) {
  const queryClient = useQueryClient();

  const candidates = useQuery({
    queryKey: ["reports", "baseline-candidates", run?.id],
    enabled: Boolean(run?.id),
    queryFn: async (): Promise<BaselineCandidate[]> => {
      if (!run) return [];
      const { data, error } = await supabase
        .from("report_runs")
        .select("id, title, as_of_date, status")
        .eq("property_id", run.propertyId)
        .neq("id", run.id)
        .order("as_of_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        asOfDate: row.as_of_date,
        status: asStatus(row.status),
      }));
    },
  });

  const setBaseline = useMutation({
    mutationFn: async (previousRunId: string | null) => {
      if (!run) return;
      const { error } = await supabase
        .from("report_runs")
        .update({ previous_run_id: previousRunId, baseline_locked: true })
        .eq("id", run.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const clearLock = useMutation({
    mutationFn: async () => {
      if (!run) return;
      const { error } = await supabase
        .from("report_runs")
        .update({ baseline_locked: false })
        .eq("id", run.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  return {
    candidates: candidates.data ?? [],
    isLoading: candidates.isLoading,
    setBaseline,
    clearLock,
  };
}
