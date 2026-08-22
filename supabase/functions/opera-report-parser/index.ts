// Parses Oracle OPERA "History and Forecast" monthly PDF extracts for a report
// run and writes the snapshot. Mirrors the NightsBridge parser's contract:
// { run_id, file_id? } in, { rows_parsed, months, files, status } out.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { aggregateLedger, type LedgerRow } from "../_shared/nightsbridgeAggregate.ts";
import {
  impliedRoomCount,
  operaDaysToLedger,
  parseOperaHistoryForecast,
  reconstructLines,
  type OperaDay,
  type PdfTextItem,
} from "../_shared/operaHistoryForecast.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";
import {
  applyImportedBaseline,
  reconcileWithImportedBaseline,
} from "../_shared/reportImportedBaseline.ts";

const BUCKET = "revenue-reports";
/** Stop taking on new files once this much of the invocation budget is gone. */
const TIME_BUDGET_MS = 100_000;

interface ParsedFile {
  rows: LedgerRow[];
  days: OperaDay[];
  errors: string[];
  warnings: string[];
}

/** Extracts positioned text items from every page of a PDF. */
async function extractItems(buffer: ArrayBuffer): Promise<PdfTextItem[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const items: PdfTextItem[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    // Pages are stacked by offsetting the baseline so page order is preserved.
    const offset = (pageNumber - 1) * 100_000;
    for (const raw of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof raw.str !== "string" || !raw.str.trim() || !raw.transform) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5] - offset });
    }
  }
  return items;
}

async function parsePdf(buffer: ArrayBuffer, filename: string): Promise<ParsedFile> {
  let items: PdfTextItem[];
  try {
    items = await extractItems(buffer);
  } catch (error) {
    return {
      rows: [],
      days: [],
      warnings: [],
      errors: [
        `${filename}: unreadable PDF (${error instanceof Error ? error.message : "unknown"})`,
      ],
    };
  }

  if (!items.length) {
    return {
      rows: [],
      days: [],
      warnings: [],
      errors: [`${filename}: no text layer found — scanned PDFs are not supported`],
    };
  }

  const parsed = parseOperaHistoryForecast(reconstructLines(items), filename);
  if (parsed.errors.length) {
    return { rows: [], days: [], errors: parsed.errors, warnings: parsed.warnings };
  }
  return {
    rows: operaDaysToLedger(parsed.days),
    days: parsed.days,
    errors: [],
    warnings: parsed.warnings,
  };
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
    const actorId = userData.user.id;
    const startedAt = Date.now();

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, previous_run_id, baseline_locked, imported_baseline, status")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

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
        {
          error: onlyFileId
            ? "File not found on this run"
            : "No source files uploaded for this run",
        },
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
        `Processing started for ${files.length} OPERA extract(s)`,
        { file_count: files.length, source: "opera" },
        actorId,
      );
    }

    const ledger: LedgerRow[] = [];
    const allDays: OperaDay[] = [];
    const fileResults: Array<{
      id: string;
      filename: string;
      parsed_ok: boolean;
      row_count: number;
      errors: string[];
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
        });
        processedFiles += 1;
        continue;
      }

      // One PDF at a time — the buffer is released before the next file.
      let parsed: ParsedFile;
      {
        const buffer = await download.data.arrayBuffer();
        parsed = await parsePdf(buffer, file.original_filename);
      }
      const ok = parsed.rows.length > 0;
      if (ok) {
        for (const row of parsed.rows) ledger.push(row);
        for (const day of parsed.days) allDays.push(day);
      }
      fileResults.push({
        id: file.id,
        filename: file.original_filename,
        parsed_ok: ok,
        row_count: parsed.days.length,
        errors: [...parsed.errors, ...parsed.warnings],
      });
      parsed.rows.length = 0;
      parsed.days.length = 0;
      processedFiles += 1;
    }

    await Promise.all(
      fileResults.map((result) =>
        admin
          .from("report_source_files")
          .update({
            parsed_ok: result.parsed_ok,
            row_count: result.row_count,
            parse_errors: result.errors.length ? result.errors : null,
          })
          .eq("id", result.id),
      ),
    );

    if (onlyFileId) {
      const result = fileResults[0];
      await logRunEvent(
        admin,
        runId,
        "file_reparsed",
        `${result.filename}: ${result.parsed_ok ? `${result.row_count} day(s) parsed` : "parse failed"}`,
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
      await logRunEvent(
        admin,
        runId,
        "processing_partial",
        message,
        { processed: processedFiles, total: files.length },
        actorId,
      );
      return json(
        {
          error: message,
          partial: true,
          processed: processedFiles,
          total: files.length,
          files: fileResults,
        },
        422,
      );
    }

    if (ledger.length === 0) {
      const message =
        fileResults.flatMap((r) => r.errors)[0] ?? "No usable OPERA daily rows found";
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", message, { files: fileResults }, actorId);
      return json({ error: message, files: fileResults }, 422);
    }

    // A re-process must never blend with the previous result.
    await admin.from("report_snapshots").delete().eq("run_id", runId);

    // Property capacity configuration.
    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, historical_baseline")
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

    // OPERA prints occupancy %, so the sellable room count can be cross-checked.
    const implied = impliedRoomCount(allDays);
    if (implied && Math.abs(implied - roomCount) > Math.max(1, roomCount * 0.05)) {
      await logRunEvent(
        admin,
        runId,
        "capacity_mismatch",
        `Configured sellable rooms (${roomCount}) differs from the ${implied} implied by the OPERA occupancy percentages`,
        { configured: roomCount, implied },
        actorId,
      );
    }

    const aggregate = aggregateLedger(ledger, roomCount);

    // Months the prior workbook covers but the uploads do not, plus thin months.
    reconcileWithImportedBaseline(aggregate, run.imported_baseline, roomCount);

    // Previous baseline: the most recent other run for this property with a snapshot.
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
      if (baseline.revenue?.[lyKey] !== undefined) lastYearRevenue[key] = baseline.revenue[lyKey];
      if (baseline.room_nights?.[lyKey] !== undefined) {
        lastYearNights[key] = baseline.room_nights[lyKey];
      }
    }

    // A first run has no earlier run: fall back to figures imported from the
    // property's existing consolidated report workbook.
    applyImportedBaseline(run.imported_baseline, aggregate.months, {
      previousRevenue,
      previousNights,
      lastYearRevenue,
      lastYearNights,
    });

    // Comp / house-use nights come straight off the extract — pre-fill any month
    // the reviewer has not already answered for, then read the merged values back.
    const compByMonth: Record<string, number> = {};
    for (const day of allDays) {
      const key = day.date.slice(0, 7);
      compByMonth[key] = (compByMonth[key] ?? 0) + day.compRooms + day.houseUseRooms;
    }

    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select("dinner_by_month, room0_by_month, comp_rns_by_month")
      .eq("run_id", runId)
      .maybeSingle();
    const existingComp = (inputs?.comp_rns_by_month ?? {}) as Record<string, number>;
    const mergedComp = { ...compByMonth, ...existingComp };
    if (JSON.stringify(mergedComp) !== JSON.stringify(existingComp)) {
      await admin
        .from("report_additional_inputs")
        .upsert({ run_id: runId, comp_rns_by_month: mergedComp }, { onConflict: "run_id" });
    }

    const dinner = (inputs?.dinner_by_month ?? {}) as Record<string, number>;
    const room0 = (inputs?.room0_by_month ?? {}) as Record<string, number>;
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
        totals: aggregate.totals,
        room_count: roomCount,
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

    // Fold completed (fully past) months into the property's historical baseline.
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
      for (const key of aggregate.months) {
        if (key >= currentKey) continue;
        if (revenueBase[key] === undefined) {
          revenueBase[key] = aggregate.otb_revenue[key] ?? 0;
          sources[key] = "run";
          changed = true;
        }
        if (nightsBase[key] === undefined) {
          nightsBase[key] = aggregate.room_nights[key] ?? 0;
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
      `${allDays.length} OPERA day(s) aggregated across ${aggregate.months.length} month(s)`,
      {
        rows_parsed: allDays.length,
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
      rows_parsed: allDays.length,
      files: fileResults,
      months: aggregate.months,
      totals: aggregate.totals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected parser failure";
    console.error("opera-report-parser failed:", message);
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
