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
import { reportMonthAnchor, windowMonths } from "../_shared/reportWindow.ts";


const MAX_SUGGESTION_CHARS = 480;
const MAX_NARRATIVE_CHARS = 1800;
/** Provider link caps are small, so slides are inlined as base64 — keep the pass bounded. */
const MAX_SLIDE_IMAGES = 12;
const MAX_SLIDE_BYTES = 4_500_000;
const MEDIA_BUCKET = "revenue-reports";

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

interface SlideImage {
  /** Human label used in the report and in TOBI's references. */
  label: string;
  caption: string | null;
  dataUrl: string;
}

/**
 * Loads every pasted screenshot on the run — standard slots and custom
 * additional slides — in the reviewer's slide order, inlined as base64 so the
 * provider never has to fetch a link.
 */
const loadSlideImages = async (
  admin: ReturnType<typeof createClient>,
  runId: string,
  pageOrder: unknown,
): Promise<SlideImage[]> => {
  const { data: rows } = await admin
    .from("report_media")
    .select("slot_key, storage_path, caption, section_title, sort_order, content_type")
    .eq("run_id", runId)
    .order("sort_order", { ascending: true });
  if (!rows || rows.length === 0) return [];

  const { data: slots } = await admin
    .from("report_media_slots")
    .select("slot_key, section, title, sort_order")
    .eq("run_id", runId);
  const slotTitle = new Map<string, string>();
  for (const slot of slots ?? []) {
    slotTitle.set(
      String(slot.slot_key),
      String(slot.section ?? slot.title ?? "Additional slide"),
    );
  }

  // Respect the reviewer's page order where it names media pages.
  const order = Array.isArray((pageOrder as { order?: unknown })?.order)
    ? ((pageOrder as { order: unknown[] }).order.map(String))
    : [];
  const rank = (slotKey: string): number => {
    const idx = order.findIndex((key) => key === slotKey || key === `media:${slotKey}`);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  const sorted = [...rows].sort((a, b) => {
    const diff = rank(String(a.slot_key)) - rank(String(b.slot_key));
    if (diff !== 0) return diff;
    return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  });

  const slides: SlideImage[] = [];
  let budget = MAX_SLIDE_BYTES;
  for (const row of sorted) {
    if (slides.length >= MAX_SLIDE_IMAGES) break;
    const path = String(row.storage_path ?? "");
    if (!path) continue;
    const { data: blob, error } = await admin.storage.from(MEDIA_BUCKET).download(path);
    if (error || !blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > budget) continue;
    budget -= bytes.byteLength;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const mime = String(row.content_type ?? blob.type ?? "image/png") || "image/png";
    if (!mime.startsWith("image/")) continue;
    slides.push({
      label:
        clamp(row.section_title, 120) ??
        slotTitle.get(String(row.slot_key)) ??
        String(row.slot_key),
      caption: clamp(row.caption, 240),
      dataUrl: `data:${mime};base64,${btoa(binary)}`,
    });
  }
  return slides;
};

const SLIDES_PROMPT = `

Slides:
The user message may include extra screenshots the revenue team pasted into the report
(channel mixes, competitor rates, market or portal screenshots), each with the slide
title it sits under. Read them and let what you see shape the recommendations.
- Never take a number, month or percentage for the "narrative" from a screenshot — the
  narrative is built only from "facts" and "snapshot".
- Screenshot-derived observations may appear only in "suggestions" and "flag_notes",
  and must name the slide they came from, e.g. "the Airbnb performance slide shows…".
- If a slide has a title but nothing legible or relevant, ignore it silently. Never guess
  at figures you cannot read.`;

const SYSTEM_PROMPT = `You are TOBI, the revenue analyst for a South African hospitality group.
You write the commentary for a monthly revenue outlook report that an owner reads.

Hard rules:
- Use ONLY the figures given to you in the "facts" and "snapshot" data. Never calculate,
  estimate, round differently, or invent any number, month, or percentage.
- The reporting period is given in "period". Write about those months ONLY. Earlier months
  in the data are last-year and historical comparatives: you may reference them inside a
  period month's line ("against last year's R1,7m"), never as a line of their own.
- Currency is South African rand, written as R129 000 style. Keep it plain and calm.
- No vendor names, no mention of AI, models or providers. No emojis. No markdown headings.
- British/South African English. Avoid hype words ("skyrocket", "phenomenal").

House style for the narrative — one line per month, in chronological order, blank line
between lines, no bullets or dashes at the start. Each line reads:
"<Month> - <what happened>, <gap or lead vs target or last year>!"
Worked examples of the exact tone and shape (numbers here are illustrative only):
"July - ended with R144k on the books, R66k (84%) ahead on target!"
"September - had a pick-up of R11k, trailing last year by R28k (43%)."
"October - R74k increase, needing R48k (16%) to achieve target."
Use "k" abbreviations exactly as above for these month lines. Use an exclamation mark only
where the month is ahead; a full stop otherwise. Cover exactly the months listed in
"period.months", in that order — no more, no fewer. Where a period month carries no
figures, write "<Month> - no figures on the books yet." and nothing more for that month.


Return STRICT JSON with exactly these keys:
{
  "narrative": "one line per month in the house style, separated by blank lines",

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
      .select(
        "id, property_id, as_of_date, report_month, source_type, title, page_order, properties(name)",
      )
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

    /* ── The reporting period ────────────────────────────────────
       Snapshots also carry last-year and historical comparative months
       (folded in by the source parsers and the prior-report import). TOBI
       reads the printed window only: the anchor month plus the next five. */
    const asOfDate = String(run.as_of_date ?? "").slice(0, 10);
    const reportMonth = run.report_month ? String(run.report_month).slice(0, 7) : null;
    const anchorMonth = reportMonthAnchor(asOfDate, reportMonth);
    const periodMonths = windowMonths(asOfDate, reportMonth);
    const inPeriod = (key: string) => periodMonths.includes(key);
    const scoped = (map: Record<string, number>): Record<string, number> =>
      Object.fromEntries(Object.entries(map).filter(([key]) => inPeriod(key)));

    const allMonths = Array.isArray(snapshotRow.months) ? (snapshotRow.months as string[]) : [];
    const otbRevenue = scoped(numberMap(snapshotRow.otb_revenue));
    const roomNights = scoped(numberMap(snapshotRow.room_nights));
    const capacityDays = scoped(numberMap(snapshotRow.capacity_days));
    const additionalRevenue = scoped(numberMap(snapshotRow.additional_revenue));
    const adr = scoped(numberMap(snapshotRow.adr));
    const occupancy = scoped(numberMap(snapshotRow.occupancy));

    const sumOf = (map: Record<string, number>) =>
      Object.values(map).reduce((total, value) => total + value, 0);
    const totalNights = sumOf(roomNights);
    const totalCapacity = sumOf(capacityDays);
    const priorTotals = (snapshotRow.totals as Record<string, number>) ?? {};

    const snapshot: AnomalySnapshot = {
      months: periodMonths,
      otb_revenue: otbRevenue,
      previous_otb_revenue: scoped(numberMap(snapshotRow.previous_otb_revenue)),
      last_year_actual: scoped(numberMap(snapshotRow.last_year_actual)),
      room_nights: roomNights,
      previous_room_nights: scoped(numberMap(snapshotRow.previous_room_nights)),
      last_year_room_nights: scoped(numberMap(snapshotRow.last_year_room_nights)),
      capacity_days: capacityDays,
      additional_revenue: additionalRevenue,
      adr,
      occupancy,
      source_breakdown:
        (snapshotRow.source_breakdown as AnomalySnapshot["source_breakdown"]) ?? {},
      room_count: Number(snapshotRow.room_count ?? 0) || 0,
      // Totals rebuilt over the period so no all-years figure reaches the model.
      totals: {
        revenue: sumOf(otbRevenue),
        extras: sumOf(additionalRevenue),
        nights: totalNights,
        capacity_days: totalCapacity,
        adr: totalNights > 0 ? sumOf(otbRevenue) / totalNights : undefined,
        occupancy: totalCapacity > 0 ? totalNights / totalCapacity : undefined,
        bookings: priorTotals.bookings,
      },
    };

    if (Object.keys(otbRevenue).length === 0) {
      return json(
        {
          error:
            `No figures fall inside this run's reporting period (${periodMonths[0]} to ` +
            `${periodMonths[periodMonths.length - 1]}). Set the run's report month, or reprocess ` +
            `the source files, before asking TOBI for a read.`,
        },
        409,
      );
    }

    const flags: AnomalyFlag[] = detectAnomalies(snapshot);
    const propertyName =
      (run.properties as { name?: string } | null)?.name ?? run.title ?? "the property";

    const userPayload = {
      property: propertyName,
      as_of_date: run.as_of_date,
      period: {
        report_month: anchorMonth,
        months: periodMonths,
        source: run.source_type ?? "unknown",
        note:
          "Write about period.months only. The uploads also held " +
          `${allMonths.filter((key) => !inPeriod(key)).length} earlier comparative month(s); ` +
          "they are not part of this report.",
      },
      facts: flags.map((flag) => ({ id: flag.id, severity: flag.severity, fact: flag.factText })),
      snapshot: summariseSnapshot(snapshot),
      existing_notes: {
        min_stay_notes: inputs?.min_stay_notes ?? "",
        promotions_notes: inputs?.promotions_notes ?? "",
        rate_override_notes: inputs?.rate_override_notes ?? "",
        free_commentary: inputs?.free_commentary ?? "",
      },
    };


    const slides = await loadSlideImages(admin, runId, run.page_order);
    const slideTitles = [...new Set(slides.map((slide) => slide.label))];

    const textOnlyMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ];

    const visionMessages = [
      { role: "system", content: `${SYSTEM_PROMPT}${SLIDES_PROMPT}` },
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify(userPayload) },
          ...slides.flatMap((slide) => [
            {
              type: "text",
              text: `Slide: ${slide.label}${slide.caption ? ` — ${slide.caption}` : ""}`,
            },
            { type: "image_url", image_url: { url: slide.dataUrl } },
          ]),
        ],
      },
    ];

    const runPass = async (withSlides: boolean) =>
      await aiChat(
        {
          model: modelForTask(
            withSlides ? "revenue_report_insights_vision" : "revenue_report_insights",
          ),
          temperature: AI_TEMPERATURE.prose,
          response_format: { type: "json_object" },
          messages: withSlides ? visionMessages : textOnlyMessages,
        },
        { label: "revenue-report-insights", preferFallback: true },
      );

    let usedSlides = slides.length > 0;
    let outcome = await runPass(usedSlides);

    // The narrative must always land: drop back to the text-only pass when the
    // vision request is terminally refused (bad body, credits, policy).
    if (!outcome.ok && usedSlides && [400, 402, 403, 413].includes(outcome.status)) {
      console.warn(
        `[revenue-report-insights] slide pass refused (${outcome.status}); retrying without slides`,
      );
      usedSlides = false;
      outcome = await runPass(false);
    }

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
      // A fresh generation supersedes the previous reviewer edits and ticks.
      narrative_final: null,
      selections: {},
      flags: enrichedFlags,
      suggestions,
      chart_recommendation: clamp(ai.chart_recommendation, 240),
      slides_considered: {
        count: usedSlides ? slides.length : 0,
        titles: usedSlides ? slideTitles : [],
        period: {
          report_month: anchorMonth,
          months: periodMonths,
          source: run.source_type ?? null,
        },
      },

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
      usedSlides
        ? `TOBI insights generated from ${slides.length} pasted slide${slides.length === 1 ? "" : "s"}`
        : "TOBI insights generated",
      { provider: outcome.provider, slides_considered: usedSlides ? slideTitles : [], period: periodMonths },

      userData.user.id,
    );


    return json({ success: true, insights: record });
  } catch (err) {
    console.error("[revenue-report-insights] failed", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
