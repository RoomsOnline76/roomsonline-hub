// Generates the consolidated three-sheet revenue report workbook for a run.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildRevenueWorkbook,
  type CarryForwardSheets,
  type HistoricalBaseline,
} from "../_shared/revenueReportWorkbook.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const numberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
    const runId = typeof body?.run_id === "string" ? body.run_id : "";
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select(
        "id, property_id, as_of_date, previous_run_id, imported_baseline, title, cadence, source_type, properties(name)",
      )
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const { data: snapshot, error: snapshotError } = await admin
      .from("report_snapshots")
      .select("*")
      .eq("run_id", runId)
      .maybeSingle();
    if (snapshotError) return json({ error: snapshotError.message }, 500);
    if (!snapshot) {
      return json({ error: "This run has no snapshot yet — process the files first." }, 409);
    }

    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, brand_primary, historical_baseline")
      .eq("property_id", run.property_id)
      .maybeSingle();

    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select(
        "dinner_by_month, room0_by_month, comp_rns_by_month, min_stay_notes, promotions_notes, rate_override_notes, free_commentary",
      )
      .eq("run_id", runId)
      .maybeSingle();

    let previousAsOf: string | null = null;
    if (run.previous_run_id) {
      const { data: prev } = await admin
        .from("report_runs")
        .select("as_of_date")
        .eq("id", run.previous_run_id)
        .maybeSingle();
      previousAsOf = prev?.as_of_date ?? null;
    }
    // A first run compares against the imported workbook's OTB column, so the
    // header must name that date rather than printing "OTB @ n/a".
    const imported = (run.imported_baseline ?? null) as {
      as_of_date?: string | null;
      previous_occupancy?: unknown;
      last_year_occupancy?: unknown;
      targets?: unknown;
      target_uplift?: unknown;
      historical_occupancy?: unknown;
      carry_forward?: unknown;
    } | null;
    if (!previousAsOf) {
      previousAsOf = imported?.as_of_date ?? null;
    }


    // Everything the client's own workbook carried that the parser cannot see:
    // occupancy percentages, the target column and hand-kept sheets.
    const carryForward = (() => {
      const raw = imported?.carry_forward;
      if (!raw || typeof raw !== "object") return {} as CarryForwardSheets;
      const out: CarryForwardSheets = {};
      for (const [name, grid] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(grid)) out[name] = grid as CarryForwardSheets[string];
      }
      return out;
    })();

    const propertyName =
      (run as unknown as { properties?: { name?: string | null } }).properties?.name ??
      "Property";

    const bytes = await buildRevenueWorkbook({
      propertyName,
      asOfDate: String(run.as_of_date).slice(0, 10),
      previousAsOfDate: previousAsOf ? String(previousAsOf).slice(0, 10) : null,
      brandPrimary: settings?.brand_primary ?? null,
      historicalBaseline: (settings?.historical_baseline ?? {}) as HistoricalBaseline,
      snapshot: {
        months: Array.isArray(snapshot.months) ? (snapshot.months as string[]) : [],
        otb_revenue: numberMap(snapshot.otb_revenue),
        previous_otb_revenue: numberMap(snapshot.previous_otb_revenue),
        last_year_actual: numberMap(snapshot.last_year_actual),
        room_nights: numberMap(snapshot.room_nights),
        previous_room_nights: numberMap(snapshot.previous_room_nights),
        last_year_room_nights: numberMap(snapshot.last_year_room_nights),
        capacity_days: numberMap(snapshot.capacity_days),
        room_count: Number(snapshot.room_count ?? settings?.room_count ?? 1) || 1,
      },
      inputs: {
        dinner_by_month: numberMap(inputs?.dinner_by_month),
        room0_by_month: numberMap(inputs?.room0_by_month),
        comp_rns_by_month: numberMap(inputs?.comp_rns_by_month),
        min_stay_notes: inputs?.min_stay_notes ?? null,
        promotions_notes: inputs?.promotions_notes ?? null,
        rate_override_notes: inputs?.rate_override_notes ?? null,
        free_commentary: inputs?.free_commentary ?? null,
      },
      extras: {
        sourceType: run.source_type ?? null,
        cadence: run.cadence ?? null,
        targets: numberMap(imported?.targets),
        targetUplift: Number.isFinite(Number(imported?.target_uplift))
          ? Number(imported?.target_uplift)
          : null,
        previousOccupancy: numberMap(imported?.previous_occupancy),
        lastYearOccupancy: numberMap(imported?.last_year_occupancy),
        historicalOccupancy: numberMap(imported?.historical_occupancy),
        carryForward,
      },
    });

    const asOf = String(run.as_of_date).slice(0, 10);
    const path = `${run.property_id}/${runId}/consolidated-${asOf}.xlsx`;
    const upload = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (upload.error) return json({ error: upload.error.message }, 500);

    await admin
      .from("report_runs")
      .update({ excel_path: path, excel_generated_at: new Date().toISOString() })
      .eq("id", runId);

    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
    if (signed.error) return json({ error: signed.error.message }, 500);

    await logRunEvent(
      admin,
      runId,
      "excel_generated",
      `Workbook generated (${Math.round(bytes.byteLength / 1024)} KB)`,
      { path, bytes: bytes.byteLength },
      userData.user.id,
    );

    return json({ success: true, path, url: signed.data.signedUrl, bytes: bytes.byteLength });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook generation failed";
    console.error("revenue-report-excel failed:", message);
    return json({ error: message }, 500);
  }
});
