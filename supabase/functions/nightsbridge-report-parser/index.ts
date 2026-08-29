// Parses NightsBridge bookings exports for a report run and writes the snapshot.
// Layout resilience (header seeking, field inference, derivation, CSV/PDF input)
// lives in ../_shared/nightsbridgeLedgerParse.ts so it stays testable.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import {
  aggregateLedger,
  type LedgerRow,
} from "../_shared/nightsbridgeAggregate.ts";
import { normaliseRules } from "../_shared/nightsbridgeRowRules.ts";
import {
  parseNbProfile,
  recordRoutedRows,
  splitByRouting,
  type RoutableRow,
} from "../_shared/nbProfile.ts";
import { resolveAdditionalInputs } from "../_shared/reportAdditionalInputs.ts";
import { buildBookingTrends } from "../_shared/reportBookingTrends.ts";
import {
  gridFromDelimited,
  gridFromPdfItems,
  parseLedgerSheets,
  type ColumnMap,
  type LedgerParseResult,
  type PdfItem,
  type SheetGrid,
} from "../_shared/nightsbridgeLedgerParse.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";
import { sanitiseRoomCount } from "../_shared/reportRoomCount.ts";
import {
  applyImportedBaseline,
  reconcileWithImportedBaseline,
} from "../_shared/reportImportedBaseline.ts";
import {
  pastMonthsNote,
  trimToReportWindow,
  type PastMonthActual,
} from "../_shared/reportWindow.ts";



const BUCKET = "revenue-reports";
/** Stop taking on new files once this much of the invocation budget is gone. */
const TIME_BUDGET_MS = 100_000;

const extensionOf = (filename: string): string =>
  (filename.split(".").pop() ?? "").toLowerCase();

/** Every worksheet of a workbook as a raw grid. */
function sheetsFromWorkbook(buffer: ArrayBuffer): SheetGrid[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  return workbook.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
      header: 1,
      blankrows: false,
      raw: true,
    }),
  }));
}

/** Positioned text items from every page of a text-layer PDF. */
async function pdfItems(buffer: ArrayBuffer): Promise<PdfItem[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const items: PdfItem[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    const offset = (page - 1) * 100_000;
    for (const raw of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof raw.str !== "string" || !raw.str.trim() || !raw.transform) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5] - offset });
    }
  }
  return items;
}

interface FileParseOptions {
  override?: ColumnMap | null;
  overrideSheet?: string | null;
  fallbackCurrency?: string;
}

/** Reads one uploaded file, whatever shape it arrives in. */
async function parseSourceFile(
  buffer: ArrayBuffer,
  filename: string,
  options: FileParseOptions,
): Promise<LedgerParseResult> {
  const extension = extensionOf(filename);
  try {
    if (extension === "pdf") {
      const items = await pdfItems(buffer);
      if (!items.length) {
        return {
          status: "failed",
          rows: [],
          errors: [`${filename}: no text layer found — scanned PDFs cannot be read`],
          notes: [],
          skipped: 0,
          sheet: null,
          headerRow: null,
          headers: [],
          sampleRows: [],
          mapping: {},
          unresolved: [],
          fingerprint: null,
        };
      }
      return parseLedgerSheets([{ name: "PDF", grid: gridFromPdfItems(items) }], {
        filename,
        ...options,
      });
    }

    if (extension === "csv" || extension === "txt" || extension === "tsv") {
      const content = new TextDecoder().decode(new Uint8Array(buffer));
      return parseLedgerSheets([{ name: filename, grid: gridFromDelimited(content) }], {
        filename,
        ...options,
      });
    }

    const repair = await repairWorkbookBuffer(buffer);
    return parseLedgerSheets(sheetsFromWorkbook(repair.buffer), { filename, ...options });
  } catch (error) {
    return {
      status: "failed",
      rows: [],
      errors: [
        `${filename}: unreadable file (${error instanceof Error ? error.message : "unknown"})`,
      ],
      notes: [],
      skipped: 0,
      sheet: null,
      headerRow: null,
      headers: [],
      sampleRows: [],
      mapping: {},
      unresolved: [],
      fingerprint: null,
    };
  }
}


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let runId = "";
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
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
    /** Single-file check: re-parse one file without touching the snapshot. */
    const onlyFileId = typeof body?.file_id === "string" ? body.file_id : "";
    /** Reviewer-confirmed column mapping for that one file. */
    const reviewerMapping: ColumnMap | null =
      body?.mapping && typeof body.mapping === "object" ? (body.mapping as ColumnMap) : null;
    const reviewerSheet = typeof body?.sheet === "string" ? body.sheet : null;

    const actorId = userData.user.id;
    const startedAt = Date.now();

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, report_month, previous_run_id, baseline_locked, imported_baseline, status")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    // A mapping the reviewer confirmed on an earlier run with the same layout.
    const { data: mapSettings } = await admin
      .from("property_report_settings")
      .select("nightsbridge_column_map")
      .eq("property_id", run.property_id)
      .maybeSingle();
    const rememberedMap = (mapSettings?.nightsbridge_column_map ?? null) as
      | { fingerprint?: string; sheet?: string | null; columns?: ColumnMap }
      | null;

    let fileQuery = admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      // Prior consolidated report workbooks are baseline imports, not period exports.
      .or("file_role.is.null,file_role.neq.prior_report");
    if (onlyFileId) fileQuery = fileQuery.eq("id", onlyFileId);
    const { data: files, error: filesError } = await fileQuery.order("created_at", {
      ascending: true,
    });
    if (filesError) return json({ error: filesError.message }, 500);
    if (!files?.length) {
      return json(
        { error: onlyFileId ? "File not found on this run" : "No source files uploaded for this run" },
        400,
      );
    }

    if (!onlyFileId) {
      if (run.status === "processing") {
        return json({ error: "This run is already being processed" }, 409);
      }
      await admin
        .from("report_runs")
        .update({
          status: "processing",
          error_message: null,
          processing_note: `Starting — ${files.length} file(s) queued`,
        })
        .eq("id", runId);
      await logRunEvent(
        admin,
        runId,
        "processing_started",
        `Processing started for ${files.length} file(s)`,
        { file_count: files.length },
        actorId,
      );
    }

    const ledger: LedgerRow[] = [];
    const fileResults: Array<{
      id: string;
      filename: string;
      parsed_ok: boolean;
      row_count: number;
      errors: string[];
      status: LedgerParseResult["status"];
      sheet: string | null;
      notes: string[];
      headers: string[];
      sample_rows: string[][];
      mapping: LedgerParseResult["mapping"];
      unresolved: string[];
      fingerprint: string | null;
    }> = [];
    let processedFiles = 0;
    let truncated = false;

    for (const file of files) {
      if (processedFiles > 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      if (!onlyFileId) {
        await admin
          .from("report_runs")
          .update({
            processing_note: `Reading ${file.original_filename} (${processedFiles + 1} of ${files.length})`,
          })
          .eq("id", runId);
      }

      const download = await admin.storage.from(BUCKET).download(file.storage_path);
      if (download.error || !download.data) {
        const message = download.error?.message ?? "download failed";
        fileResults.push({
          id: file.id,
          filename: file.original_filename,
          parsed_ok: false,
          row_count: 0,
          errors: [`${file.original_filename}: ${message}`],
          status: "failed",
          sheet: null,
          notes: [],
          headers: [],
          sample_rows: [],
          mapping: {},
          unresolved: [],
          fingerprint: null,
        });
        processedFiles += 1;
        continue;
      }

      // Parse one file at a time and release the buffer before the next.
      let parsed: LedgerParseResult;
      {
        const buffer = await download.data.arrayBuffer();
        parsed = await parseSourceFile(buffer, file.original_filename, {
          override: onlyFileId ? reviewerMapping : null,
          overrideSheet: onlyFileId ? reviewerSheet : null,
        });

        // Auto-apply a remembered mapping when detection alone was not enough
        // and the header layout matches what the reviewer confirmed before.
        if (
          parsed.status === "needs_mapping" &&
          rememberedMap?.columns &&
          rememberedMap.fingerprint &&
          rememberedMap.fingerprint === parsed.fingerprint
        ) {
          const retry = await parseSourceFile(buffer, file.original_filename, {
            override: rememberedMap.columns,
          });
          if (retry.status === "parsed") {
            retry.notes.push("Column mapping reused from this property's saved layout.");
            parsed = retry;
          }
        }
      }
      const ok = parsed.status === "parsed" && parsed.rows.length > 0;
      if (ok) {
        for (const row of parsed.rows) ledger.push(row);
      }
      fileResults.push({
        id: file.id,
        filename: file.original_filename,
        parsed_ok: ok,
        row_count: parsed.rows.length,
        errors: parsed.errors,
        status: parsed.status,
        sheet: parsed.sheet,
        notes: parsed.notes,
        headers: parsed.headers,
        sample_rows: parsed.sampleRows,
        mapping: parsed.mapping,
        unresolved: parsed.unresolved,
        fingerprint: parsed.fingerprint,
      });
      parsed.rows.length = 0;
      processedFiles += 1;
    }

    // Remember a reviewer-confirmed mapping that worked, for future files.
    if (onlyFileId && reviewerMapping && fileResults[0]?.parsed_ok) {
      await admin.from("property_report_settings").upsert(
        {
          property_id: run.property_id,
          nightsbridge_column_map: {
            fingerprint: fileResults[0].fingerprint,
            sheet: fileResults[0].sheet,
            columns: reviewerMapping,
            saved_at: new Date().toISOString(),
          },
        } as never,
        { onConflict: "property_id" },
      );
    }

    // Batch the per-file bookkeeping instead of one round trip per file.
    await Promise.all(
      fileResults.map((result) =>
        admin
          .from("report_source_files")
          .update({
            parsed_ok: result.parsed_ok,
            row_count: result.row_count,
            parse_errors: result.errors.length ? result.errors : null,
            parse_status: result.status,
            sheet_used: result.sheet,
            parse_note: result.notes.length ? result.notes.join(" ") : null,
            detected_mapping: {
              headers: result.headers,
              sample_rows: result.sample_rows,
              fields: result.mapping,
              unresolved: result.unresolved,
              fingerprint: result.fingerprint,
            },
            applied_mapping: onlyFileId && reviewerMapping ? reviewerMapping : null,
          } as never)
          .eq("id", result.id),
      ),
    );


    if (onlyFileId) {
      const result = fileResults[0];
      await logRunEvent(
        admin,
        runId,
        "file_reparsed",
        `${result.filename}: ${
          result.parsed_ok
            ? `${result.row_count} row(s) parsed`
            : result.status === "needs_mapping"
              ? "needs column mapping"
              : "parse failed"
        }`,

        { file_id: result.id, errors: result.errors },
        actorId,
      );
      return json({
        success: result.parsed_ok,
        run_id: runId,
        file: result,
        rows_parsed: result.row_count,
      });
    }

    if (truncated) {
      const message = `Processed ${processedFiles} of ${files.length} file(s) before the time limit — run again to continue`;
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_partial", message, {
        processed: processedFiles,
        total: files.length,
      }, actorId);
      return json({ error: message, partial: true, processed: processedFiles, total: files.length, files: fileResults }, 422);
    }

    if (ledger.length === 0) {
      const message = fileResults.flatMap((r) => r.errors)[0] ?? "No usable booking rows found";
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", message, { files: fileResults }, actorId);
      return json({ error: message, files: fileResults }, 422);
    }

    // A re-process must never blend with the previous result.
    await admin.from("report_snapshots").delete().eq("run_id", runId);


    // Property capacity configuration + zero-revenue row rules.
    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, historical_baseline, zero_revenue_keep_patterns, row_exclude_patterns")
      .eq("property_id", run.property_id)
      .maybeSingle();

    let roomCount = settings?.room_count ?? 0;
    if (!roomCount) {
      const { count } = await admin
        .from("rolos_rooms")
        .select("id", { count: "exact", head: true })
        .eq("property_id", run.property_id)
        .eq("is_active", true);
      roomCount = count && count > 0 ? count : 1;
    }

    // A room count captured as capacity days would divide occupancy by ~30.
    const roomCheck = sanitiseRoomCount(roomCount);
    if (roomCheck.warning) {
      roomCount = roomCheck.roomCount;
      await logRunEvent(
        admin,
        runId,
        "room_count_corrected",
        roomCheck.warning,
        { configured: settings?.room_count ?? null, used: roomCount },
        actorId,
      );
    }

    const rowRules = normaliseRules(
      (settings as { zero_revenue_keep_patterns?: unknown } | null)?.zero_revenue_keep_patterns,
      (settings as { row_exclude_patterns?: unknown } | null)?.row_exclude_patterns,
    );
    const aggregate = aggregateLedger(ledger, roomCount, rowRules);


    // Uploaded extracts for months before this review window (last year's

    // actuals dropped in with the forward months) are comparatives, not report

    // months: lift them out and keep them as last-year figures.

    const pastMonths: PastMonthActual[] = trimToReportWindow(aggregate, String(run.as_of_date), (run as { report_month?: string | null }).report_month ?? null);

    const pastRevenue: Record<string, number> = {};

    const pastNights: Record<string, number> = {};

    for (const entry of pastMonths) {

      pastRevenue[entry.month] = entry.revenue;

      pastNights[entry.month] = entry.nights;

    }

    if (pastMonths.length > 0) {

      await logRunEvent(

        admin,

        runId,

        "past_months_reclassified",

        pastMonthsNote(pastMonths),

        { past_months: pastMonths },

        actorId,

      );

    }


    // The prior workbook knows months the uploads may not cover, and months the
    // uploads only skim. Widen the window, then substitute the thin months.
    const { addedMonths, substituted } = reconcileWithImportedBaseline(
      aggregate,
      run.imported_baseline,
      roomCount,
    );
    if (addedMonths.length || substituted.length) {
      await logRunEvent(
        admin,
        runId,
        "prior_report_gap_filled",
        [
          addedMonths.length ? `${addedMonths.length} month(s) added from the prior workbook` : "",
          substituted.length
            ? `${substituted.length} thin month(s) taken from the prior workbook (${substituted
                .map((m) => m.month)
                .join(", ")})`
            : "",
        ]
          .filter(Boolean)
          .join("; "),
        { added_months: addedMonths, substituted },
        actorId,
      );
    }



    // Previous baseline: the most recent other run for this property with a snapshot.
    // A reviewer-pinned baseline (including a deliberate "none") is never overridden.
    let previousRunId = run.previous_run_id;
    if (!previousRunId && !run.baseline_locked) {
      const { data: prior } = await admin
        .from("report_runs")
        .select("id")
        .eq("property_id", run.property_id)
        .neq("id", runId)
        .lte("as_of_date", run.as_of_date)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      previousRunId = prior?.id ?? null;
    }

    let previousRevenue: Record<string, number> = {};
    let previousNights: Record<string, number> = {};
    if (previousRunId) {
      const { data: prevSnapshot } = await admin
        .from("report_snapshots")
        .select("otb_revenue, room_nights")
        .eq("run_id", previousRunId)
        .maybeSingle();
      previousRevenue = (prevSnapshot?.otb_revenue as Record<string, number>) ?? {};
      previousNights = (prevSnapshot?.room_nights as Record<string, number>) ?? {};
    }

    // Last-year actuals from the property's historical baseline.
    const baseline = (settings?.historical_baseline ?? {}) as {
      revenue?: Record<string, number>;
      room_nights?: Record<string, number>;
    };
    const lastYearRevenue: Record<string, number> = {};
    const lastYearNights: Record<string, number> = {};
    for (const key of aggregate.months) {
      const [year, month] = key.split("-").map(Number);
      const lyKey = `${year - 1}-${`${month}`.padStart(2, "0")}`;
      const lyRevenue = baseline.revenue?.[lyKey] ?? pastRevenue[lyKey];
      const lyNights = baseline.room_nights?.[lyKey] ?? pastNights[lyKey];
      if (lyRevenue !== undefined) lastYearRevenue[key] = lyRevenue;
      if (lyNights !== undefined) lastYearNights[key] = lyNights;
    }

    // A first run has no earlier run: fall back to figures imported from the
    // property's existing consolidated report workbook.
    applyImportedBaseline(run.imported_baseline, aggregate.months, {
      previousRevenue,
      previousNights,
      lastYearRevenue,
      lastYearNights,
    });

    // Monthly extras: calculated from the export, with reviewer overrides on top.
    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select("dinner_by_month, room0_by_month, comp_rns_by_month, overrides")
      .eq("run_id", runId)
      .maybeSingle();
    const resolvedInputs = resolveAdditionalInputs(aggregate.derived_inputs, inputs ?? null);
    const dinner = resolvedInputs.dinner_by_month;
    const room0 = resolvedInputs.room0_by_month;
    const additional: Record<string, number> = {};
    for (const key of aggregate.months) {
      additional[key] = (Number(dinner[key]) || 0) + (Number(room0[key]) || 0);
    }


    const { error: snapshotError } = await admin.from("report_snapshots").upsert(
      {
        run_id: runId,
        months: aggregate.months,
        otb_revenue: aggregate.otb_revenue,
        previous_otb_revenue: previousRevenue,
        last_year_actual: lastYearRevenue,
        room_nights: aggregate.room_nights,
        previous_room_nights: previousNights,
        last_year_room_nights: lastYearNights,
        capacity_days: aggregate.capacity_days,
        additional_revenue: additional,
        source_breakdown: aggregate.source_breakdown,
        adr: aggregate.adr,
        occupancy: aggregate.occupancy,
        non_sellable: aggregate.non_sellable,
        derived_inputs: aggregate.derived_inputs,
        excluded_rows: {
          months: aggregate.excluded_rows,
          by_reason: aggregate.non_sellable_by_reason,
          kept_zero_revenue: aggregate.kept_zero_revenue,
        },
        totals: aggregate.totals,
        room_count: roomCount,
        booking_trends: buildBookingTrends(ledger, aggregate.months),
      },
      { onConflict: "run_id" },
    );
    if (snapshotError) {
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: snapshotError.message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", snapshotError.message, {}, actorId);
      return json({ error: snapshotError.message }, 500);
    }


    // Fold completed (fully past) months into the property's historical baseline so
    // future runs have last-year actuals without any manual import. Existing values win.
    try {
      const now = new Date();
      const currentKey = `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, "0")}`;
      const revenueBase = { ...(baseline.revenue ?? {}) } as Record<string, number>;
      const nightsBase = { ...(baseline.room_nights ?? {}) } as Record<string, number>;
      const sources = {
        ...((settings?.historical_baseline as { sources?: Record<string, string> } | null)
          ?.sources ?? {}),
      } as Record<string, string>;
      let changed = false;
      const foldable: { month: string; revenue: number; nights: number }[] = [
        ...aggregate.months.map((key) => ({
          month: key,
          revenue: aggregate.otb_revenue[key] ?? 0,
          nights: aggregate.room_nights[key] ?? 0,
        })),
        ...pastMonths,
      ];
      for (const entry of foldable) {
        const key = entry.month;
        if (key >= currentKey) continue; // month still running or in the future
        if (revenueBase[key] === undefined) {
          revenueBase[key] = entry.revenue;
          sources[key] = "run";
          changed = true;
        }
        if (nightsBase[key] === undefined) {
          nightsBase[key] = entry.nights;
          sources[key] = sources[key] ?? "run";
          changed = true;
        }
      }
      if (changed) {
        const years = [
          ...new Set(
            Object.keys({ ...revenueBase, ...nightsBase }).map((key) => Number(key.slice(0, 4))),
          ),
        ]
          .filter((year) => Number.isFinite(year))
          .sort((a, b) => a - b);
        await admin.from("property_report_settings").upsert(
          {
            property_id: run.property_id,
            room_count: roomCount,
            historical_baseline: {
              years,
              revenue: revenueBase,
              room_nights: nightsBase,
              sources,
            },
          },
          { onConflict: "property_id" },
        );
      }
    } catch (baselineError) {
      console.error("historical baseline backfill skipped:", baselineError);
    }

    await admin
      .from("report_runs")
      .update({
        status: "ready",
        previous_run_id: previousRunId,
        error_message: null,
        processing_note: null,
        excel_path: null,
        excel_generated_at: null,
      })
      .eq("id", runId);

    await logRunEvent(
      admin,
      runId,
      "processing_succeeded",
      `${ledger.length} booking row(s) aggregated across ${aggregate.months.length} month(s)`,
      {
        rows_parsed: ledger.length,
        months: aggregate.months.length,
        files: fileResults.length,
        room_count: roomCount,
      },
      actorId,
    );

    return json({
      success: true,
      run_id: runId,
      room_count: roomCount,
      rows_parsed: ledger.length,
      files: fileResults,
      months: aggregate.months,
      totals: aggregate.totals,
    });
  } catch (error) {

    const message = error instanceof Error ? error.message : "Unexpected parser failure";
    console.error("nightsbridge-report-parser failed:", message);
    if (runId) {
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", message);
    }

    return json({ error: message }, 500);
  }
});
