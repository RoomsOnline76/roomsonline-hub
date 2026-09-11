/**
 * Builds the Cheetah Plains Daily Detailed Report from a run's uploaded files.
 *
 * The day carries around twenty exports (villa-state workbooks, the provisional
 * booking export, movement PDFs), which is far more than one worker can read in
 * a single pass. The work is therefore split into two modes:
 *
 *   `parse_batch` — reads a handful of not-yet-read files and stores each file's
 *                   extracted payload on its `report_source_files` row;
 *   `build`       — once nothing is left to read, assembles the day from the
 *                   stored payloads, applies anything pasted from the day's
 *                   email, upserts the day, rebuilds the running workbook and
 *                   renders the one-page report.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import { isHouseStateGrid, parseHouseState, type ProtelDay } from "../_shared/protel/houseState.ts";
import {
  isProvisionalGrid,
  parseProvisionalGrid,
} from "../_shared/cheetaplains/provisional.ts";
import {
  isPipelineGrid,
  parsePipelineGrid,
  type PipelineRole,
} from "../_shared/cheetaplains/pipeline.ts";
import {
  buildDailyFigures,
  buildDailyWorkbook,
  monthlyOnBooks,
  parseMovementPdf,
  parsePastedEmail,
  type DailyFigures,
  type DailyMovement,
} from "../_shared/cheetaplains/dailyDetailed.ts";
import { appendDaySheet, daySheetName } from "../_shared/cheetaplains/dailyWorkbookSheet.ts";
import { buildDailyReportHtml } from "../_shared/cheetaplains/dailyReportHtml.ts";
import {
  readYearGrids,
  type DailyYearGrid,
} from "../_shared/cheetaplains/daySheetGrid.ts";

import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";
/**
 * Workbooks read per `parse_batch` call. One at a time: the provisional export
 * is far larger than a House State day and three of them exhaust the worker.
 */
const WORKBOOKS_PER_BATCH = 1;
/** PDF text extraction is the most expensive read, so one per call. */
const PDFS_PER_BATCH = 1;
/** A file that exhausts the worker this many times is skipped with a note. */
const MAX_FILE_ATTEMPTS = 2;
/** Rows sampled to recognise a sheet before the whole grid is converted. */
const PROBE_ROWS = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Grid = unknown[][];

/** What one source file contributed to the day, stored on its row. */
type PipelineTotals = {
  count: number;
  value: number;
  months: Record<string, { count: number; value: number }>;
};

type DailyPayload =
  | { kind: "house_state"; days: ProtelDay[] }
  | { kind: "provisional"; months: Record<string, { revenue: number; nights: number }> }
  | { kind: "pipeline"; roles: Partial<Record<PipelineRole, PipelineTotals>> }
  | { kind: "created" | "cancelled"; movement: DailyMovement }
  /** The running Daily Detailed workbook, kept as the base for the day's sheet. */
  | { kind: "running_workbook" }
  | { kind: "skipped" };

interface StoredDaily {
  payload: DailyPayload;
  notes: string[];
  ok: boolean;
  rows: number;
}

const toGrid = (workbook: XLSX.WorkBook, name: string, maxRows?: number): Grid => {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  let range: string | undefined;
  if (maxRows && typeof sheet["!ref"] === "string") {
    const decoded = XLSX.utils.decode_range(sheet["!ref"] as string);
    decoded.e.r = Math.min(decoded.e.r, decoded.s.r + maxRows);
    range = XLSX.utils.encode_range(decoded);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
    ...(range ? { range } : {}),
  });
};

const pdfText = async (buffer: ArrayBuffer): Promise<string> => {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const parts: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    for (const item of content.items as Array<{ str?: string }>) {
      if (typeof item.str === "string" && item.str.trim()) parts.push(item.str);
    }
  }
  return parts.join(" ");
};

/**
 * The running Daily Detailed workbook itself. It is never read as a source —
 * it is the base the day's new sheet is added to, so it is recognised by name
 * and left alone.
 */
const isRunningWorkbook = (name: string): boolean =>
  /daily[\s_-]*detailed[\s_-]*report/i.test(name) && /\.xlsx$/i.test(name);

/** Monthly-only exports are large and hold nothing a single day needs. */
const isDailyFile = (name: string): boolean =>
  /\.pdf$/i.test(name) ||
  /housestate/i.test(name) ||
  /provisional/i.test(name) ||
  /(daily|villa|state)/i.test(name);

interface FileRow {
  id: string;
  storage_path: string;
  original_filename: string | null;
  detected_mapping: Record<string, unknown> | null;
}

const storedDaily = (row: FileRow): StoredDaily | null => {
  const value = (row.detected_mapping ?? {})["daily"];
  if (!value || typeof value !== "object") return null;
  const entry = value as StoredDaily;
  return entry.payload && typeof entry.payload === "object" ? entry : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let runId = "";
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization" }, 401);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    const { data: allowed, error: accessError } = await admin.rpc("has_reports_access", {
      _user_id: userData.user.id,
    });
    if (accessError) return json({ error: accessError.message }, 500);
    if (!allowed) return json({ error: "Not authorised for revenue reports" }, 403);

    const body = await req.json().catch(() => ({}));
    runId = typeof body?.run_id === "string" ? body.run_id : "";
    if (!runId) return json({ error: "run_id is required" }, 400);
    const mode: "parse_batch" | "build" = body?.mode === "build" ? "build" : "parse_batch";
    const reset = body?.reset === true;
    const actorId = userData.user.id;

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, report_kind, properties(name)")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const propertyName = String(
      (run.properties as { name?: string } | null)?.name ?? "Property",
    );
    const asOf = String(run.as_of_date).slice(0, 10);

    const { data: fileRows, error: filesError } = await admin
      .from("report_source_files")
      .select("id, storage_path, original_filename, detected_mapping")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (filesError) return json({ error: filesError.message }, 500);
    const files = (fileRows ?? []) as FileRow[];
    if (!files.length) return json({ error: "This run has no uploaded files yet" }, 409);

    /* ── parse a batch ───────────────────────────────────────────── */

    if (mode === "parse_batch") {
      if (reset) {
        await admin
          .from("report_source_files")
          .update({ detected_mapping: null })
          .eq("run_id", runId);
        for (const file of files) file.detected_mapping = null;
      }

      await admin
        .from("report_runs")
        .update({
          status: "processing",
          processing_note: "Reading the day's exports",
          error_message: null,
        })
        .eq("id", runId);

      const outstanding = files.filter((file) => !storedDaily(file));
      let workbooks = 0;
      let pdfs = 0;
      let parsed = 0;

      for (const file of outstanding) {
        const filename = String(file.original_filename ?? "");
        const isPdf = /\.pdf$/i.test(filename);
        const running = isRunningWorkbook(filename);
        const heavy = !running && isDailyFile(filename);
        if (heavy && isPdf && pdfs >= PDFS_PER_BATCH) continue;
        if (heavy && !isPdf && workbooks >= WORKBOOKS_PER_BATCH) continue;

        const notes: string[] = [];
        let entry: StoredDaily = { payload: { kind: "skipped" }, notes, ok: true, rows: 0 };

        if (running) {
          entry = {
            payload: { kind: "running_workbook" },
            notes: [`${filename}: the running workbook — the day's sheet is added to it`],
            ok: true,
            rows: 0,
          };
        } else if (!heavy) {
          notes.push(`${filename}: monthly export — not used by the daily report`);
        } else {
          if (isPdf) pdfs += 1;
          else workbooks += 1;

          // A file that kills the worker leaves no result behind, so the next
          // call would pick it first and die again. Count the attempt before
          // reading it and give up on it once it has had its chances.
          const attempts = Number((file.detected_mapping ?? {})["daily_attempts"] ?? 0) + 1;
          if (attempts > MAX_FILE_ATTEMPTS) {
            const failed: StoredDaily = {
              payload: { kind: "skipped" },
              notes: [`${filename}: too large to read here — skipped after ${MAX_FILE_ATTEMPTS} attempts`],
              ok: false,
              rows: 0,
            };
            await admin
              .from("report_source_files")
              .update({
                detected_mapping: { daily: failed, daily_attempts: attempts },
                parsed_ok: false,
                row_count: 0,
                parse_errors: failed.notes,
              })
              .eq("id", file.id);
            file.detected_mapping = { daily: failed, daily_attempts: attempts };
            parsed += 1;
            continue;
          }
          await admin
            .from("report_source_files")
            .update({ detected_mapping: { daily_attempts: attempts } })
            .eq("id", file.id);


          const download = await admin.storage.from(BUCKET).download(file.storage_path);
          if (download.error || !download.data) {
            entry = {
              payload: { kind: "skipped" },
              notes: [`${filename}: ${download.error?.message ?? "download failed"}`],
              ok: false,
              rows: 0,
            };
          } else {
            const buffer = await download.data.arrayBuffer();

            if (isPdf) {
              try {
                const movement = parseMovementPdf(await pdfText(buffer));
                if (movement.kind === "unknown") {
                  notes.push(`${filename}: not a created/cancelled reservations print — skipped`);
                } else {
                  entry = {
                    payload: { kind: movement.kind, movement: movement.movement },
                    notes,
                    ok: true,
                    rows: movement.movement.count,
                  };
                }
              } catch (error) {
                entry = {
                  payload: { kind: "skipped" },
                  notes: [
                    `${filename}: unreadable PDF (${error instanceof Error ? error.message : "unknown"})`,
                  ],
                  ok: false,
                  rows: 0,
                };
              }
            } else {
              // protel writes its OOXML parts in UTF-16; repair before reading.
              let workbook: XLSX.WorkBook | null = null;
              try {
                const repair = await repairWorkbookBuffer(buffer);
                workbook = XLSX.read(new Uint8Array(repair.buffer), { type: "array" });
              } catch (error) {
                entry = {
                  payload: { kind: "skipped" },
                  notes: [
                    `${filename}: unreadable workbook (${error instanceof Error ? error.message : "unknown"})`,
                  ],
                  ok: false,
                  rows: 0,
                };
              }

              if (workbook) {
                // Stop at the first recognised sheet — nothing else is needed.
                for (const name of workbook.SheetNames) {
                  // Recognise the sheet from its opening rows; only the matching
                  // sheet is converted in full.
                  const probe = toGrid(workbook, name, PROBE_ROWS);
                  const isHouseState = isHouseStateGrid(probe);
                  const isPipeline = !isHouseState && isPipelineGrid(probe);
                  const isProvisional =
                    !isHouseState && !isPipeline && isProvisionalGrid(probe);
                  probe.length = 0;
                  if (isPipeline) {
                    // The tracker keeps enquiries, confirmations and losses on
                    // separate sheets — all three are read in one pass.
                    const roles: Partial<Record<PipelineRole, PipelineTotals>> = {};
                    const pipelineNotes: string[] = [];
                    let rows = 0;
                    for (const sheetName of workbook.SheetNames) {
                      const sheetGrid = toGrid(workbook, sheetName);
                      const result = parsePipelineGrid(sheetGrid, sheetName, filename);
                      sheetGrid.length = 0;
                      if (!result.rowsRead) {
                        pipelineNotes.push(...result.warnings);
                        continue;
                      }
                      const months: Record<string, { count: number; value: number }> = {};
                      for (const [month, bucket] of Object.entries(result.months)) {
                        months[month] = { count: bucket.count, value: bucket.value };
                      }
                      roles[result.role] = { count: result.count, value: result.value, months };
                      rows += result.rowsRead;
                      pipelineNotes.push(...result.warnings);
                    }
                    entry = {
                      payload: { kind: "pipeline", roles },
                      notes: pipelineNotes,
                      ok: rows > 0,
                      rows,
                    };
                    break;
                  }
                  if (!isHouseState && !isProvisional) continue;
                  const grid = toGrid(workbook, name);
                  if (isHouseState) {
                    const houseState = parseHouseState(grid, filename);
                    if (houseState.errors.length) {
                      entry = {
                        payload: { kind: "skipped" },
                        notes: houseState.errors,
                        ok: false,
                        rows: 0,
                      };
                    } else {
                      entry = {
                        payload: { kind: "house_state", days: houseState.days },
                        notes: houseState.warnings,
                        ok: true,
                        rows: houseState.days.length,
                      };
                    }
                    break;
                  }
                  if (isProvisional) {
                    const provisional = parseProvisionalGrid(grid, filename);
                    entry = {
                      payload: { kind: "provisional", months: provisional.months },
                      notes: [...provisional.errors, ...provisional.warnings],
                      ok: true,
                      rows: provisional.rowsRead,
                    };
                    break;
                  }
                  grid.length = 0;
                }
                workbook = null;
                if (entry.payload.kind === "skipped" && !entry.notes.length) {
                  entry.notes.push(`${filename}: no daily grid recognised — skipped`);
                }
              }
            }
          }
        }

        await admin
          .from("report_source_files")
          .update({
            detected_mapping: { daily: entry },
            parsed_ok: entry.ok,
            row_count: entry.rows,
            parse_errors: entry.notes.length ? entry.notes : null,
          })
          .eq("id", file.id);
        file.detected_mapping = { daily: entry };
        parsed += 1;
      }

      const remaining = files.filter((file) => !storedDaily(file)).length;
      return json({
        success: true,
        mode: "parse_batch",
        parsed,
        remaining,
        total: files.length,
        read: files.length - remaining,
      });
    }

    /* ── build the day ───────────────────────────────────────────── */

    const outstanding = files.filter((file) => !storedDaily(file));
    if (outstanding.length) {
      return json(
        { error: `${outstanding.length} file(s) still need reading`, remaining: outstanding.length },
        409,
      );
    }

    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, brand_primary, brand_secondary, report_logo_url, daily_workbook_path")
      .eq("property_id", run.property_id)
      .maybeSingle();

    const { data: extraInputs } = await admin
      .from("report_additional_inputs")
      .select("free_commentary")
      .eq("run_id", runId)
      .maybeSingle();
    const pasted = parsePastedEmail(extraInputs?.free_commentary ?? null);

    const days: ProtelDay[] = [];
    const provisionalMonths: Record<string, { revenue: number; nights: number }> = {};
    const pipeline: Partial<Record<PipelineRole, PipelineTotals>> = {};
    let created: DailyMovement | null = null;
    let cancelled: DailyMovement | null = null;
    let uploadedWorkbookPath: string | null = null;
    const results: Array<{ id: string; ok: boolean; rows: number; notes: string[] }> = [];

    for (const file of files) {
      const entry = storedDaily(file)!;
      results.push({ id: file.id, ok: entry.ok, rows: entry.rows, notes: entry.notes ?? [] });
      const payload = entry.payload;
      if (payload.kind === "house_state") {
        for (const day of payload.days) days.push(day);
      } else if (payload.kind === "provisional") {
        for (const [month, bucket] of Object.entries(payload.months ?? {})) {
          const target = provisionalMonths[month] ?? { revenue: 0, nights: 0 };
          target.revenue += bucket.revenue;
          target.nights += bucket.nights;
          provisionalMonths[month] = target;
        }
      } else if (payload.kind === "pipeline") {
        for (const [role, totals] of Object.entries(payload.roles ?? {})) {
          if (totals) pipeline[role as PipelineRole] = totals;
        }
      } else if (payload.kind === "running_workbook") {
        uploadedWorkbookPath = file.storage_path;
      } else if (payload.kind === "created") {
        created = payload.movement;
      } else if (payload.kind === "cancelled") {
        cancelled = payload.movement;
      }
    }

    // Enquiries: the tracker's provisional sheet when the run carries it,
    // otherwise whatever a reservation-style provisional export gave.
    for (const [month, bucket] of Object.entries(pipeline.provisional?.months ?? {})) {
      if (provisionalMonths[month]) continue;
      provisionalMonths[month] = { revenue: bucket.value, nights: 0 };
    }

    // The exports always win; the pasted email only fills what they did not carry.
    if (!created && pasted.created) created = pasted.created;
    if (!cancelled && pasted.cancelled) cancelled = pasted.cancelled;

    const figures = buildDailyFigures({
      days,
      date: asOf,
      villaCount: settings?.room_count ?? null,
      provisionalMonths,
      created,
      cancelled,
    });

    if (!figures) {
      const message = `No House State row for ${asOf} was found in the uploaded files`;
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", message, {}, actorId);
      return json({ error: message, files: results }, 422);
    }

    // One row per property + day: a rerun replaces the day it covers.
    const { error: upsertError } = await admin.from("report_daily_days").upsert(
      {
        property_id: run.property_id,
        run_id: runId,
        report_date: asOf,
        figures: figures as unknown as Record<string, unknown>,
      },
      { onConflict: "property_id,report_date" },
    );
    if (upsertError) return json({ error: upsertError.message }, 500);

    const { data: storedDays, error: daysError } = await admin
      .from("report_daily_days")
      .select("report_date, figures")
      .eq("property_id", run.property_id)
      .order("report_date", { ascending: true });
    if (daysError) return json({ error: daysError.message }, 500);

    const allFigures: DailyFigures[] = (storedDays ?? [])
      .map((row) => row.figures as unknown as DailyFigures)
      .filter((row) => row && typeof row.date === "string");

    /* ── the running workbook ────────────────────────────────────── */

    // The day is added to the workbook the revenue team keeps: a copy of the
    // newest day sheet, with yesterday's figures moved into the previous-day
    // columns and this day's provisional business written in. An uploaded
    // workbook on the run replaces whatever was stored before.
    const primary = (settings?.brand_primary ?? "#1A1A2E").replace("#", "");
    const workbookPath = `${run.property_id}/daily/daily-detailed-report.xlsx`;
    const workbookNotes: string[] = [];
    let workbookBytes: Uint8Array | null = null;
    let sheetName = daySheetName(asOf);
    let yearGrids: DailyYearGrid[] = [];


    const basePath = uploadedWorkbookPath ?? settings?.daily_workbook_path ?? null;
    if (basePath) {
      const base = await admin.storage.from(BUCKET).download(basePath);
      if (base.error || !base.data) {
        workbookNotes.push(
          `The running workbook could not be opened (${base.error?.message ?? "download failed"})`,
        );
      } else {
        const provisionalByMonth: Record<string, number> = {};
        for (const [month, figuresForMonth] of Object.entries(
          monthlyOnBooks(days, settings?.room_count ?? null),
        )) {
          provisionalByMonth[month] = figuresForMonth.revenue;
        }
        try {
          const appended = await appendDaySheet(await base.data.arrayBuffer(), asOf, {
            provisionalByMonth,
          });
          workbookBytes = appended.bytes;
          sheetName = appended.sheetName;
          // The printed report carries the same financial form and graphs the
          // day's sheet holds, read straight off the sheet just written.
          yearGrids = appended.yearGrids;

          workbookNotes.push(
            `${appended.sheetName} ${appended.replaced ? "rebuilt" : "added"} from ${appended.templateSheet}` +
              ` — ${appended.monthsWritten.length} month(s) updated from the day's exports`,
            ...appended.notes,
          );
        } catch (error) {

          workbookNotes.push(
            `The day's sheet could not be added (${error instanceof Error ? error.message : "unknown"})`,
          );
        }
      }
    } else {
      workbookNotes.push(
        "No running workbook is on file yet — upload Daily Detailed Report 2026.xlsx with the day's exports to keep the team's format",
      );
    }

    if (!workbookBytes) {
      // Nothing to append to: fall back to the plain day-per-row workbook so the
      // run still produces a spreadsheet.
      workbookBytes = await buildDailyWorkbook(propertyName, allFigures, primary);
    }

    const workbookUpload = await admin.storage.from(BUCKET).upload(workbookPath, workbookBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (workbookUpload.error) return json({ error: workbookUpload.error.message }, 500);

    const report = buildDailyReportHtml({
      propertyName,
      figures,
      branding: {
        primary: settings?.brand_primary ?? "#1A1A2E",
        secondary: settings?.brand_secondary ?? "#1A1A2E",
        logoUrl: settings?.report_logo_url ?? null,
      },
      emailNotes: pasted.note,
      yearGrids,

    });
    const htmlPath = `${run.property_id}/${runId}/daily-detailed-${asOf}.html`;
    const htmlUpload = await admin.storage
      .from(BUCKET)
      .upload(htmlPath, new TextEncoder().encode(report.html), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (htmlUpload.error) return json({ error: htmlUpload.error.message }, 500);

    await admin
      .from("property_report_settings")
      .upsert(
        {
          property_id: run.property_id,
          daily_workbook_path: workbookPath,
          daily_workbook_updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id" },
      );

    await admin
      .from("report_runs")
      .update({
        status: "ready",
        processing_note: null,
        error_message: null,
        excel_path: workbookPath,
        excel_generated_at: new Date().toISOString(),
        draft_report_path: htmlPath,
        draft_generated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await logRunEvent(
      admin,
      runId,
      "processing_succeeded",
      `Daily Detailed Report built for ${asOf} — sheet ${sheetName}. ${workbookNotes.join(" · ")}`,
      {
        days_parsed: days.length,
        pasted_email: Boolean(pasted.note),
        sheet: sheetName,
        workbook_notes: workbookNotes,
      },
      actorId,
    );

    const [workbookSigned, htmlSigned] = await Promise.all([
      admin.storage.from(BUCKET).createSignedUrl(workbookPath, 60 * 30),
      admin.storage.from(BUCKET).createSignedUrl(htmlPath, 60 * 30),
    ]);

    return json({
      success: true,
      mode: "build",
      run_id: runId,
      date: asOf,
      figures,
      days_in_workbook: allFigures.length,
      sheet: sheetName,
      workbook_notes: workbookNotes,
      pipeline,
      files: results,
      excel_url: workbookSigned.data?.signedUrl ?? null,
      excel_path: workbookPath,
      report_url: htmlSigned.data?.signedUrl ?? null,
      report_path: htmlPath,
      document_title: report.documentTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (runId) {
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
    }
    return json({ error: message }, 500);
  }
});
