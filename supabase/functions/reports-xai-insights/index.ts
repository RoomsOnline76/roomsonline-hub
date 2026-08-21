// Revenue report AI insights: deterministic anomaly maths in code, narrative
// phrasing by TOBI's reserve brain. Nothing numeric ever comes from the model.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import {
  detectAnomalies,
  summariseSnapshot,
  type AnomalyFlag,
  type AnomalySnapshot,
} from "../_shared/reportAnomalies.ts";
import { aiChat, modelForTask, AI_TEMPERATURE } from "../_shared/aiModels.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const MAX_SUGGESTION_CHARS = 480;
const MAX_NARRATIVE_CHARS = 1800;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BodySchema = z.object({
  run_id: z.string().uuid(),
  action: z.enum(["generate"]).default("generate"),
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

const clamp = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
};

const SYSTEM_PROMPT = `You are TOBI, the revenue analyst for a South African hospitality group.
You write the commentary for a monthly revenue outlook report that an owner reads.

Hard rules:
- Use ONLY the figures given to you in the "facts" and "snapshot" data. Never calculate,
  estimate, round differently, or invent any number, month, or percentage.
- Currency is South African rand, written as R129 000 style. Keep it plain and calm.
- No vendor names, no mention of AI, models or providers. No emojis. No markdown headings.
- British/South African English. Avoid hype words ("skyrocket", "phenomenal").

Return STRICT JSON with exactly these keys:
{
  "narrative": "two short paragraphs separated by a blank line",
  "flag_notes": { "<flag id>": "one plain sentence explaining what it means and what to do" },
  "suggestions": {
    "min_stay_notes": "suggested minimum-stay commentary or empty string",
    "promotions_notes": "suggested promotions commentary or empty string",
    "rate_override_notes": "suggested rate-override commentary or empty string",
    "free_commentary": "suggested general commentary or empty string"
  },
  "chart_recommendation": "one sentence naming the single chart that best tells this story"
}`;

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

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { run_id: runId } = parsed.data;

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, title, properties(name)")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const { data: snapshotRow, error: snapshotError } = await admin
      .from("report_snapshots")
      .select("*")
      .eq("run_id", runId)
      .maybeSingle();
    if (snapshotError) return json({ error: snapshotError.message }, 500);
    if (!snapshotRow) {
      return json({ error: "This run has no snapshot yet — process the files first." }, 409);
    }

    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select("min_stay_notes, promotions_notes, rate_override_notes, free_commentary")
      .eq("run_id", runId)
      .maybeSingle();

    const snapshot: AnomalySnapshot = {
      months: Array.isArray(snapshotRow.months) ? (snapshotRow.months as string[]) : [],
      otb_revenue: numberMap(snapshotRow.otb_revenue),
      previous_otb_revenue: numberMap(snapshotRow.previous_otb_revenue),
      last_year_actual: numberMap(snapshotRow.last_year_actual),
      room_nights: numberMap(snapshotRow.room_nights),
      previous_room_nights: numberMap(snapshotRow.previous_room_nights),
      last_year_room_nights: numberMap(snapshotRow.last_year_room_nights),
      capacity_days: numberMap(snapshotRow.capacity_days),
      additional_revenue: numberMap(snapshotRow.additional_revenue),
      adr: numberMap(snapshotRow.adr),
      occupancy: numberMap(snapshotRow.occupancy),
      source_breakdown:
        (snapshotRow.source_breakdown as AnomalySnapshot["source_breakdown"]) ?? {},
      room_count: Number(snapshotRow.room_count ?? 0) || 0,
      totals: (snapshotRow.totals as Record<string, number>) ?? {},
    };

    const flags: AnomalyFlag[] = detectAnomalies(snapshot);
    const propertyName =
      (run.properties as { name?: string } | null)?.name ?? run.title ?? "the property";

    const userPayload = {
      property: propertyName,
      as_of_date: run.as_of_date,
      facts: flags.map((flag) => ({ id: flag.id, severity: flag.severity, fact: flag.factText })),
      snapshot: summariseSnapshot(snapshot),
      existing_notes: {
        min_stay_notes: inputs?.min_stay_notes ?? "",
        promotions_notes: inputs?.promotions_notes ?? "",
        rate_override_notes: inputs?.rate_override_notes ?? "",
        free_commentary: inputs?.free_commentary ?? "",
      },
    };

    const outcome = await aiChat(
      {
        model: modelForTask("revenue_report_insights"),
        temperature: AI_TEMPERATURE.prose,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      },
      { label: "revenue-report-insights", preferFallback: true },
    );

    if (!outcome.ok) {
      return json({ error: outcome.error ?? "TOBI could not build the insights." }, outcome.status);
    }

    const content = String(
      (outcome.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
        ?.message?.content ?? "",
    );
    let ai: Record<string, unknown> = {};
    try {
      const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      ai = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return json({ error: "TOBI returned an unreadable response. Please try again." }, 502);
    }

    const notes = (ai.flag_notes ?? {}) as Record<string, unknown>;
    const enrichedFlags = flags.map((flag) => ({
      ...flag,
      note: clamp(notes[flag.id], MAX_SUGGESTION_CHARS),
    }));

    const rawSuggestions = (ai.suggestions ?? {}) as Record<string, unknown>;
    const suggestions: Record<string, string> = {};
    for (const key of [
      "min_stay_notes",
      "promotions_notes",
      "rate_override_notes",
      "free_commentary",
    ]) {
      const value = clamp(rawSuggestions[key], MAX_SUGGESTION_CHARS);
      if (value) suggestions[key] = value;
    }

    const record = {
      run_id: runId,
      narrative: clamp(ai.narrative, MAX_NARRATIVE_CHARS),
      flags: enrichedFlags,
      suggestions,
      chart_recommendation: clamp(ai.chart_recommendation, 240),
      provider: outcome.provider,
      generated_by: userData.user.id,
      generated_at: new Date().toISOString(),
    };

    const { error: saveError } = await admin
      .from("report_insights")
      .upsert(record, { onConflict: "run_id" });
    if (saveError) return json({ error: saveError.message }, 500);

    await logRunEvent(
      admin,
      runId,
      "insights_generated",
      "TOBI insights generated",
      { provider: outcome.provider },
      userData.user.id,
    );

    return json({ success: true, insights: record });
  } catch (err) {
    console.error("[revenue-report-insights] failed", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
