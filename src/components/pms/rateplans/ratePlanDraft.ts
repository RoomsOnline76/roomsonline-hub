/**
 * Draft state for the ROL'OS Rate Plans configurator.
 *
 * The page is the single authoring surface for a ROL'OS property's rates, so all of
 * a plan's parts (basics, season pricing, restrictions, linked units) live in one
 * reducer and are saved in one call to the `rolos-rate-plans` function.
 *
 * Seasons are owned by the Calendar. They are read here, never created or edited.
 */

import type { Json } from "@/integrations/supabase/types";
import { filterLiveSeasons } from "@/lib/seasonLifecycle";

export type DifferentialType = "none" | "amount" | "percent";
/**
 * "derived" columns belong to a plan that tracks a parent plan: the column holds the
 * offset for that season, and any cell typed in it pins that unit to a fixed rate.
 */
export type SeasonPricingMode = "none" | "absolute" | "differential" | "derived";
/** How a derived plan is offset from its parent's nightly price. */
export type DerivationType = "percent" | "amount";


export interface CalendarSeason {
  /** properties.amenities.seasons[].id — the Calendar's own identifier. */
  calendar_season_id: string;
  name: string;
  /** Every window the Calendar paints for this season, earliest first. */
  periods: { from: string; to: string }[];
  min_stay: number | null;
}

export interface DraftUnit {
  room_type_id: string;
  differential_type: DifferentialType;
  differential_value: string;
}

export interface DraftSeasonRate {
  calendar_season_id: string;
  mode: SeasonPricingMode;
  /** Column-level value: the rate (absolute mode) every unit inherits unless a cell overrides it. */
  base_rate: string;
  differential_type: Exclude<DifferentialType, "none">;
  differential_value: string;
  extra_adult_rate: string;
  /** Per-unit cell values, interpreted per the column mode. room_type_id -> raw input. */
  unit_rates: Record<string, string>;
}

export interface RatePlanDraft {
  rate_plan_id: string | null;
  name: string;
  code: string;
  description: string;
  pricing_model: string;
  base_rate: string;
  is_active: boolean;
  min_stay: string;
  max_stay: string;
  min_advance_days: string;
  max_advance_days: string;
  requires_deposit: boolean;
  breakfast_included: boolean;
  breakfast_amount: string;
  breakfast_basis: string;
  policy_id: string | null;
  /** This plan supplies the live/direct rate for its property (one per property). */
  is_primary_sell: boolean;
  /** Include this plan when pricing the Channel Manager / OTA push. */
  push_to_channels: boolean;
  /** Tie-break when several plans price the same unit — lower wins. */
  sell_priority: string;
  units: DraftUnit[];
  season_rates: DraftSeasonRate[];
}

export const emptyDraft = (): RatePlanDraft => ({
  rate_plan_id: null,
  name: "",
  code: "",
  description: "",
  pricing_model: "per_room",
  base_rate: "",
  is_active: true,
  min_stay: "1",
  max_stay: "",
  min_advance_days: "",
  max_advance_days: "",
  requires_deposit: false,
  breakfast_included: false,
  breakfast_amount: "",
  breakfast_basis: "per_person_per_night",
  policy_id: null,
  is_primary_sell: false,
  push_to_channels: true,
  sell_priority: "100",
  units: [],
  season_rates: [],
});

/** Live nightly rates the booking engine currently resolves: season id -> unit id -> amount. */
export type LiveSeasonMatrix = Map<string, Map<string, number>>;

export type DraftAction =
  | { type: "reset"; draft: RatePlanDraft }
  | { type: "field"; key: keyof RatePlanDraft; value: RatePlanDraft[keyof RatePlanDraft] }
  | { type: "toggle_unit"; roomTypeId: string }
  | { type: "unit_differential"; roomTypeId: string; differential_type?: DifferentialType; differential_value?: string }
  | { type: "season"; calendarSeasonId: string; patch: Partial<DraftSeasonRate> }
  /** One cell of the unit x season matrix. */
  | { type: "season_unit_rate"; calendarSeasonId: string; roomTypeId: string; value: string }
  /** Push one value into every unit of a season column. */
  | { type: "fill_season_column"; calendarSeasonId: string; value: string; roomTypeIds: string[] }
  /** Push one unit's value across every priced season (copy to the right). */
  | { type: "fill_unit_row"; roomTypeId: string; sourceCalendarSeasonId: string; calendarSeasonIds: string[] }
  /**
   * Seed the matrix from the rates the live booking engine resolves today. Only the
   * seasons in `matrix` are touched; `calendarSeasonId` limits it to one column.
   */
  | { type: "seed_matrix"; matrix: LiveSeasonMatrix; calendarSeasonId?: string };

const emptySeasonRate = (calendarSeasonId: string): DraftSeasonRate => ({
  calendar_season_id: calendarSeasonId,
  mode: "none",
  base_rate: "",
  differential_type: "amount",
  differential_value: "",
  extra_adult_rate: "",
  unit_rates: {},
});

/** Typing a rate into a "Not priced" column promotes it to a fixed seasonal rate. */
const promoted = (rate: DraftSeasonRate, value: string): DraftSeasonRate =>
  rate.mode === "none" && value !== "" ? { ...rate, mode: "absolute" } : rate;


export function ratePlanDraftReducer(state: RatePlanDraft, action: DraftAction): RatePlanDraft {
  switch (action.type) {
    case "reset":
      return action.draft;

    case "field":
      return { ...state, [action.key]: action.value } as RatePlanDraft;

    case "toggle_unit": {
      const exists = state.units.some((u) => u.room_type_id === action.roomTypeId);
      return {
        ...state,
        units: exists
          ? state.units.filter((u) => u.room_type_id !== action.roomTypeId)
          : [...state.units, { room_type_id: action.roomTypeId, differential_type: "none", differential_value: "" }],
      };
    }

    case "unit_differential":
      return {
        ...state,
        units: state.units.map((u) =>
          u.room_type_id === action.roomTypeId
            ? {
                ...u,
                differential_type: action.differential_type ?? u.differential_type,
                differential_value: action.differential_value ?? u.differential_value,
              }
            : u,
        ),
      };

    case "season": {
      const existing = state.season_rates.find((s) => s.calendar_season_id === action.calendarSeasonId);
      const next = { ...(existing ?? emptySeasonRate(action.calendarSeasonId)), ...action.patch };
      return {
        ...state,
        season_rates: existing
          ? state.season_rates.map((s) => (s.calendar_season_id === action.calendarSeasonId ? next : s))
          : [...state.season_rates, next],
      };
    }

    case "season_unit_rate": {
      const existing = state.season_rates.find((s) => s.calendar_season_id === action.calendarSeasonId);
      const current = promoted(existing ?? emptySeasonRate(action.calendarSeasonId), action.value);
      const unit_rates = { ...current.unit_rates };
      if (action.value === "") delete unit_rates[action.roomTypeId];
      else unit_rates[action.roomTypeId] = action.value;
      const next = { ...current, unit_rates };
      return {
        ...state,
        season_rates: existing
          ? state.season_rates.map((s) => (s.calendar_season_id === action.calendarSeasonId ? next : s))
          : [...state.season_rates, next],
      };
    }

    case "fill_season_column": {
      const existing = state.season_rates.find((s) => s.calendar_season_id === action.calendarSeasonId);
      const current = promoted(existing ?? emptySeasonRate(action.calendarSeasonId), action.value);
      const unit_rates: Record<string, string> = { ...current.unit_rates };
      for (const id of action.roomTypeIds) {
        if (action.value === "") delete unit_rates[id];
        else unit_rates[id] = action.value;
      }
      const next = { ...current, unit_rates };
      return {
        ...state,
        season_rates: existing
          ? state.season_rates.map((s) => (s.calendar_season_id === action.calendarSeasonId ? next : s))
          : [...state.season_rates, next],
      };
    }

    case "seed_matrix": {
      const seasonIds = action.calendarSeasonId
        ? [action.calendarSeasonId].filter((id) => action.matrix.has(id))
        : [...action.matrix.keys()];
      if (seasonIds.length === 0) return state;
      let season_rates = state.season_rates;
      for (const seasonId of seasonIds) {
        const cells = action.matrix.get(seasonId);
        if (!cells || cells.size === 0) continue;
        const existing = season_rates.find((s) => s.calendar_season_id === seasonId);
        const current = existing ?? emptySeasonRate(seasonId);
        const unit_rates = { ...current.unit_rates };
        for (const [roomTypeId, amount] of cells) {
          if (!Number.isFinite(amount) || amount <= 0) continue;
          unit_rates[roomTypeId] = String(amount);
        }
        // Seeded values are absolute nightly rates, never differences.
        const next: DraftSeasonRate = { ...current, mode: "absolute", unit_rates };
        season_rates = existing
          ? season_rates.map((s) => (s.calendar_season_id === seasonId ? next : s))
          : [...season_rates, next];
      }
      return season_rates === state.season_rates ? state : { ...state, season_rates };
    }


    case "fill_unit_row": {
      const ordered = action.calendarSeasonIds
        .map((id) => state.season_rates.find((s) => s.calendar_season_id === id))
        .filter((s): s is DraftSeasonRate => !!s && s.mode !== "none");
      const preferred = ordered.find((s) => s.calendar_season_id === action.sourceCalendarSeasonId);
      const source =
        preferred && (preferred.unit_rates[action.roomTypeId] ?? "") !== ""
          ? preferred
          : ordered.find((s) => (s.unit_rates[action.roomTypeId] ?? "") !== "");
      const value = source?.unit_rates[action.roomTypeId] ?? "";
      if (value === "") return state;
      const targets = new Set(action.calendarSeasonIds);
      return {
        ...state,
        season_rates: state.season_rates.map((s) => {
          if (!targets.has(s.calendar_season_id) || s.mode === "none") return s;
          const unit_rates = { ...s.unit_rates };
          if (value === "") delete unit_rates[action.roomTypeId];
          else unit_rates[action.roomTypeId] = value;
          return { ...s, unit_rates };
        }),
      };
    }

    default:
      return state;
  }
}

export const seasonRateFor = (draft: RatePlanDraft, calendarSeasonId: string): DraftSeasonRate =>
  draft.season_rates.find((s) => s.calendar_season_id === calendarSeasonId) ?? emptySeasonRate(calendarSeasonId);

export const unitFor = (draft: RatePlanDraft, roomTypeId: string): DraftUnit | undefined =>
  draft.units.find((u) => u.room_type_id === roomTypeId);

/**
 * What this plan actually sells, per its pricing model. The season matrix rows, the
 * "Linked units" section and the helper copy all follow this so the editor speaks the
 * same language as the rate the guest is quoted.
 */
export interface PricingNoun {
  singular: string;
  plural: string;
  /** Capitalised for table headers and card titles. */
  Singular: string;
  Plural: string;
  /** Per-night unit shown next to a price, e.g. "per room / night". */
  perNight: string;
}

const PRICING_NOUNS: Record<string, { singular: string; plural: string; perNight: string }> = {
  per_room: { singular: "room", plural: "rooms", perNight: "per room / night" },
  per_person: { singular: "person", plural: "people", perNight: "per person / night" },
  per_person_sharing: { singular: "person sharing", plural: "people sharing", perNight: "per person sharing / night" },
  per_unit: { singular: "unit", plural: "units", perNight: "per unit / night" },
};

const cap = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1);

export type CanonicalPricingModel =
  | "per_room"
  | "per_person"
  | "per_person_sharing"
  | "per_unit";

/**
 * Legacy writers stored free-form pricing models ("UnitRate", "per-unit",
 * "PER PERSON"). Rate Plans is the only author of this field now, so every read
 * and every write funnels through here to keep one canonical set of values.
 */
export function canonicalPricingModel(raw: unknown): CanonicalPricingModel {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!v) return "per_room";
  if (v === "per_person_sharing" || v === "pps" || v === "per_person_share" || v === "sharing") {
    return "per_person_sharing";
  }
  if (v === "unitrate" || v === "unit_rate" || v === "per_unit" || v === "unit") return "per_unit";
  if (v === "per_night" || v === "pernight" || v === "flat" || v === "per_stay") return "per_room";
  if (v.includes("person") || v === "pp" || v === "per_pax" || v === "per_guest") return "per_person";
  if (v.includes("room")) return "per_room";
  if (v.includes("unit")) return "per_unit";
  return "per_room";
}

/** Noun set for a pricing model, normalised so legacy values still read right. */
export function pricingNoun(pricingModel: string | null | undefined): PricingNoun {
  const base = PRICING_NOUNS[canonicalPricingModel(pricingModel)] ?? PRICING_NOUNS.per_unit;
  return { ...base, Singular: cap(base.singular), Plural: cap(base.plural) };
}

/** The raw cell value for a unit in a season, "" when it inherits the column value. */
export const seasonUnitRate = (rate: DraftSeasonRate, roomTypeId: string): string =>
  rate.unit_rates[roomTypeId] ?? "";

/**
 * Read the Calendar's seasons out of a property's amenities blob. Read-only.
 * Seasons whose every window is in the past are dropped by default — they can no
 * longer be sold, so they must not add dead columns to the pricing matrix.
 */
export function readCalendarSeasons(
  amenities: Json | null | undefined,
  options: { includeExpired?: boolean } = {},
): CalendarSeason[] {
  const amen = (amenities ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(amen.seasons) ? (amen.seasons as Record<string, unknown>[]) : [];
  const out: CalendarSeason[] = [];
  for (const season of raw) {
    if (!season || season.id == null) continue;
    const rawPeriods = Array.isArray(season.periods) && (season.periods as unknown[]).length > 0
      ? (season.periods as Record<string, unknown>[])
      : [{ from: season.from ?? season.start_date, to: season.to ?? season.end_date }];
    const periods: { from: string; to: string }[] = [];
    for (const period of rawPeriods) {
      const from = period?.from ?? (period as Record<string, unknown>)?.start_date;
      const to = period?.to ?? (period as Record<string, unknown>)?.end_date;
      if (from && to) periods.push({ from: String(from), to: String(to) });
    }
    if (periods.length === 0) continue;
    periods.sort((a, b) => a.from.localeCompare(b.from));
    const minStay = Number(season.minStay ?? season.min_stay);
    out.push({
      calendar_season_id: String(season.id),
      name: String(season.title ?? season.name ?? "Season"),
      periods,
      min_stay: Number.isFinite(minStay) && minStay > 0 ? minStay : null,
    });
  }
  out.sort((a, b) => a.periods[0].from.localeCompare(b.periods[0].from));
  return options.includeExpired ? out : filterLiveSeasons(out);
}

const numeric = (value: string): number | null => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The snake_case wire payload the edge function expects. */
export function draftToPayload(draft: RatePlanDraft) {
  return {
    rate_plan_id: draft.rate_plan_id,
    name: draft.name.trim(),
    code: draft.code.trim() || null,
    description: draft.description.trim() || null,
    pricing_model: draft.pricing_model,
    base_rate: numeric(draft.base_rate),
    is_active: draft.is_active,
    min_stay: numeric(draft.min_stay),
    max_stay: numeric(draft.max_stay),
    min_advance_days: numeric(draft.min_advance_days),
    max_advance_days: numeric(draft.max_advance_days),
    requires_deposit: draft.requires_deposit,
    breakfast_included: draft.breakfast_included,
    breakfast_amount: numeric(draft.breakfast_amount),
    breakfast_basis: draft.breakfast_basis,
    policy_id: draft.policy_id,
    is_primary_sell: draft.is_primary_sell,
    push_to_channels: draft.push_to_channels,
    sell_priority: numeric(draft.sell_priority) ?? 100,
    units: draft.units.map((u) => ({
      room_type_id: u.room_type_id,
      differential_type: u.differential_type,
      differential_value: u.differential_type === "none" ? null : numeric(u.differential_value),
    })),
    season_rates: draft.season_rates
      .filter((s) => s.mode !== "none")
      .map((s) => {
        const unit_values: Record<string, number> = {};
        for (const u of draft.units) {
          const raw = s.unit_rates[u.room_type_id];
          const n = numeric(raw ?? "");
          if (n !== null) unit_values[u.room_type_id] = n;
        }
        return {
          calendar_season_id: s.calendar_season_id,
          mode: s.mode,
          base_rate: s.mode === "absolute" ? numeric(s.base_rate) : null,
          differential_type: s.mode === "differential" ? s.differential_type : "none",
          differential_value: s.mode === "differential" ? numeric(s.differential_value) : null,
          extra_adult_rate: numeric(s.extra_adult_rate),
          unit_values,
        };
      }),
  };
}

/** Human summary used on the list cards. */
export function pricingSummary(baseRate: number | null, pricedSeasons: number): string {
  const base = baseRate && baseRate > 0 ? `Base R${baseRate.toLocaleString()}` : "No base rate";
  if (pricedSeasons === 0) return base;
  return `${base} · ${pricedSeasons} season${pricedSeasons === 1 ? "" : "s"} priced`;
}
