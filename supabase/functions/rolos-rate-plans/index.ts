/**
 * rolos-rate-plans — the single write path for the ROL'OS Rate Plans configurator.
 *
 * Actions
 *   sync_seasons : mirror the Calendar's seasons into rolos_shared_seasons (read-only mirror).
 *   preview      : price a draft plan with the SAME pure engine booking/ARI use.
 *   save_plan    : persist a plan and keep every backward-compatible store in step.
 *   copy_plan    : copy a plan (+ season pricing, units, restrictions) to sibling properties.
 *
 * Backward compatibility is the whole point of doing saves here: the Calendar season
 * rate outranks the plan season rate in the resolver, so authored season prices are
 * ALSO written back into properties.amenities.season_rates. Without that write-back an
 * edit made on this page would be invisible to today's booking engine and channels.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import {
  createRateResolver,
  seasonRateLookupKeys,
  type UnitRateContext,
} from "../_shared/rateResolution.ts";
import {
  applyDifferential,
  resolveNightRates,
  resolveStayRules,
  type DifferentialType,
  type PlanSeasonRate,
  type PricingInputs,
  type PricingRatePlan,
} from "../_shared/ratePricing.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface DraftUnit {
  room_type_id: string;
  differential_type?: DifferentialType;
  differential_value?: number | null;
}

interface DraftSeasonRate {
  calendar_season_id: string;
  mode?: "none" | "absolute" | "differential";
  base_rate?: number | null;
  differential_type?: DifferentialType;
  differential_value?: number | null;
  extra_adult_rate?: number | null;
  /** Per-unit cell values from the unit x season matrix; interpreted per `mode`. */
  unit_values?: Record<string, number | null>;
}

interface Draft {
  rate_plan_id?: string | null;
  name?: string;
  code?: string | null;
  description?: string | null;
  pricing_model?: string;
  base_rate?: number | null;
  is_active?: boolean;
  min_stay?: number | null;
  max_stay?: number | null;
  min_advance_days?: number | null;
  max_advance_days?: number | null;
  requires_deposit?: boolean;
  breakfast_included?: boolean;
  breakfast_amount?: number | null;
  breakfast_basis?: string | null;
  policy_id?: string | null;
  units?: DraftUnit[];
  season_rates?: DraftSeasonRate[];
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const intOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar seasons, normalised to flat windows (one row per authored period). */
function calendarSeasons(amenities: Record<string, unknown>) {
  const raw = Array.isArray((amenities as any)?.seasons) ? (amenities as any).seasons : [];
  const out: {
    calendar_season_id: string;
    name: string;
    start_date: string;
    end_date: string;
    min_stay: number | null;
  }[] = [];
  for (const s of raw) {
    if (!s || s.id == null) continue;
    const periods = Array.isArray(s.periods) && s.periods.length > 0
      ? s.periods
      : [{ from: s.from ?? s.start_date, to: s.to ?? s.end_date }];
    for (const p of periods) {
      const from = p?.from ?? p?.start_date;
      const to = p?.to ?? p?.end_date;
      if (!from || !to) continue;
      out.push({
        calendar_season_id: String(s.id),
        name: String(s.title ?? s.name ?? "Season"),
        start_date: String(from),
        end_date: String(to),
        min_stay: intOrNull(s.minStay ?? s.min_stay),
      });
    }
  }
  return out;
}

/** Read-only mirror of the Calendar seasons into rolos_shared_seasons. */
async function syncSharedSeasons(sb: any, propertyId: string, amenities: Record<string, unknown>) {
  const seasons = calendarSeasons(amenities);
  const { data: existing } = await sb
    .from("rolos_shared_seasons")
    .select("id, calendar_season_id, start_date, end_date, name, is_active, deleted_at")
    .eq("property_id", propertyId)
    .eq("source", "calendar");

  const byKey = new Map<string, any>();
  for (const row of (existing ?? []) as any[]) {
    byKey.set(`${row.calendar_season_id}|${row.start_date}|${row.end_date}`, row);
  }

  const keep = new Set<string>();
  const result: { calendar_season_id: string; shared_season_id: string; name: string; start_date: string; end_date: string; min_stay: number | null }[] = [];

  for (const s of seasons) {
    const key = `${s.calendar_season_id}|${s.start_date}|${s.end_date}`;
    keep.add(key);
    const hit = byKey.get(key);
    if (hit) {
      if (hit.name !== s.name || hit.is_active === false || hit.deleted_at) {
        await sb
          .from("rolos_shared_seasons")
          .update({ name: s.name, is_active: true, deleted_at: null, updated_at: new Date().toISOString() })
          .eq("id", hit.id);
      }
      result.push({ ...s, shared_season_id: hit.id });
      continue;
    }
    const { data: inserted } = await sb
      .from("rolos_shared_seasons")
      .insert({
        property_id: propertyId,
        name: s.name,
        start_date: s.start_date,
        end_date: s.end_date,
        source: "calendar",
        calendar_season_id: s.calendar_season_id,
      })
      .select("id")
      .single();
    if (inserted?.id) result.push({ ...s, shared_season_id: inserted.id });
  }

  // Seasons the Calendar no longer has are deactivated, never hard-deleted.
  for (const [key, row] of byKey.entries()) {
    if (keep.has(key) || row.is_active === false) continue;
    await sb
      .from("rolos_shared_seasons")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return result;
}

/** The final nightly amount a draft season rate produces for one unit. */
/** The cell value a unit carries for a season, or null when it inherits the column value. */
function seasonUnitValue(sr: DraftSeasonRate, roomTypeId: string): number | null {
  const raw = sr.unit_values?.[roomTypeId];
  return raw === undefined || raw === null ? null : num(raw);
}

function draftSeasonAmount(draft: Draft, sr: DraftSeasonRate, unit: DraftUnit): number | null {
  const planBase = positive(draft.base_rate) ?? 0;
  const cell = seasonUnitValue(sr, String(unit.room_type_id));
  const isDiff = sr.mode === "differential" || (sr.differential_type && sr.differential_type !== "none");
  let amount: number | null = null;
  if (isDiff) {
    if (!planBase) return null;
    amount = applyDifferential(planBase, sr.differential_type, cell ?? sr.differential_value);
  } else {
    amount = cell !== null && cell > 0 ? cell : positive(sr.base_rate);
  }
  if (!amount) return null;
  // An explicit cell is already unit-specific — the Linked Units difference would double up.
  if (cell !== null) return amount;
  return applyDifferential(amount, unit.differential_type, unit.differential_value);
}

/** Preview: price the draft with the production engine, unsaved values included. */
async function previewDraft(
  sb: any,
  propertyId: string,
  draft: Draft,
  window: { from: string; to: string },
) {
  const { data: property } = await sb
    .from("properties")
    .select("amenities")
    .eq("id", propertyId)
    .maybeSingle();
  const amenities = (property?.amenities ?? {}) as Record<string, any>;

  const resolver = await createRateResolver(sb, propertyId, { amenities, window });
  const baseInputs = resolver.pricingInputs as PricingInputs;

  const { data: roomTypes } = await sb
    .from("rolos_room_types")
    .select("id, name")
    .eq("property_id", propertyId);
  const nameById = new Map<string, string>(((roomTypes ?? []) as any[]).map((r) => [String(r.id), r.name]));

  const planId = draft.rate_plan_id ? String(draft.rate_plan_id) : "draft-plan";
  const draftUnits = (draft.units ?? []).filter((u) => u?.room_type_id);
  const out: {
    room_type_id: string;
    name: string;
    days: { date: string; price: number; source: string }[];
    stay: { min_stay: number; max_stay: number | null };
  }[] = [];

  for (const unit of draftUnits) {
    const rolosId = String(unit.room_type_id);
    const resolved = resolver.units.find((u) => String(u.linked_rolos_id ?? "") === rolosId);
    const ctx: UnitRateContext = resolved ?? {
      id: rolosId,
      name: nameById.get(rolosId) ?? "Unit",
      linked_rolos_id: rolosId,
    };

    const plan: PricingRatePlan = {
      rate_plan_id: planId,
      base_rate: positive(draft.base_rate) ?? 0,
      pricing_model: draft.pricing_model || "per_room",
      is_active: draft.is_active !== false,
      min_stay: intOrNull(draft.min_stay),
      max_stay: intOrNull(draft.max_stay),
      differential_type: unit.differential_type ?? "none",
      differential_value: unit.differential_value ?? null,
    };

    // Draft plan season rates (tier 3), keyed to Calendar seasons.
    const planSeasons: PlanSeasonRate[] = [];
    // Simulated post-save Calendar buckets (tier 2) so the preview equals what
    // booking will read once the save write-back lands.
    const seasonBucket: Record<string, { roomAmount: number; adultAmount?: number }> = {};
    for (const sr of draft.season_rates ?? []) {
      if (!sr?.calendar_season_id) continue;
      const amount = draftSeasonAmount(draft, sr, unit);
      if (amount === null) continue;
      seasonBucket[`${sr.calendar_season_id}-${planId}`] = {
        roomAmount: amount,
        adultAmount: positive(sr.extra_adult_rate) ?? undefined,
      };
      const cell = seasonUnitValue(sr, rolosId);
      planSeasons.push({
        calendar_season_id: String(sr.calendar_season_id),
        base_rate: sr.mode === "differential" ? null : (cell ?? positive(sr.base_rate)),
        differential_type: sr.mode === "differential" ? (sr.differential_type ?? "amount") : "none",
        differential_value: sr.mode === "differential" ? (cell ?? sr.differential_value ?? null) : null,
        extra_adult_rate: positive(sr.extra_adult_rate),
      });
    }

    const keys = seasonRateLookupKeys(ctx, amenities);
    const inputs: PricingInputs = {
      ...baseInputs,
      seasonRates: { ...baseInputs.seasonRates, [ctx.id]: seasonBucket },
      seasonRateKeys: { ...baseInputs.seasonRateKeys, [ctx.id]: [ctx.id, ...keys] },
      ratePlans: { ...baseInputs.ratePlans, [rolosId]: plan },
      planSeasonRates: { ...baseInputs.planSeasonRates, [rolosId]: planSeasons },
    };

    const days = resolveNightRates(inputs, ctx, window.from, window.to);
    const stay = resolveStayRules(inputs, ctx, window.from, window.from);
    out.push({
      room_type_id: rolosId,
      name: nameById.get(rolosId) ?? ctx.name,
      days: days.map((d) => ({ date: d.date, price: d.price, source: d.source })),
      stay: { min_stay: stay.min_stay, max_stay: stay.max_stay },
    });
  }

  return { units: out, window };
}

/**
 * Price a SAVED rate plan with stored data only — no draft overrides. This is exactly
 * what the booking engine quotes today, used for the dense strip on the plan cards.
 */
async function previewSavedPlan(
  sb: any,
  ratePlanId: string,
  window: { from: string; to: string },
) {
  const { data: plan } = await sb
    .from("rolos_rate_plans")
    .select("id, property_id")
    .eq("id", ratePlanId)
    .maybeSingle();
  if (!plan) return { error: "Rate plan not found" };
  const propertyId = String(plan.property_id);

  const [{ data: property }, { data: links }, { data: roomTypes }] = await Promise.all([
    sb.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
    sb
      .from("rolos_rate_plan_room_types")
      .select("room_type_id, sort_order")
      .eq("rate_plan_id", ratePlanId)
      .eq("is_active", true),
    sb.from("rolos_room_types").select("id, name, is_active").eq("property_id", propertyId),
  ]);

  const amenities = (property?.amenities ?? {}) as Record<string, any>;
  const resolver = await createRateResolver(sb, propertyId, { amenities, window });
  const inputs = resolver.pricingInputs as PricingInputs;
  const roomById = new Map<string, any>(((roomTypes ?? []) as any[]).map((r) => [String(r.id), r]));

  const out: { room_type_id: string; name: string; days: { date: string; price: number; source: string }[] }[] = [];
  const ordered = ((links ?? []) as any[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const link of ordered) {
    const rolosId = String(link.room_type_id);
    const room = roomById.get(rolosId);
    if (!room || room.is_active === false) continue;
    const ctx: UnitRateContext =
      resolver.units.find((u: any) => String(u.linked_rolos_id ?? "") === rolosId) ?? {
        id: rolosId,
        name: String(room?.name ?? "Unit"),
        linked_rolos_id: rolosId,
      };
    const days = resolveNightRates(inputs, ctx, window.from, window.to);
    out.push({
      room_type_id: rolosId,
      name: String(room?.name ?? ctx.name),
      days: days.map((d) => ({ date: d.date, price: d.price, source: d.source })),
    });
  }

  return { units: out, window };
}



/**
 * Write authored season prices back into properties.amenities.season_rates so the
 * existing booking engine, ARI builders and channel pushes read the same number.
 */
async function writeBackCalendarRates(
  sb: any,
  propertyId: string,
  planId: string,
  draft: Draft,
  amenities: Record<string, any>,
) {
  const seasonRates: Record<string, any> = amenities.season_rates && typeof amenities.season_rates === "object"
    ? { ...amenities.season_rates }
    : {};

  const { data: hfRooms } = await sb
    .from("hostfully_room_types")
    .select("id, name, linked_rolos_id")
    .eq("property_id", propertyId);

  let touched = 0;
  for (const unit of draft.units ?? []) {
    if (!unit?.room_type_id) continue;
    const rolosId = String(unit.room_type_id);
    const hf = ((hfRooms ?? []) as any[]).find((r) => String(r.linked_rolos_id ?? "") === rolosId);
    const ctx: UnitRateContext = hf
      ? { id: hf.id, name: hf.name, linked_rolos_id: hf.linked_rolos_id }
      : { id: rolosId, name: "", linked_rolos_id: rolosId };
    const candidates = seasonRateLookupKeys(ctx, amenities);
    // Every candidate key that already exists gets the new value, so whichever key
    // the reader picks first cannot serve a stale price. If none exist we create one.
    const targets = candidates.filter((k) => seasonRates[k] && typeof seasonRates[k] === "object");
    if (targets.length === 0) targets.push(candidates[0] ?? ctx.id);

    for (const sr of draft.season_rates ?? []) {
      if (!sr?.calendar_season_id) continue;
      const amount = draftSeasonAmount(draft, sr, unit);
      const bucketKey = `${sr.calendar_season_id}-${planId}`;
      for (const key of targets) {
        const bucket = { ...(seasonRates[key] && typeof seasonRates[key] === "object" ? seasonRates[key] : {}) };
        if (amount === null) {
          delete bucket[bucketKey];
        } else {
          const prev = bucket[bucketKey] && typeof bucket[bucketKey] === "object" ? bucket[bucketKey] : {};
          bucket[bucketKey] = {
            ...prev,
            roomAmount: amount,
            adultAmount: positive(sr.extra_adult_rate) ?? prev.adultAmount ?? 0,
            teenAmount: prev.teenAmount ?? 0,
            childAmount: prev.childAmount ?? 0,
            infantAmount: prev.infantAmount ?? 0,
          };
          touched++;
        }
        seasonRates[key] = bucket;
      }
    }
  }

  await sb
    .from("properties")
    .update({ amenities: { ...amenities, season_rates: seasonRates } })
    .eq("id", propertyId);

  return touched;
}

async function savePlan(sb: any, propertyId: string, draft: Draft) {
  if (!draft?.name) return { error: "A rate plan name is required" };

  const { data: property } = await sb
    .from("properties")
    .select("amenities")
    .eq("id", propertyId)
    .maybeSingle();
  const amenities = (property?.amenities ?? {}) as Record<string, any>;

  const shared = await syncSharedSeasons(sb, propertyId, amenities);
  const sharedByCalendarId = new Map<string, string>();
  for (const s of shared) {
    if (!sharedByCalendarId.has(s.calendar_season_id)) sharedByCalendarId.set(s.calendar_season_id, s.shared_season_id);
  }

  const payload: Record<string, unknown> = {
    property_id: propertyId,
    name: draft.name,
    code: draft.code || null,
    description: draft.description || null,
    pricing_model: draft.pricing_model || "per_room",
    base_rate: positive(draft.base_rate) ?? 0,
    is_active: draft.is_active !== false,
    min_stay: intOrNull(draft.min_stay) ?? 1,
    max_stay: intOrNull(draft.max_stay),
    min_advance_days: intOrNull(draft.min_advance_days),
    max_advance_days: intOrNull(draft.max_advance_days),
    requires_deposit: draft.requires_deposit ?? false,
    breakfast_included: draft.breakfast_included ?? false,
    breakfast_amount: draft.breakfast_included ? positive(draft.breakfast_amount) : null,
    breakfast_basis: draft.breakfast_included ? (draft.breakfast_basis || "per_person_per_night") : null,
    source_of_truth: "rate_plan",
    updated_at: new Date().toISOString(),
  };

  let planId = draft.rate_plan_id ? String(draft.rate_plan_id) : "";
  if (planId) {
    const { error } = await sb.from("rolos_rate_plans").update(payload).eq("id", planId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await sb.from("rolos_rate_plans").insert(payload).select("id").single();
    if (error) return { error: error.message };
    planId = String(data.id);
  }

  // --- Linked units + per-unit differentials -------------------------------
  const units = (draft.units ?? []).filter((u) => u?.room_type_id);
  const { data: existingLinks } = await sb
    .from("rolos_rate_plan_room_types")
    .select("id, room_type_id")
    .eq("rate_plan_id", planId);
  const keepRoomIds = new Set(units.map((u) => String(u.room_type_id)));
  for (const link of (existingLinks ?? []) as any[]) {
    if (!keepRoomIds.has(String(link.room_type_id))) {
      await sb
        .from("rolos_rate_plan_room_types")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", link.id);
    }
  }
  if (units.length > 0) {
    const { error: linkErr } = await sb.from("rolos_rate_plan_room_types").upsert(
      units.map((u, i) => ({
        rate_plan_id: planId,
        room_type_id: u.room_type_id,
        is_active: true,
        deleted_at: null,
        differential_type: u.differential_type ?? "none",
        differential_value: u.differential_type && u.differential_type !== "none" ? (num(u.differential_value) ?? 0) : null,
        link_source: "rate_plan_configurator",
        sort_order: i,
      })),
      { onConflict: "rate_plan_id,room_type_id" },
    );
    if (linkErr) return { error: `Saved the plan but could not link units: ${linkErr.message}` };
  }

  // --- Season pricing (relational, one row per season x unit) --------------
  await sb.from("rolos_rate_plan_season_rates").delete().eq("rate_plan_id", planId).is("legacy_season_id", null);
  const seasonRows: Record<string, unknown>[] = [];
  for (const sr of draft.season_rates ?? []) {
    const sharedId = sharedByCalendarId.get(String(sr?.calendar_season_id ?? ""));
    if (!sharedId) continue;
    const isDiff = sr.mode === "differential";
    const columnAbsolute = positive(sr.base_rate);
    const columnDiff = num(sr.differential_value);
    for (const unit of units) {
      const cell = seasonUnitValue(sr, String(unit.room_type_id));
      // A cell overrides the column value; a blank cell inherits it.
      const absolute = isDiff ? null : (cell !== null && cell > 0 ? cell : columnAbsolute);
      const diffValue = isDiff ? (cell ?? columnDiff) : null;
      if (!isDiff && !absolute) continue;
      if (isDiff && diffValue === null) continue;
      seasonRows.push({
        rate_plan_id: planId,
        shared_season_id: sharedId,
        room_type_id: unit.room_type_id,
        base_rate: absolute,
        extra_adult_rate: positive(sr.extra_adult_rate),
        differential_type: isDiff ? (sr.differential_type ?? "amount") : "none",
        differential_value: diffValue,
        is_active: true,
      });
    }
  }
  if (seasonRows.length > 0) {
    const { error: srErr } = await sb.from("rolos_rate_plan_season_rates").insert(seasonRows);
    if (srErr) return { error: `Saved the plan but could not store season pricing: ${srErr.message}` };
  }

  // --- Restrictions --------------------------------------------------------
  await sb.from("rolos_stay_restrictions").delete().eq("rate_plan_id", planId).eq("source", "rate_plan");
  const minStay = intOrNull(draft.min_stay);
  const maxStay = intOrNull(draft.max_stay);
  if (minStay || maxStay) {
    const { error: resErr } = await sb.from("rolos_stay_restrictions").insert({
      property_id: propertyId,
      rate_plan_id: planId,
      min_stay: minStay,
      max_stay: maxStay,
      source: "rate_plan",
      source_ref: planId,
    });
    if (resErr) console.warn("[rolos-rate-plans] restriction write failed", resErr.message);
  }

  // --- Cancellation policy link -------------------------------------------
  await sb.from("rolos_policy_rate_links").delete().eq("rate_plan_id", planId);
  if (draft.policy_id) {
    await sb.from("rolos_policy_rate_links").insert({ policy_id: draft.policy_id, rate_plan_id: planId });
  }

  // --- Backward-compatible stores -----------------------------------------
  const writtenBack = await writeBackCalendarRates(sb, propertyId, planId, draft, amenities);

  return { rate_plan_id: planId, calendar_rates_written: writtenBack };
}

/** Copy a plan and everything attached to it onto sibling properties. */
async function copyPlan(sb: any, ratePlanId: string, targetPropertyIds: string[]) {
  const { data: plan } = await sb.from("rolos_rate_plans").select("*").eq("id", ratePlanId).maybeSingle();
  if (!plan) return { error: "Rate plan not found" };

  const { data: links } = await sb
    .from("rolos_rate_plan_room_types")
    .select("room_type_id, differential_type, differential_value")
    .eq("rate_plan_id", ratePlanId)
    .eq("is_active", true);

  const { data: seasonRates } = await sb
    .from("rolos_rate_plan_season_rates")
    .select("room_type_id, base_rate, extra_adult_rate, differential_type, differential_value, rolos_shared_seasons(calendar_season_id)")
    .eq("rate_plan_id", ratePlanId)
    .is("deleted_at", null);

  const { data: policyLink } = await sb
    .from("rolos_policy_rate_links")
    .select("policy_id")
    .eq("rate_plan_id", ratePlanId)
    .maybeSingle();

  const { data: sourceRooms } = await sb
    .from("rolos_room_types")
    .select("id, name")
    .eq("property_id", plan.property_id);
  const sourceNameById = new Map<string, string>(((sourceRooms ?? []) as any[]).map((r) => [String(r.id), String(r.name ?? "").trim().toLowerCase()]));

  // De-duplicate season rates by calendar season (they are stored per unit).
  const seasonDraft = new Map<string, DraftSeasonRate>();
  for (const row of (seasonRates ?? []) as any[]) {
    const calId = row?.rolos_shared_seasons?.calendar_season_id;
    if (!calId || seasonDraft.has(String(calId))) continue;
    const isDiff = row.differential_type && row.differential_type !== "none";
    seasonDraft.set(String(calId), {
      calendar_season_id: String(calId),
      mode: isDiff ? "differential" : "absolute",
      base_rate: row.base_rate,
      differential_type: row.differential_type,
      differential_value: row.differential_value,
      extra_adult_rate: row.extra_adult_rate,
    });
  }

  const results: { property_id: string; rate_plan_id?: string; error?: string; units: number }[] = [];
  for (const targetId of targetPropertyIds) {
    if (targetId === plan.property_id) continue;

    const { data: targetRooms } = await sb
      .from("rolos_room_types")
      .select("id, name")
      .eq("property_id", targetId)
      .eq("is_active", true);
    const targetByName = new Map<string, string>(((targetRooms ?? []) as any[]).map((r) => [String(r.name ?? "").trim().toLowerCase(), String(r.id)]));

    const units: DraftUnit[] = [];
    for (const link of (links ?? []) as any[]) {
      const name = sourceNameById.get(String(link.room_type_id));
      const match = name ? targetByName.get(name) : undefined;
      if (match) {
        units.push({
          room_type_id: match,
          differential_type: link.differential_type ?? "none",
          differential_value: link.differential_value,
        });
      }
    }
    // No name match: apply to every active unit of the target property.
    if (units.length === 0) {
      for (const id of targetByName.values()) units.push({ room_type_id: id, differential_type: "none" });
    }

    const { data: existing } = await sb
      .from("rolos_rate_plans")
      .select("id")
      .eq("property_id", targetId)
      .eq("name", plan.name)
      .is("deleted_at", null)
      .maybeSingle();

    const draft: Draft = {
      rate_plan_id: existing?.id ?? null,
      name: plan.name,
      code: plan.code,
      description: plan.description,
      pricing_model: plan.pricing_model,
      base_rate: plan.base_rate,
      is_active: plan.is_active !== false,
      min_stay: plan.min_stay,
      max_stay: plan.max_stay,
      min_advance_days: plan.min_advance_days,
      max_advance_days: plan.max_advance_days,
      requires_deposit: plan.requires_deposit,
      breakfast_included: plan.breakfast_included,
      breakfast_amount: plan.breakfast_amount,
      breakfast_basis: plan.breakfast_basis,
      policy_id: policyLink?.policy_id ?? null,
      units,
      season_rates: [...seasonDraft.values()],
    };

    const res = await savePlan(sb, targetId, draft);
    results.push({
      property_id: targetId,
      rate_plan_id: (res as any).rate_plan_id,
      error: (res as any).error,
      units: units.length,
    });
  }

  return { results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const assertAccess = async (propertyId: string) => {
      if (!propertyId) return "A property is required";
      const { data, error } = await sb.rpc("can_access_property", {
        _property_id: propertyId,
        _user_id: userId,
      });
      if (error) return error.message;
      return data === true ? null : "You do not have access to this property";
    };

    if (action === "sync_seasons") {
      const propertyId = String(body?.property_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      const { data: property } = await sb.from("properties").select("amenities").eq("id", propertyId).maybeSingle();
      const seasons = await syncSharedSeasons(sb, propertyId, (property?.amenities ?? {}) as Record<string, unknown>);
      return json({ seasons });
    }

    if (action === "preview") {
      const propertyId = String(body?.property_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      const from = String(body?.window?.from ?? today());
      const to = String(body?.window?.to ?? addDays(from, 29));
      const result = await previewDraft(sb, propertyId, (body?.draft ?? {}) as Draft, { from, to });
      return json(result);
    }

    if (action === "preview_plan") {
      const ratePlanId = String(body?.rate_plan_id ?? "");
      if (!ratePlanId) return json({ error: "A rate plan is required" }, 400);
      const { data: plan } = await sb.from("rolos_rate_plans").select("property_id").eq("id", ratePlanId).maybeSingle();
      const denied = await assertAccess(String(plan?.property_id ?? ""));
      if (denied) return json({ error: denied }, 403);
      const from = String(body?.window?.from ?? today());
      const to = String(body?.window?.to ?? addDays(from, 6));
      const result = await previewSavedPlan(sb, ratePlanId, { from, to });
      if ((result as any).error) return json(result, 400);
      return json(result);
    }



    if (action === "save_plan") {
      const propertyId = String(body?.property_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      const result = await savePlan(sb, propertyId, (body?.draft ?? {}) as Draft);
      if ((result as any).error) return json(result, 400);
      return json(result);
    }

    if (action === "copy_plan") {
      const ratePlanId = String(body?.rate_plan_id ?? "");
      const targets: string[] = Array.isArray(body?.target_property_ids) ? body.target_property_ids.map(String) : [];
      if (!ratePlanId || targets.length === 0) return json({ error: "A rate plan and at least one target property are required" }, 400);
      const { data: plan } = await sb.from("rolos_rate_plans").select("property_id").eq("id", ratePlanId).maybeSingle();
      const denied = await assertAccess(String(plan?.property_id ?? ""));
      if (denied) return json({ error: denied }, 403);
      for (const target of targets) {
        const targetDenied = await assertAccess(target);
        if (targetDenied) return json({ error: `${targetDenied} (${target})` }, 403);
      }
      const result = await copyPlan(sb, ratePlanId, targets);
      if ((result as any).error) return json(result, 400);
      return json(result);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[rolos-rate-plans] failure", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
