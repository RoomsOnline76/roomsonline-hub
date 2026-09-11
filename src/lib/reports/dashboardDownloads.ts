/**
 * Saving a run's files straight from the Revenue Reports dashboard.
 *
 * The dashboard hands the operator finished artefacts without opening the run
 * builder: the daily running workbook, and the bespoke owner pack merged into
 * one printable document (the same merge the run builder uses).
 */

import { supabase } from "@/integrations/supabase/client";
import { downloadFile, htmlToBlobUrl } from "@/lib/reportDraftHtml";
import {
  mergeOwnerPackPages,
  packFileName,
  type OwnerPackPage,
} from "@/lib/reports/ownerPackDownload";

const BUCKET = "revenue-reports";

export interface DownloadOutcome {
  ok: boolean;
  message?: string;
}

const sign = async (path: string): Promise<string | null> => {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
};

/** Saves the daily running workbook stored at `excelPath`. */
export async function downloadRunWorkbook(
  excelPath: string | null,
  filename: string,
): Promise<DownloadOutcome> {
  if (!excelPath) return { ok: false, message: "No spreadsheet has been built for this run yet." };
  const url = await sign(excelPath);
  if (!url) return { ok: false, message: "Could not open the spreadsheet." };
  await downloadFile(url, filename);
  return { ok: true };
}

/** Saves every owner-pack page of a run as one printable file. */
export async function downloadRunOwnerPack(
  runId: string,
  documentTitle: string,
): Promise<DownloadOutcome> {
  const { data, error } = await supabase
    .from("report_special_reports")
    .select("report_key, title, storage_path, payload")
    .eq("run_id", runId);
  if (error) return { ok: false, message: error.message };

  const rows = (data ?? [])
    .map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        title: row.title ?? row.report_key,
        storagePath: row.storage_path,
        packIndex:
          typeof payload.pack_index === "number" ? payload.pack_index : Number.MAX_SAFE_INTEGER,
        reportKey: row.report_key,
      };
    })
    .sort((a, b) => a.packIndex - b.packIndex || a.reportKey.localeCompare(b.reportKey));

  if (rows.length === 0) return { ok: false, message: "This run has no owner pack pages." };

  const pages: OwnerPackPage[] = [];
  for (const row of rows) {
    const url = await sign(row.storagePath);
    if (!url) continue;
    const response = await fetch(url);
    if (!response.ok) continue;
    pages.push({ title: row.title, html: await response.text() });
  }
  if (pages.length === 0) return { ok: false, message: "Could not read the owner pack pages." };

  const blobUrl = htmlToBlobUrl(mergeOwnerPackPages(pages, documentTitle));
  await downloadFile(blobUrl, packFileName(documentTitle));
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return { ok: true };
}
