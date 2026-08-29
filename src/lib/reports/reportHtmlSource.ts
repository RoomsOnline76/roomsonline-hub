/**
 * Loading a generated report for on-screen viewing.
 *
 * Storage serves the stored pack as plain text, so it is fetched and re-wrapped
 * as an HTML blob URL. Shared by the full-page viewer and the dashboard
 * Quickview dialog so both behave identically — no storage URL is ever shown to
 * the user and the tab/print title always comes from the report itself.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractDocumentTitle, htmlToBlobUrl } from "@/lib/reportDraftHtml";

const BUCKET = "revenue-reports";

export interface LoadedReport {
  /** Blob URL safe to hand to an iframe. Caller revokes it when done. */
  url: string;
  documentTitle: string | null;
}

export class ReportNotBuiltError extends Error {}

interface LoadOptions {
  runId: string;
  /** When set, loads that specialised slide instead of the main draft pack. */
  slideId?: string | null;
}

/** Resolves the storage path of a run's draft pack, or of one special slide. */
async function resolveStoragePath({ runId, slideId }: LoadOptions): Promise<string | null> {
  if (slideId) {
    const { data } = await supabase
      .from("report_special_reports")
      .select("storage_path")
      .eq("id", slideId)
      .maybeSingle();
    return data?.storage_path ?? null;
  }
  const { data } = await supabase
    .from("report_runs")
    .select("draft_report_path")
    .eq("id", runId)
    .maybeSingle();
  return (data as { draft_report_path?: string | null } | null)?.draft_report_path ?? null;
}

/**
 * Fetches a generated report and returns a renderable blob URL.
 *
 * Throws `ReportNotBuiltError` when the run has no generated pack yet, so the
 * caller can offer the build stage instead of an error.
 */
export async function loadRunReport(options: LoadOptions): Promise<LoadedReport> {
  const storagePath = await resolveStoragePath(options);
  if (!storagePath) {
    throw new ReportNotBuiltError(
      "No generated report found for this run — build the draft first.",
    );
  }

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 30);
  if (!signed.data?.signedUrl) throw new Error("Could not open the stored report.");

  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw new Error("Could not load the report contents.");
  const html = await response.text();
  return { url: htmlToBlobUrl(html), documentTitle: extractDocumentTitle(html) };
}
