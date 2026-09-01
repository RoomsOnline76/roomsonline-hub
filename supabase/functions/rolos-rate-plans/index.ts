/**
 * rolos-rate-plans — the single write path for the ROL'OS Rate Plans configurator.
 *
 * Actions
 *   sync_seasons : mirror the Calendar's seasons into rolos_shared_seasons (read-only mirror).
 *   preview      : price a draft plan with the SAME pure engine booking/ARI use.
 *   save_plan    : persist a plan and keep every backward-compatible store in step.
 *   copy_plan    : copy a plan (+ season pricing, units, restrictions) to sibling properties.
 *   legacy_rate_audit      : does this plan still rely on rates authored in the old Calendar grid?
 *   migrate_calendar_rates : copy those legacy Calendar rates into the plan matrix (once).
 *
 * Rate Plans are the authoring surface and the plan season rate now outranks the legacy
 * Calendar season rate. Saves still mirror authored amounts into
 * properties.amenities.season_rates so any reader still on the legacy store stays in step.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { canonicalPricingModel } from "../_shared/ratePricing.ts";

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
  /** Derived columns: this season's offset override off the parent plan. */
  derivation_value?: number | null;
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
  is_primary_sell?: boolean;
  push_to_channels?: boolean;
  sell_priority?: number | null;
  /** Derived pricing: track another plan on the same property, offset and rounded. */
  derived_from_plan_id?: string | null;
  derivation_type?: "percent" | "amount" | null;
  derivation_value?: number | null;
  derivation_rounding?: string | null;
  units?: DraftUnit[];
  season_rates?: DraftSeasonRate[];
  /**
   * Stay-shape ladders (Phase 0 contract). ABSENT keys are a strict no-op: the
   * flags are left as they are and no child row is touched, so the current editor
   * payload can never wipe an authored ladder.
   */
  los_enabled?: boolean;
  fsp_enabled?: boolean;
  los_rungs?: DraftLosRung[];
  fsp_cells?: DraftFspCell[];
}

interface DraftStayWindow {
  room_type_id?: string | null;
  calendar_season_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface DraftLosRung extends DraftStayWindow {
  nights?: number | null;
  derivation_type?: "percent" | "amount" | null;
  derivation_value?: number | null;
  is_pinned?: boolean;
  pinned_rate?: number | null;
}

interface DraftFspCell extends DraftStayWindow {
  nights?: number | null;
  nr_of_guests?: number | null;
  derivation_type?: "percent" | "amount" | null;
  derivation_value?: number | null;
  is_pinned?: boolean;
  pinned_total?: number | null;
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
      pricing_model: canonicalPricingModel(draft.pricing_model),
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
      days: days.map((d) => ({ date: d.date, price: d.price, source: d.source, season_name: d.season_name })),
      stay: { min_stay: stay.min_stay, max_stay: stay.max_stay },
    });
  }

  return { units: out, window };
}

/**
 * The nightly rate the live booking engine resolves TODAY for each linked unit in each
 * Calendar season — used to seed the Pricing by season matrix so authored values match
 * what guests are already quoted. Read-only; nothing is written.
 */
async function seasonRateMatrix(sb: any, propertyId: string, draft: Draft) {
  const { data: property } = await sb
    .from("properties")
    .select("amenities")
    .eq("id", propertyId)
    .maybeSingle();
  const amenities = (property?.amenities ?? {}) as Record<string, any>;
  const seasons = calendarSeasons(amenities);
  if (seasons.length === 0) return { seasons: [] };

  // One window wide enough to cover every season period we need to sample.
  const froms = seasons.map((s) => s.start_date).sort();
  const tos = seasons.map((s) => s.end_date).sort();
  const window = { from: froms[0], to: tos[tos.length - 1] };

  const resolver = await createRateResolver(sb, propertyId, { amenities, window });
  const baseInputs = resolver.pricingInputs as PricingInputs;

  const { data: roomTypes } = await sb
    .from("rolos_room_types")
    .select("id, name")
    .eq("property_id", propertyId);
  const nameById = new Map<string, string>(((roomTypes ?? []) as any[]).map((r) => [String(r.id), r.name]));

  const draftUnits = (draft.units ?? []).filter((u) => u?.room_type_id);
  const planId = draft.rate_plan_id ? String(draft.rate_plan_id) : "draft-plan";

  // Sample the first night of the earliest period of each season, per unit.
  const bySeason = new Map<string, { room_type_id: string; name: string; price: number; source: string; season_name?: string }[]>();

  for (const unit of draftUnits) {
    const rolosId = String(unit.room_type_id);
    const resolved = resolver.units.find((u) => String(u.linked_rolos_id ?? "") === rolosId);
    const ctx: UnitRateContext = resolved ?? {
      id: rolosId,
      name: nameById.get(rolosId) ?? "Unit",
      linked_rolos_id: rolosId,
    };

    // Stored plan values only — this must reflect what booking reads today, so no draft
    // season overrides are injected here.
    const plan: PricingRatePlan = {
      rate_plan_id: planId,
      base_rate: positive(draft.base_rate) ?? 0,
      pricing_model: canonicalPricingModel(draft.pricing_model),
      is_active: true,
      min_stay: intOrNull(draft.min_stay),
      max_stay: intOrNull(draft.max_stay),
      differential_type: unit.differential_type ?? "none",
      differential_value: unit.differential_value ?? null,
    };
    const inputs: PricingInputs = {
      ...baseInputs,
      ratePlans: { ...baseInputs.ratePlans, [rolosId]: plan },
    };

    for (const season of seasons) {
      const existing = bySeason.get(season.calendar_season_id) ?? [];
      if (existing.some((r) => r.room_type_id === rolosId)) continue;
      const [day] = resolveNightRates(inputs, ctx, season.start_date, addDays(season.start_date, 1));
      if (!day || !(day.price > 0)) continue;
      existing.push({
        room_type_id: rolosId,
        name: nameById.get(rolosId) ?? ctx.name,
        price: day.price,
        source: day.source,
        season_name: day.season_name,
      });
      bySeason.set(season.calendar_season_id, existing);
    }
  }

  return {
    seasons: seasons
      // Collapse multi-period seasons: they share one calendar_season_id.
      .filter((s, i, arr) => arr.findIndex((x) => x.calendar_season_id === s.calendar_season_id) === i)
      .map((s) => ({
        calendar_season_id: s.calendar_season_id,
        name: s.name,
        units: bySeason.get(s.calendar_season_id) ?? [],
      })),
  };
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

  const out: { room_type_id: string; name: string; days: { date: string; price: number; source: string; season_name?: string }[] }[] = [];
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
      days: days.map((d) => ({ date: d.date, price: d.price, source: d.source, season_name: d.season_name })),
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

  const parentPlanId = draft.derived_from_plan_id ? String(draft.derived_from_plan_id) : null;

  const payload: Record<string, unknown> = {
    property_id: propertyId,

    name: draft.name,
    code: draft.code || null,
    description: draft.description || null,
    pricing_model: canonicalPricingModel(draft.pricing_model),
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
    is_primary_sell: draft.is_primary_sell === true,
    push_to_channels: draft.push_to_channels !== false,
    sell_priority: intOrNull(draft.sell_priority) ?? 100,
    // Derived pricing. The database trigger rejects self-references, chains and
    // cross-property parents, so a bad parent fails the save rather than mispricing.
    derived_from_plan_id: parentPlanId,
    derivation_type: parentPlanId ? (draft.derivation_type === "amount" ? "amount" : "percent") : null,
    derivation_value: parentPlanId ? (num(draft.derivation_value) ?? 0) : null,
    derivation_rounding: draft.derivation_rounding === "none" ? "none" : "nearest_10",
    updated_at: new Date().toISOString(),
  };

  // Stay-shape flags are written only when the caller sends them, so an editor that
  // knows nothing about LOS/Full Stay cannot turn an authored ladder off.
  if (typeof draft.los_enabled === "boolean") payload.los_enabled = draft.los_enabled;
  if (typeof draft.fsp_enabled === "boolean") payload.fsp_enabled = draft.fsp_enabled;




  // Only one plan per property may be the live/direct plan — demote the incumbent
  // before writing this one (a partial unique index enforces it in the database).
  if (draft.is_primary_sell === true) {
    await sb
      .from("rolos_rate_plans")
      .update({ is_primary_sell: false })
      .eq("property_id", propertyId)
      .eq("is_primary_sell", true);
  }

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

    // A derived column stores this season's offset override, plus any cell the user
    // typed as a pinned rate that stops tracking the parent for that unit.
    if (sr.mode === "derived") {
      const seasonOffset = num(sr.derivation_value);
      for (const unit of units) {
        const pinned = positive(seasonUnitValue(sr, String(unit.room_type_id)));
        if (pinned === null && seasonOffset === null) continue;
        seasonRows.push({
          rate_plan_id: planId,
          shared_season_id: sharedId,
          room_type_id: unit.room_type_id,
          base_rate: pinned,
          extra_adult_rate: positive(sr.extra_adult_rate),
          differential_type: "none",
          differential_value: null,
          derivation_value: seasonOffset,
          is_pinned: pinned !== null,
          is_active: true,
        });
      }
      continue;
    }

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

  // --- Stay-shape ladders (LOS rungs / Full Stay cells) --------------------
  // Present key = replace the whole set for this plan. Absent key = untouched.
  if (Array.isArray(draft.los_rungs)) {
    const rows: Record<string, unknown>[] = [];
    for (const r of draft.los_rungs) {
      const nights = intOrNull(r?.nights);
      if (nights === null || nights < 1) continue;
      const seasonId = r?.calendar_season_id ? String(r.calendar_season_id) : null;
      const from = r?.start_date || null;
      const to = r?.end_date || null;
      // A rung with neither a calendar season nor an explicit window prices nothing.
      if (!seasonId && !(from && to)) {
        return { error: "Every length-of-stay rung needs a season or a date range" };
      }
      const pinned = r?.is_pinned === true;
      const pinnedRate = positive(r?.pinned_rate);
      if (pinned && pinnedRate === null) {
        return { error: `The ${nights}-night rung is pinned but has no rate` };
      }
      const derivationValue = num(r?.derivation_value);
      if (!pinned && derivationValue === null) {
        return { error: `The ${nights}-night rung needs an adjustment value` };
      }
      rows.push({
        rate_plan_id: planId,
        room_type_id: r?.room_type_id ? String(r.room_type_id) : null,
        calendar_season_id: seasonId,
        start_date: from,
        end_date: to,
        nights,
        derivation_type: r?.derivation_type === "amount" ? "amount" : "percent",
        derivation_value: derivationValue ?? 0,
        is_pinned: pinned,
        pinned_rate: pinned ? pinnedRate : null,
      });
    }
    await sb.from("rolos_rate_plan_los_rungs").delete().eq("rate_plan_id", planId);
    if (rows.length > 0) {
      const { error: losErr } = await sb.from("rolos_rate_plan_los_rungs").insert(rows);
      if (losErr) return { error: `Saved the plan but could not store the length-of-stay rungs: ${losErr.message}` };
    }
  }

  if (Array.isArray(draft.fsp_cells)) {
    const rows: Record<string, unknown>[] = [];
    for (const c of draft.fsp_cells) {
      const nights = intOrNull(c?.nights);
      const guests = intOrNull(c?.nr_of_guests);
      if (nights === null || nights < 1 || guests === null || guests < 1) continue;
      const seasonId = c?.calendar_season_id ? String(c.calendar_season_id) : null;
      const from = c?.start_date || null;
      const to = c?.end_date || null;
      if (!seasonId && !(from && to)) {
        return { error: "Every full-stay cell needs a season or a date range" };
      }
      const pinned = c?.is_pinned === true;
      const pinnedTotal = positive(c?.pinned_total);
      const derivationValue = num(c?.derivation_value);
      if (pinned && pinnedTotal === null) {
        return { error: `The ${nights}-night / ${guests}-guest cell is pinned but has no total` };
      }
      if (!pinned && derivationValue === null) {
        return { error: `The ${nights}-night / ${guests}-guest cell needs an adjustment value` };
      }
      rows.push({
        rate_plan_id: planId,
        room_type_id: c?.room_type_id ? String(c.room_type_id) : null,
        calendar_season_id: seasonId,
        start_date: from,
        end_date: to,
        nights,
        nr_of_guests: guests,
        // A pinned cell carries no derivation; a derived cell carries no total.
        derivation_type: pinned ? null : (c?.derivation_type === "amount" ? "amount" : "percent"),
        derivation_value: pinned ? null : derivationValue,
        is_pinned: pinned,
        pinned_total: pinned ? pinnedTotal : null,
      });
    }
    await sb.from("rolos_rate_plan_fsp_cells").delete().eq("rate_plan_id", planId);
    if (rows.length > 0) {
      const { error: fspErr } = await sb.from("rolos_rate_plan_fsp_cells").insert(rows);
      if (fspErr) return { error: `Saved the plan but could not store the full-stay grid: ${fspErr.message}` };
    }
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

// ---------------------------------------------------------------------------
// Legacy Calendar rate migration
//
// The Calendar used to be a rate editor (properties.amenities.season_rates).
// Rate Plans are now the only authoring surface, so those values are copied
// into rolos_rate_plan_season_rates once and the Calendar grid is retired.
// ---------------------------------------------------------------------------

interface LegacyCell {
  calendar_season_id: string;
  season_name: string;
  room_type_id: string;
  room_name: string;
  room_amount: number;
  adult_amount: number | null;
  action: "insert" | "skip_existing";
}

/** The legacy Calendar amount authored for one unit in one season, if any. */
function legacyAmountFor(
  seasonRates: Record<string, any>,
  keys: string[],
  calendarSeasonId: string,
): { room: number; adult: number | null } | null {
  for (const key of keys) {
    const bucket = seasonRates?.[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const [bucketKey, value] of Object.entries(bucket as Record<string, any>)) {
      if (bucketKey !== calendarSeasonId && !bucketKey.startsWith(`${calendarSeasonId}-`)) continue;
      const room = positive((value as any)?.roomAmount);
      if (!room) continue;
      return { room, adult: positive((value as any)?.adultAmount) };
    }
  }
  return null;
}

/**
 * Compare the legacy Calendar rate grid with the plan's season pricing matrix.
 * Never overwrites a rate already authored in Rate Plans.
 */
async function planLegacyCells(sb: any, propertyId: string, ratePlanId: string) {
  const { data: property } = await sb
    .from("properties")
    .select("amenities")
    .eq("id", propertyId)
    .maybeSingle();
  const amenities = (property?.amenities ?? {}) as Record<string, any>;
  const seasonRates = (amenities.season_rates && typeof amenities.season_rates === "object"
    ? amenities.season_rates
    : {}) as Record<string, any>;

  const shared = await syncSharedSeasons(sb, propertyId, amenities);
  const sharedByCalendarId = new Map<string, { shared_season_id: string; name: string }>();
  for (const s of shared) {
    if (!sharedByCalendarId.has(s.calendar_season_id)) {
      sharedByCalendarId.set(s.calendar_season_id, { shared_season_id: s.shared_season_id, name: s.name });
    }
  }

  const [{ data: links }, { data: rolosRooms }, { data: hfRooms }, { data: existingRates }] = await Promise.all([
    sb.from("rolos_rate_plan_room_types").select("room_type_id").eq("rate_plan_id", ratePlanId).eq("is_active", true),
    sb.from("rolos_room_types").select("id, name").eq("property_id", propertyId),
    sb.from("hostfully_room_types").select("id, name, linked_rolos_id").eq("property_id", propertyId),
    sb
      .from("rolos_rate_plan_season_rates")
      .select("room_type_id, base_rate, differential_type, differential_value, shared_season_id")
      .eq("rate_plan_id", ratePlanId)
      .is("deleted_at", null),
  ]);

  const nameById = new Map<string, string>(((rolosRooms ?? []) as any[]).map((r) => [String(r.id), String(r.name ?? "Unit")]));
  const priced = new Set<string>();
  for (const row of (existingRates ?? []) as any[]) {
    const hasValue = positive(row.base_rate) ||
      (row.differential_type && row.differential_type !== "none" && num(row.differential_value) !== null);
    if (hasValue) priced.add(`${row.shared_season_id}|${row.room_type_id}`);
  }

  const cells: LegacyCell[] = [];
  for (const link of (links ?? []) as any[]) {
    const rolosId = String(link.room_type_id);
    const hf = ((hfRooms ?? []) as any[]).find((r) => String(r.linked_rolos_id ?? "") === rolosId);
    const ctx: UnitRateContext = hf
      ? { id: hf.id, name: hf.name, linked_rolos_id: hf.linked_rolos_id }
      : { id: rolosId, name: nameById.get(rolosId) ?? "", linked_rolos_id: rolosId };
    const keys = seasonRateLookupKeys(ctx, amenities);

    for (const [calendarSeasonId, season] of sharedByCalendarId.entries()) {
      const legacy = legacyAmountFor(seasonRates, keys, calendarSeasonId);
      if (!legacy) continue;
      cells.push({
        calendar_season_id: calendarSeasonId,
        season_name: season.name,
        room_type_id: rolosId,
        room_name: nameById.get(rolosId) ?? ctx.name ?? "Unit",
        room_amount: legacy.room,
        adult_amount: legacy.adult,
        action: priced.has(`${season.shared_season_id}|${rolosId}`) ? "skip_existing" : "insert",
      });
    }
  }

  return { cells, sharedByCalendarId };
}

/** Does this plan still depend on rates that only exist in the Calendar? */
async function legacyRateAudit(sb: any, propertyId: string, ratePlanId: string) {
  const { cells } = await planLegacyCells(sb, propertyId, ratePlanId);
  const pending = cells.filter((c) => c.action === "insert");
  return {
    legacy_cells: cells.length,
    pending_cells: pending.length,
    pending: pending,
  };
}

/** Copy the legacy Calendar rates into the plan's season pricing matrix. */
async function migrateCalendarRates(sb: any, propertyId: string, ratePlanId: string, dryRun: boolean) {
  const { cells, sharedByCalendarId } = await planLegacyCells(sb, propertyId, ratePlanId);
  const pending = cells.filter((c) => c.action === "insert");
  if (dryRun || pending.length === 0) {
    return { dry_run: dryRun, migrated: 0, skipped: cells.length - pending.length, pending };
  }

  const rows = pending.map((c) => ({
    rate_plan_id: ratePlanId,
    shared_season_id: sharedByCalendarId.get(c.calendar_season_id)?.shared_season_id,
    room_type_id: c.room_type_id,
    base_rate: c.room_amount,
    extra_adult_rate: c.adult_amount,
    differential_type: "none",
    differential_value: null,
    is_active: true,
  })).filter((r) => r.shared_season_id);

  const { error } = await sb.from("rolos_rate_plan_season_rates").insert(rows);
  if (error) return { error: `Could not import the Calendar rates: ${error.message}` };
  return { dry_run: false, migrated: rows.length, skipped: cells.length - pending.length, pending: [] };
}

/** Every active plan on the property, with how many legacy cells each still needs. */
async function propertyLegacyRateAudit(sb: any, propertyId: string) {
  const { data: plans } = await sb
    .from("rolos_rate_plans")
    .select("id, name, is_active")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .is("deleted_at", null);

  const results: { rate_plan_id: string; name: string; legacy_cells: number; pending_cells: number }[] = [];
  for (const plan of ((plans ?? []) as any[])) {
    const audit = await legacyRateAudit(sb, propertyId, String(plan.id));
    results.push({
      rate_plan_id: String(plan.id),
      name: String(plan.name ?? "Rate plan"),
      legacy_cells: audit.legacy_cells,
      pending_cells: audit.pending_cells,
    });
  }

  return {
    plans: results,
    plans_pending: results.filter((r) => r.pending_cells > 0).length,
    pending_cells: results.reduce((sum, r) => sum + r.pending_cells, 0),
  };
}

/** Import the legacy Calendar rates for every plan on the property at once. */
async function migratePropertyCalendarRates(sb: any, propertyId: string, dryRun: boolean) {
  const audit = await propertyLegacyRateAudit(sb, propertyId);
  if (dryRun) {
    return { dry_run: true, migrated: 0, plans_migrated: 0, plans: audit.plans, pending_cells: audit.pending_cells };
  }

  let migrated = 0;
  let plansMigrated = 0;
  const failures: string[] = [];
  for (const plan of audit.plans) {
    if (plan.pending_cells === 0) continue;
    const result = await migrateCalendarRates(sb, propertyId, plan.rate_plan_id, false);
    if ((result as any).error) {
      failures.push(`${plan.name}: ${(result as any).error}`);
      continue;
    }
    migrated += (result as any).migrated ?? 0;
    plansMigrated += 1;
  }

  return { dry_run: false, migrated, plans_migrated: plansMigrated, failures };
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

  // De-duplicate season rates by calendar season (they are stored per unit), while
  // keeping each unit's own value keyed by unit NAME so it can be re-mapped per target.
  const seasonDraft = new Map<string, DraftSeasonRate>();
  const seasonValueByName = new Map<string, Map<string, number>>();
  for (const row of (seasonRates ?? []) as any[]) {
    const calId = row?.rolos_shared_seasons?.calendar_season_id;
    if (!calId) continue;
    const key = String(calId);
    const isDiff = row.differential_type && row.differential_type !== "none";
    if (!seasonDraft.has(key)) {
      seasonDraft.set(key, {
        calendar_season_id: key,
        mode: isDiff ? "differential" : "absolute",
        base_rate: row.base_rate,
        differential_type: row.differential_type,
        differential_value: row.differential_value,
        extra_adult_rate: row.extra_adult_rate,
      });
    }
    const name = sourceNameById.get(String(row.room_type_id ?? ""));
    const value = num(isDiff ? row.differential_value : row.base_rate);
    if (name && value !== null) {
      const bucket = seasonValueByName.get(key) ?? new Map<string, number>();
      bucket.set(name, value);
      seasonValueByName.set(key, bucket);
    }
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
      is_primary_sell: plan.is_primary_sell === true,
      push_to_channels: plan.push_to_channels !== false,
      sell_priority: plan.sell_priority ?? 100,
      policy_id: policyLink?.policy_id ?? null,
      units,
      season_rates: [...seasonDraft.values()].map((sr) => {
        const byName = seasonValueByName.get(sr.calendar_season_id);
        if (!byName) return sr;
        const unit_values: Record<string, number> = {};
        for (const [name, value] of byName) {
          const targetRoomId = targetByName.get(name);
          if (targetRoomId) unit_values[targetRoomId] = value;
        }
        return { ...sr, unit_values };
      }),
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

    if (action === "season_rate_matrix") {
      const propertyId = String(body?.property_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      const result = await seasonRateMatrix(sb, propertyId, (body?.draft ?? {}) as Draft);
      return json(result);
    }

    if (action === "legacy_rate_audit") {
      const propertyId = String(body?.property_id ?? "");
      const ratePlanId = String(body?.rate_plan_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      if (ratePlanId) return json(await legacyRateAudit(sb, propertyId, ratePlanId));
      return json(await propertyLegacyRateAudit(sb, propertyId));
    }

    if (action === "migrate_calendar_rates") {
      const propertyId = String(body?.property_id ?? "");
      const ratePlanId = String(body?.rate_plan_id ?? "");
      const denied = await assertAccess(propertyId);
      if (denied) return json({ error: denied }, 403);
      const dryRun = body?.dry_run === true;
      if (!ratePlanId) {
        const result = await migratePropertyCalendarRates(sb, propertyId, dryRun);
        if ((result as any).error) return json(result, 400);
        return json(result);
      }
      const result = await migrateCalendarRates(sb, propertyId, ratePlanId, dryRun);
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
