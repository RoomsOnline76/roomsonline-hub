/**
 * Source-file uploads for the Revenue Reports subdomain.
 *
 * Files land in the private `revenue-reports` bucket under
 * `{property_id}/{run_id}/source/{uuid}-{filename}` and are recorded in
 * `report_source_files`. Content hashes let the UI flag duplicate uploads
 * before anything is stored, and a failed row insert removes the object again
 * so storage never drifts from the ledger.
 */

import { supabase } from "@/integrations/supabase/client";

export const REVENUE_REPORTS_BUCKET = "revenue-reports";
export const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_SOURCE_EXTENSIONS = [".xlsx", ".xls"] as const;

export type UploadPhase = "pending" | "hashing" | "uploading" | "done" | "error";

export interface UploadProgress {
  index: number;
  phase: UploadPhase;
  message?: string;
}

export interface UploadResult {
  uploaded: number;
  /** Files skipped because an identical file is already on the run. */
  skipped: { filename: string }[];
  failed: { filename: string; message: string }[];
}

/**
 * Extension check. `accepted` comes from the run's source adapter
 * (`ReportSourceAdapter.acceptedFileTypes`) so PDF sources such as OPERA are
 * allowed without widening the workbook sources.
 */
export function hasAcceptedExtension(
  filename: string,
  accepted: readonly string[] = ACCEPTED_SOURCE_EXTENSIONS,
): boolean {
  const lower = filename.toLowerCase();
  const list = accepted.length ? accepted : ACCEPTED_SOURCE_EXTENSIONS;
  return list.some((ext) => lower.endsWith(ext.toLowerCase()));
}


export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const sanitize = (filename: string): string =>
  filename.replace(/[^\w.\-]+/g, "_").slice(-120);

export interface UploadSourceFilesArgs {
  runId: string;
  propertyId: string;
  files: File[];
  /** Hashes already stored on this run — matching files are skipped. */
  existingHashes?: string[];
  /** Extensions the run's source adapter accepts; defaults to workbooks. */
  acceptedExtensions?: readonly string[];
  /**
   * `source` (default) for the period exports the parser reads, or
   * `prior_report` for the property's existing consolidated workbook used to
   * seed a first run's baseline.
   */
  fileRole?: "source" | "prior_report";
  onProgress?: (progress: UploadProgress) => void;
}

export async function uploadSourceFiles({
  runId,
  propertyId,
  files,
  existingHashes = [],
  acceptedExtensions = ACCEPTED_SOURCE_EXTENSIONS,
  fileRole = "source",
  onProgress,
}: UploadSourceFilesArgs): Promise<UploadResult> {
  const seen = new Set(existingHashes);
  const failed: UploadResult["failed"] = [];
  let uploaded = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    try {
      if (!hasAcceptedExtension(file.name, acceptedExtensions)) {
        throw new Error(`Only ${acceptedExtensions.join(" / ")} files are accepted`);
      }
      if (file.size > MAX_SOURCE_FILE_BYTES) {
        throw new Error("File exceeds the 20 MB limit");
      }

      onProgress?.({ index, phase: "hashing" });
      const hash = await hashFile(file);
      if (seen.has(hash)) {
        onProgress?.({ index, phase: "done", message: "Duplicate — skipped" });
        continue;
      }

      onProgress?.({ index, phase: "uploading" });
      const path = `${propertyId}/${runId}/${fileRole === "prior_report" ? "prior" : "source"}/${crypto.randomUUID()}-${sanitize(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(REVENUE_REPORTS_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("report_source_files").insert({
        run_id: runId,
        storage_path: path,
        original_filename: file.name,
        byte_size: file.size,
        file_hash: hash,
        file_role: fileRole,
      });
      if (insertError) {
        await supabase.storage.from(REVENUE_REPORTS_BUCKET).remove([path]);
        throw insertError;
      }

      seen.add(hash);
      uploaded += 1;
      onProgress?.({ index, phase: "done" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      failed.push({ filename: file.name, message });
      onProgress?.({ index, phase: "error", message });
    }
  }

  return { uploaded, failed };
}

/** Short-lived signed URL so staff can re-download an original upload. */
export async function getSourceFileUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(REVENUE_REPORTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 5);
  if (error) return null;
  return data?.signedUrl ?? null;
}
