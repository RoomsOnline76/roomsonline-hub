/**
 * Builds the Cheetah Plains Daily Detailed Report from a run's uploaded files.
 *
 * Reads the day's protel House State exports, the provisional-booking export
 * and the created / cancelled movement PDFs, stores the day's figures once per
 * property + date (a rerun replaces the day), then rebuilds the property's
 * running workbook and the one-page branded PDF source.
 *
 * Workbooks are opened one sheet at a time and released before the next file:
 * the daily folder carries several megabytes of exports and reading everything
 * at once exhausts the worker's CPU budget.
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
  buildDailyFigures,
  buildDailyWorkbook,
  parseMovementPdf,
  type DailyFigures,
  type DailyMovement,
} from "../_shared/cheetaplains/dailyDetailed.ts";
import { buildDailyReportHtml } from "../_shared/cheetaplains/dailyReportHtml.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Grid = unknown[][];

const toGrid = (workbook: XLSX.WorkBook, name: string): Grid =>
  XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });

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
    const actorId = userData.user.id;

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, report_kind, processing_note, properties(name)")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const propertyName = String(
      (run.properties as { name?: string } | null)?.name ?? "Property",
    );
    const asOf = String(run.as_of_date).slice(0, 10);

    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, brand_primary, brand_secondary, report_logo_url, daily_workbook_path")
      .eq("property_id", run.property_id)
      .maybeSingle();

    const { data: files, error: filesError } = await admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (filesError) return json({ error: filesError.message }, 500);
    if (!files?.length) return json({ error: "This run has no uploaded files yet" }, 409);

    await admin
      .from("report_runs")
      .update({ status: "processing", processing_note: "Reading the day's exports", error_message: null })
      .eq("id", runId);

    const days: ProtelDay[] = [];
    const provisionalMonths: Record<string, { revenue: number; nights: number }> = {};
    let created: DailyMovement | null = null;
    let cancelled: DailyMovement | null = null;
    const results: Array<{ id: string; ok: boolean; rows: number; notes: string[] }> = [];

    for (const file of files) {
      const filename = String(file.original_filename ?? "");
      const notes: string[] = [];
      let ok = false;
      let rows = 0;

      const download = await admin.storage.from(BUCKET).download(file.storage_path);
      if (download.error || !download.data) {
        results.push({
          id: file.id,
          ok: false,
          rows: 0,
          notes: [`${filename}: ${download.error?.message ?? "download failed"}`],
        });
        continue;
      }
      const buffer = await download.data.arrayBuffer();

      if (/\.pdf$/i.test(filename)) {
        try {
          const parsed = parseMovementPdf(await pdfText(buffer));
          if (parsed.kind === "created") {
            created = parsed.movement;
            ok = true;
            rows = parsed.movement.count;
          } else if (parsed.kind === "cancelled") {
            cancelled = parsed.movement;
            ok = true;
            rows = parsed.movement.count;
          } else {
            notes.push(`${filename}: not a created/cancelled reservations print — skipped`);
            ok = true;
          }
        } catch (error) {
          notes.push(
            `${filename}: unreadable PDF (${error instanceof Error ? error.message : "unknown"})`,
          );
        }
        results.push({ id: file.id, ok, rows, notes });
        continue;
      }

      // protel writes its OOXML parts in UTF-16; repair before reading.
      let workbook: XLSX.WorkBook | null = null;
      try {
        const repair = await repairWorkbookBuffer(buffer);
        workbook = XLSX.read(new Uint8Array(repair.buffer), { type: "array" });
      } catch (error) {
        results.push({
          id: file.id,
          ok: false,
          rows: 0,
          notes: [
            `${filename}: unreadable workbook (${error instanceof Error ? error.message : "unknown"})`,
          ],
        });
        continue;
      }

      // Stop at the first recognised sheet — nothing else in the file is needed.
      for (const name of workbook.SheetNames) {
        const grid = toGrid(workbook, name);
        if (isHouseStateGrid(grid)) {
          const parsed = parseHouseState(grid, filename);
          if (parsed.errors.length) {
            notes.push(...parsed.errors);
          } else {
            for (const day of parsed.days) days.push(day);
            ok = true;
            rows = parsed.days.length;
            notes.push(...parsed.warnings);
          }
          break;
        }
        if (isProvisionalGrid(grid)) {
          const parsed = parseProvisionalGrid(grid, filename);
          for (const [month, bucket] of Object.entries(parsed.months)) {
            const target = provisionalMonths[month] ?? { revenue: 0, nights: 0 };
            target.revenue += bucket.revenue;
            target.nights += bucket.nights;
            provisionalMonths[month] = target;
          }
          ok = true;
          rows = parsed.rowsRead;
          notes.push(...parsed.errors, ...parsed.warnings);
          break;
        }
        grid.length = 0;
      }
      workbook = null;

      if (!ok && !notes.length) notes.push(`${filename}: no daily grid recognised — skipped`);
      results.push({ id: file.id, ok: ok || notes.length === 1, rows, notes });
    }

    await Promise.all(
      results.map((result) =>
        admin
          .from("report_source_files")
          .update({
            parsed_ok: result.ok,
            row_count: result.rows,
            parse_errors: result.notes.length ? result.notes : null,
          })
          .eq("id", result.id),
      ),
    );

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

    const primary = (settings?.brand_primary ?? "#1A1A2E").replace("#", "");
    const workbookBytes = await buildDailyWorkbook(propertyName, allFigures, primary);
    const workbookPath = `${run.property_id}/daily/daily-detailed-report.xlsx`;
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
      note: typeof run.processing_note === "string" && run.processing_note.trim() ? run.processing_note.trim() : null,
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
        draft_path: htmlPath,
        draft_generated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await logRunEvent(
      admin,
      runId,
      "processing_succeeded",
      `Daily Detailed Report built for ${asOf} (${allFigures.length} day(s) in the running workbook)`,
      { days_parsed: days.length },
      actorId,
    );

    const [workbookSigned, htmlSigned] = await Promise.all([
      admin.storage.from(BUCKET).createSignedUrl(workbookPath, 60 * 30),
      admin.storage.from(BUCKET).createSignedUrl(htmlPath, 60 * 30),
    ]);

    return json({
      success: true,
      run_id: runId,
      date: asOf,
      figures,
      days_in_workbook: allFigures.length,
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
