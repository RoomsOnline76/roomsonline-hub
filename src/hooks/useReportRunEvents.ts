/**
 * Audit trail for revenue report runs.
 *
 * Server-side steps (parsing, workbook, draft, insights) are written by the
 * edge functions; user-driven edits are appended from the client through
 * `useLogReportRunEvent`. The timeline is append-only — nothing edits or
 * removes an event.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReportRunEventType =
  | "run_created"
  | "files_uploaded"
  | "file_removed"
  | "file_reparsed"
  | "processing_started"
  | "processing_succeeded"
  | "processing_failed"
  | "processing_partial"
  | "capacity_mismatch"
  | "excel_generated"
  | "draft_generated"
  | "insights_generated"
  | "inputs_updated"
  | "baseline_changed"
  | "settings_updated"
  | "run_deleted";

export interface ReportRunEvent {
  id: string;
  runId: string;
  eventType: ReportRunEventType;
  message: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export const REPORT_EVENT_LABEL: Record<ReportRunEventType, string> = {
  run_created: "Run created",
  files_uploaded: "Files uploaded",
  file_removed: "File removed",
  file_reparsed: "File re-parsed",
  processing_started: "Processing started",
  processing_succeeded: "Processing finished",
  processing_failed: "Processing failed",
  processing_partial: "Processing incomplete",
  capacity_mismatch: "Capacity check",
  excel_generated: "Workbook generated",
  draft_generated: "Draft report generated",
  insights_generated: "Insights generated",
  inputs_updated: "Additional inputs updated",
  baseline_changed: "Baseline changed",
  settings_updated: "Property settings updated",
  run_deleted: "Run deleted",
};

const EVENTS_KEY = ["reports", "run-events"] as const;

interface EventRow {
  id: string;
  run_id: string;
  event_type: string;
  message: string | null;
  actor_id: string | null;
  created_at: string;
}

/** Appends an audit entry. Never throws — the trail must not block the action. */
export async function logReportRunEvent(
  runId: string,
  eventType: ReportRunEventType,
  message: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("report_run_events").insert([{
      run_id: runId,
      event_type: eventType,
      message,
      detail: detail as never,
      actor_id: auth.user?.id ?? undefined,
    }]);
  } catch (error) {
    console.error("report run event not recorded:", error);
  }
}

export function useReportRunEvents(runId: string | undefined, isLive = false) {
  const query = useQuery({
    queryKey: [...EVENTS_KEY, runId],
    enabled: Boolean(runId),
    refetchInterval: isLive ? 4000 : false,
    queryFn: async (): Promise<ReportRunEvent[]> => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from("report_run_events")
        .select("id, run_id, event_type, message, actor_id, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as unknown as EventRow[]).map((row) => ({
        id: row.id,
        runId: row.run_id,
        eventType: (row.event_type as ReportRunEventType) ?? "run_created",
        message: row.message,
        actorId: row.actor_id,
        actorName: null,
        createdAt: row.created_at,
      }));
    },
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Logs an event and refreshes the timeline. */
export function useLogReportRunEvent(runId: string | undefined) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: {
      eventType: ReportRunEventType;
      message: string;
      detail?: Record<string, unknown>;
    }) => {
      if (!runId) return;
      await logReportRunEvent(runId, input.eventType, input.message, input.detail);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...EVENTS_KEY, runId] }),
  });

  const log = useCallback(
    (eventType: ReportRunEventType, message: string, detail?: Record<string, unknown>) => {
      void mutation.mutateAsync({ eventType, message, detail });
    },
    [mutation],
  );

  return { log };
}
