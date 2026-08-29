// Resolves the monthly extras (Dinner, Room 0 revenue, Comp room nights) that
// used to be typed in by hand. The parser now calculates them from the export;
// a reviewer may type over any single month, and that cell alone is treated as
// an override which survives re-processing.

export interface MonthlyMap {
  [month: string]: number;
}

export interface DerivedInputsBlock {
  dinner_by_month?: MonthlyMap | null;
  room0_by_month?: MonthlyMap | null;
  comp_rns_by_month?: MonthlyMap | null;
}

export interface OverrideFlags {
  dinner_by_month?: Record<string, boolean> | null;
  room0_by_month?: Record<string, boolean> | null;
  comp_rns_by_month?: Record<string, boolean> | null;
}

export interface AdditionalInputsRow {
  dinner_by_month?: MonthlyMap | null;
  room0_by_month?: MonthlyMap | null;
  comp_rns_by_month?: MonthlyMap | null;
  overrides?: OverrideFlags | null;
  min_stay_notes?: string | null;
  promotions_notes?: string | null;
  rate_override_notes?: string | null;
  free_commentary?: string | null;
}

export type MonthlyField = "dinner_by_month" | "room0_by_month" | "comp_rns_by_month";

export const MONTHLY_FIELDS: MonthlyField[] = [
  "dinner_by_month",
  "room0_by_month",
  "comp_rns_by_month",
];

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asMap = (value: unknown): MonthlyMap => {
  if (!value || typeof value !== "object") return {};
  const out: MonthlyMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = num(raw);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
};

const asFlags = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === true) out[key] = true;
  }
  return out;
};

/**
 * Merges calculated figures with reviewer overrides. A month is taken from the
 * reviewer only when it is flagged as an override; otherwise the latest parse wins.
 */
export function resolveAdditionalInputs(
  derived: DerivedInputsBlock | null | undefined,
  inputs: AdditionalInputsRow | null | undefined,
): Record<MonthlyField, MonthlyMap> & {
  min_stay_notes: string | null;
  promotions_notes: string | null;
  rate_override_notes: string | null;
  free_commentary: string | null;
} {
  const resolved = {} as Record<MonthlyField, MonthlyMap>;

  for (const field of MONTHLY_FIELDS) {
    const calculated = asMap(derived?.[field]);
    const reviewer = asMap(inputs?.[field]);
    const flags = asFlags(inputs?.overrides?.[field]);
    // Legacy runs carry reviewer values with no flag map at all. Until the card
    // round-trips and records flags, every stored reviewer value counts as an
    // override — otherwise a re-process would replace it with the calculated 0.
    const legacy = Object.keys(flags).length === 0;
    const merged: MonthlyMap = { ...calculated };

    for (const [month, value] of Object.entries(reviewer)) {
      if (flags[month] || legacy) merged[month] = value;
    }
    resolved[field] = merged;
  }

  return {
    ...resolved,
    min_stay_notes: inputs?.min_stay_notes ?? null,
    promotions_notes: inputs?.promotions_notes ?? null,
    rate_override_notes: inputs?.rate_override_notes ?? null,
    free_commentary: inputs?.free_commentary ?? null,
  };
}
