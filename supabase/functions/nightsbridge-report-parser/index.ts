// Parses NightsBridge bookingsummary exports for a report run and writes the snapshot.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import {
  aggregateLedger,
  type LedgerRow,
} from "../_shared/nightsbridgeAggregate.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";
import {
  applyImportedBaseline,
  extendReportWindow,
  importedBaselineMonths,
  substituteThinMonths,
} from "../_shared/reportImportedBaseline.ts";


const BUCKET = "revenue-reports";
/** Stop taking on new files once this much of the invocation budget is gone. */
const TIME_BUDGET_MS = 100_000;


const COLUMN_ALIASES: Record<keyof LedgerRow | "arrival" , string[]> = {
  booking_id: ["booking id"],
  arrival: ["arrival date", "arrival"],
  last_night: ["last night"],
  nights: ["nights"],
  revenue: ["revenue"],
  extras: ["extras"],
  commission: ["commission"],
  nett: ["nett", "net"],
  room_name: ["room name", "room"],
  source: ["source"],
  status: ["status"],
  type: ["type"],
  currency: ["currency"],
};

const REQUIRED = ["arrival", "nights", "revenue", "room_name"] as const;

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = `${value.getUTCMonth() + 1}`.padStart(2, "0");
    const d = `${value.getUTCDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${`${parsed.m}`.padStart(2, "0")}-${`${parsed.d}`.padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const dmy = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
};

interface ParsedFile {
  rows: LedgerRow[];
  errors: string[];
  skipped: number;
}

function parseWorkbook(buffer: ArrayBuffer, filename: string): ParsedFile {
  const errors: string[] = [];
  const rows: LedgerRow[] = [];
  let skipped = 0;

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  } catch (error) {
    return {
      rows,
      skipped,
      errors: [`${filename}: unreadable spreadsheet (${error instanceof Error ? error.message : "unknown"})`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows, skipped, errors: [`${filename}: no worksheets found`] };

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    raw: true,
  });

  // The export carries a title row (and a blank row) before the real header.
  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i += 1) {
    const cells = (grid[i] ?? []).map(clean);
    if (cells.includes("booking id") && cells.includes("arrival date") && cells.includes("revenue")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { rows, skipped, errors: [`${filename}: could not find the NightsBridge header row`] };
  }

  const header = (grid[headerIndex] ?? []).map(clean);
  const index: Partial<Record<keyof LedgerRow, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = header.findIndex((cell) => aliases.includes(cell));
    if (found >= 0) index[field as keyof LedgerRow] = found;
  }

  const missing = REQUIRED.filter((field) => index[field] === undefined);
  if (missing.length) {
    return { rows, skipped, errors: [`${filename}: missing column(s) ${missing.join(", ")}`] };
  }

  const at = (row: unknown[], field: keyof LedgerRow): unknown => {
    const col = index[field];
    return col === undefined ? undefined : row[col];
  };

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    if (row.every((cell) => cell === null || cell === undefined || cell === "")) continue;

    const arrival = toIsoDate(at(row, "arrival"));
    const nights = toNumber(at(row, "nights"));
    const revenue = toNumber(at(row, "revenue"));

    if (!arrival || !Number.isFinite(nights) || !Number.isFinite(revenue)) {
      skipped += 1;
      continue;
    }

    rows.push({
      booking_id: String(at(row, "booking_id") ?? "").replace(/\.0$/, ""),
      arrival,
      last_night: toIsoDate(at(row, "last_night")),
      nights,
      revenue,
      extras: Number.isFinite(toNumber(at(row, "extras"))) ? toNumber(at(row, "extras")) : 0,
      commission: Number.isFinite(toNumber(at(row, "commission"))) ? toNumber(at(row, "commission")) : 0,
      nett: Number.isFinite(toNumber(at(row, "nett"))) ? toNumber(at(row, "nett")) : 0,
      room_name: String(at(row, "room_name") ?? "").trim(),
      source: String(at(row, "source") ?? "").trim(),
      status: String(at(row, "status") ?? "").trim(),
      type: String(at(row, "type") ?? "").trim(),
      currency: String(at(row, "currency") ?? "ZAR").trim() || "ZAR",
    });
  }

  if (skipped > 0) {
    errors.push(`${skipped} row(s) skipped: missing arrival date, nights or revenue`);
  }
  return { rows, skipped, errors };
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
      .neq("file_role", "prior_report");
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

      // Parse one workbook at a time and release the buffer before the next file.
      let parsed: ParsedFile;
      {
        const buffer = await download.data.arrayBuffer();
        parsed = parseWorkbook(buffer, file.original_filename);
      }
      const ok = parsed.rows.length > 0;
      if (ok) {
        for (const row of parsed.rows) ledger.push(row);
      }
      fileResults.push({
        id: file.id,
        filename: file.original_filename,
        parsed_ok: ok,
        row_count: parsed.rows.length,
        errors: parsed.errors,
      });
      parsed.rows.length = 0;
      processedFiles += 1;
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
        `${result.filename}: ${result.parsed_ok ? `${result.row_count} row(s) parsed` : "parse failed"}`,
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

    const aggregate = aggregateLedger(ledger, roomCount);

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

    // Manual extras (dinner / room 0 / comp nights) supplied by the reviewer.
    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select("dinner_by_month, room0_by_month")
      .eq("run_id", runId)
      .maybeSingle();
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
      for (const key of aggregate.months) {
        if (key >= currentKey) continue; // month still running or in the future
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
