/**
 * Reads a property's existing consolidated revenue report workbook (uploaded on
 * the run as a `prior_report` file) and — on confirmation — folds its numbers
 * into a first run: previous-OTB, last-year actuals, the reviewer's manual
 * inputs and the property's historical baseline.
 *
 * Preview first, write second: the caller inspects what was found, ticks what to
 * apply, and only then is anything stored. Existing values are never overwritten
 * unless `replace_existing` is set.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parsePriorReportWorkbook } from "../_shared/priorReportWorkbook.ts";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type NumberMap = Record<string, number>;

interface Selections {
  previous_otb?: boolean;
  last_year?: boolean;
  additional_inputs?: boolean;
  historical?: boolean;
}

/** Merge `incoming` into `base`; existing keys win unless replacing. */
const mergeMap = (base: NumberMap, incoming: NumberMap, replace: boolean): NumberMap => {
  const out: NumberMap = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!Number.isFinite(value)) continue;
    if (replace || out[key] === undefined) out[key] = value;
  }
  return out;
};

const count = (map: NumberMap): number => Object.keys(map).length;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

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
    const runId = typeof body?.run_id === "string" ? body.run_id : "";
    const fileId = typeof body?.file_id === "string" ? body.file_id : "";
    const apply = body?.apply === true;
    const replace = body?.replace_existing === true;
    const selections: Selections = (body?.selections ?? {}) as Selections;
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, title")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    // Newest prior-report upload on the run, unless one was named.
    let fileQuery = admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      .eq("file_role", "prior_report");
    if (fileId) fileQuery = fileQuery.eq("id", fileId);
    const { data: files, error: filesError } = await fileQuery
      .order("created_at", { ascending: false })
      .limit(1);
    if (filesError) return json({ error: filesError.message }, 500);
    const file = files?.[0];
    if (!file) {
      return json({ error: "No prior report workbook uploaded on this run" }, 400);
    }

    const download = await admin.storage.from(BUCKET).download(file.storage_path);
    if (download.error || !download.data) {
      return json(
        { error: `Could not read ${file.original_filename}: ${download.error?.message ?? "download failed"}` },
        502,
      );
    }

    // The run's own as-of date decides which OTB column is the comparison
    // baseline — the newest one strictly older than this run.
    // protel-sourced workbooks arrive UTF-16 encoded; transcode before reading.
    const priorRepair = await repairWorkbookBuffer(await download.data.arrayBuffer());
    const extract = parsePriorReportWorkbook(priorRepair.buffer, {
      runAsOfDate: run.as_of_date ? String(run.as_of_date).slice(0, 10) : null,
    });


    const found = {
      previous_otb_months: count(extract.previousOtbRevenue),
      previous_nights_months: count(extract.previousRoomNights),
      last_year_months: count(extract.lastYearActual),
      last_year_nights_months: count(extract.lastYearRoomNights),
      dinner_months: count(extract.dinnerByMonth),
      room0_months: count(extract.room0ByMonth),
      comp_months: count(extract.compRnsByMonth),
      historical_revenue_months: count(extract.historicalRevenue),
      historical_nights_months: count(extract.historicalRoomNights),
      occupancy_months: count(extract.previousOccupancy) + count(extract.lastYearOccupancy),
      adr_months: count(extract.previousAdr) + count(extract.lastYearAdr),
      target_months: count(extract.targets),
      historical_occupancy_months: count(extract.historicalOccupancy),
      historical_adr_months: count(extract.historicalAdr),
      carry_forward_sheets: Object.keys(extract.carryForward).length,

    };

    const preview = {
      file: { id: file.id, filename: file.original_filename },
      as_of_date: extract.asOfDate,
      otb_column_label: extract.otbColumnLabel,
      baseline_sheet: extract.baselineSheet,
      months: extract.months,
      previous_otb_revenue: extract.previousOtbRevenue,
      current_otb_revenue: extract.currentOtbRevenue,
      previous_room_nights: extract.previousRoomNights,

      last_year_actual: extract.lastYearActual,
      last_year_room_nights: extract.lastYearRoomNights,
      dinner_by_month: extract.dinnerByMonth,
      room0_by_month: extract.room0ByMonth,
      comp_rns_by_month: extract.compRnsByMonth,
      historical_revenue: extract.historicalRevenue,
      historical_room_nights: extract.historicalRoomNights,
      previous_occupancy: extract.previousOccupancy,
      last_year_occupancy: extract.lastYearOccupancy,
      previous_adr: extract.previousAdr,
      last_year_adr: extract.lastYearAdr,
      targets: extract.targets,
      target_uplift: extract.targetUplift,
      historical_occupancy: extract.historicalOccupancy,
      historical_adr: extract.historicalAdr,

      carry_forward_sheets: Object.keys(extract.carryForward),
      sheets_read: extract.sheetsRead,
      sheets_skipped: extract.sheetsSkipped,
      warnings: extract.warnings,
      found,
    };

    if (!apply) return json({ applied: false, preview });

    /* ── Apply ─────────────────────────────────────────────── */
    const applied: string[] = [];

    if (selections.previous_otb !== false || selections.last_year !== false) {
      const importedBaseline = {
        source: "prior_report",
        filename: file.original_filename,
        file_id: file.id,
        as_of_date: extract.asOfDate,
        otb_column_label: extract.otbColumnLabel,
        imported_at: new Date().toISOString(),
        previous_otb_revenue: selections.previous_otb === false ? {} : extract.previousOtbRevenue,
        previous_room_nights: selections.previous_otb === false ? {} : extract.previousRoomNights,
        last_year_actual: selections.last_year === false ? {} : extract.lastYearActual,
        last_year_room_nights: selections.last_year === false ? {} : extract.lastYearRoomNights,
        // Occupancy, targets and hand-kept sheets ride along with the baseline
        // so the workbook builder can reproduce the client's own layout.
        previous_occupancy: selections.previous_otb === false ? {} : extract.previousOccupancy,
        last_year_occupancy: selections.last_year === false ? {} : extract.lastYearOccupancy,
        targets: extract.targets,
        target_uplift: extract.targetUplift,
        historical_occupancy: extract.historicalOccupancy,
        carry_forward: extract.carryForward,
      };
      const { error } = await admin
        .from("report_runs")
        .update({
          imported_baseline: importedBaseline,
          baseline_source: "imported",
          // Keeps the parser from silently replacing the imported figures with
          // an auto-picked earlier run.
          baseline_locked: true,
        })
        .eq("id", runId);
      if (error) return json({ error: error.message }, 500);
      if (selections.previous_otb !== false && found.previous_otb_months) {
        applied.push(`${found.previous_otb_months} month(s) previous OTB`);
      }
      if (selections.last_year !== false && found.last_year_months) {
        applied.push(`${found.last_year_months} month(s) last-year actual`);
      }
      if (found.occupancy_months) applied.push(`${found.occupancy_months} occupancy value(s)`);
      if (found.target_months) applied.push(`${found.target_months} month(s) target`);
      if (found.carry_forward_sheets) {
        applied.push(`${found.carry_forward_sheets} carried-forward sheet(s)`);
      }
    }

    if (selections.additional_inputs !== false) {
      const { data: existing } = await admin
        .from("report_additional_inputs")
        .select("dinner_by_month, room0_by_month, comp_rns_by_month")
        .eq("run_id", runId)
        .maybeSingle();
      const { error } = await admin.from("report_additional_inputs").upsert(
        {
          run_id: runId,
          dinner_by_month: mergeMap(
            (existing?.dinner_by_month ?? {}) as NumberMap,
            extract.dinnerByMonth,
            replace,
          ),
          room0_by_month: mergeMap(
            (existing?.room0_by_month ?? {}) as NumberMap,
            extract.room0ByMonth,
            replace,
          ),
          comp_rns_by_month: mergeMap(
            (existing?.comp_rns_by_month ?? {}) as NumberMap,
            extract.compRnsByMonth,
            replace,
          ),
        },
        { onConflict: "run_id" },
      );
      if (error) return json({ error: error.message }, 500);
      const inputMonths = found.dinner_months + found.room0_months + found.comp_months;
      if (inputMonths) applied.push(`${inputMonths} manual input value(s)`);
    }

    if (
      selections.historical !== false &&
      (found.historical_revenue_months ||
        found.historical_nights_months ||
        found.historical_occupancy_months)
    ) {
      const { data: settings } = await admin
        .from("property_report_settings")
        .select("room_count, historical_baseline")
        .eq("property_id", run.property_id)
        .maybeSingle();
      const baseline = (settings?.historical_baseline ?? {}) as {
        revenue?: NumberMap;
        room_nights?: NumberMap;
        occupancy?: NumberMap;
        sources?: Record<string, string>;
      };
      const revenue = mergeMap(baseline.revenue ?? {}, extract.historicalRevenue, replace);
      const roomNights = mergeMap(baseline.room_nights ?? {}, extract.historicalRoomNights, replace);
      const occupancy = mergeMap(baseline.occupancy ?? {}, extract.historicalOccupancy, replace);
      const sources = { ...(baseline.sources ?? {}) };
      for (const key of Object.keys({ ...extract.historicalRevenue, ...extract.historicalRoomNights })) {
        if (replace || sources[key] === undefined) sources[key] = "prior_report";
      }
      const years = [
        ...new Set(Object.keys({ ...revenue, ...roomNights }).map((key) => Number(key.slice(0, 4)))),
      ]
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => a - b);

      const { error } = await admin.from("property_report_settings").upsert(
        {
          property_id: run.property_id,
          room_count: settings?.room_count ?? 1,
          historical_baseline: { years, revenue, room_nights: roomNights, occupancy, sources },
        },
        { onConflict: "property_id" },
      );
      if (error) return json({ error: error.message }, 500);
      applied.push(`${years.length} year(s) historical baseline`);
    }

    await logRunEvent(
      admin,
      runId,
      "prior_report_imported",
      `Prior report imported from ${file.original_filename}${applied.length ? ` — ${applied.join(", ")}` : ""}`,
      { file_id: file.id, as_of_date: extract.asOfDate, found, replace },
      userData.user.id,
    );

    return json({ applied: true, summary: applied, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("report-prior-workbook-import failed:", message);
    return json({ error: message }, 500);
  }
});
