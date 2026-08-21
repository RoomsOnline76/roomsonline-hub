// Generates the consolidated three-sheet revenue report workbook for a run.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildRevenueWorkbook,
  type HistoricalBaseline,
} from "../_shared/revenueReportWorkbook.ts";

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
      .select("id, property_id, as_of_date, previous_run_id, title, properties(name)")
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

    return json({ success: true, path, url: signed.data.signedUrl, bytes: bytes.byteLength });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook generation failed";
    console.error("revenue-report-excel failed:", message);
    return json({ error: message }, 500);
  }
});
