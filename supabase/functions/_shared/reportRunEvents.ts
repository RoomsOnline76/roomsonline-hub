/**
 * Audit trail helper for revenue report runs (server side).
 *
 * Every meaningful state change on a run is appended to `report_run_events`
 * so the review screen can show a timeline of who did what, and when. Logging
 * must never break the pipeline: failures are swallowed and logged.
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

export type ReportRunEventType =
  | "processing_started"
  | "processing_succeeded"
  | "processing_failed"
  | "processing_partial"
  | "capacity_mismatch"
  | "room_count_corrected"
  | "past_months_reclassified"
  | "prior_report_gap_filled"
  | "rows_routed_away"
  | "file_reparsed"
  | "excel_generated"
  | "draft_generated"
  | "insights_generated"
  | "segment_split_applied"
  | "special_report_generated"
  | "prior_report_imported";

export async function logRunEvent(
  admin: Admin,
  runId: string,
  eventType: ReportRunEventType,
  message: string,
  detail: Record<string, unknown> = {},
  actorId: string | null = null,
): Promise<void> {
  try {
    await admin.from("report_run_events").insert({
      run_id: runId,
      event_type: eventType,
      message,
      detail,
      actor_id: actorId,
    });
  } catch (error) {
    console.error("report run event not recorded:", error);
  }
}
