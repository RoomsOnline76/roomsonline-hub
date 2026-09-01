/**
 * Pure indexer: turns saved LOS rungs / full-stay cells into a read-only,
 * season-keyed view for display surfaces (Calendar, list cards).
 *
 * It never computes a guest total — Calendar has no daily matrix — so labels
 * only ever repeat the authored offset or pin. Quote math stays in
 * `supabase/functions/_shared/ratePricing.ts`.
 */

export interface StayShapePlanRow {
  id: string;
  name: string;
  is_active: boolean | null;
  los_enabled: boolean | null;
  fsp_enabled: boolean | null;
}

export interface StayShapeLosRow {
  rate_plan_id: string;
  calendar_season_id: string | null;
  nights: number;
  derivation_type: string | null;
  derivation_value: number | null;
  is_pinned: boolean | null;
  pinned_rate: number | null;
}

export interface StayShapeFspRow {
  rate_plan_id: string;
  calendar_season_id: string | null;
  nights: number;
  nr_of_guests: number;
  derivation_type: string | null;
  derivation_value: number | null;
  is_pinned: boolean | null;
  pinned_total: number | null;
}

export type StayShapePlanOnSeason = {
  rate_plan_id: string;
  name: string;
  los: Array<{ nights: number; label: string }>;
  fsp: Array<{ nights: number; guests: number; label: string }>;
};

export type StayShapeBySeason = Record<string, { plans: StayShapePlanOnSeason[] }>;

const money = (v: number) => `R${Math.round(v).toLocaleString()}`;

function offsetLabel(type: string | null, value: number | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const sign = v < 0 ? "−" : "+";
  const abs = Math.abs(v);
  if (type === "percent") return `${sign}${abs}%`;
  if (type === "amount") return `${sign}${money(abs)}`;
  return null;
}

export function losRungLabel(row: StayShapeLosRow): string | null {
  if (!Number.isFinite(row.nights) || row.nights < 1) return null;
  if (row.is_pinned) {
    if (row.pinned_rate === null || row.pinned_rate === undefined) return null;
    return `from ${row.nights}n pinned ${money(Number(row.pinned_rate))}/n`;
  }
  const off = offsetLabel(row.derivation_type, row.derivation_value);
  return off ? `from ${row.nights}n ${off}` : null;
}

export function fspCellLabel(row: StayShapeFspRow): string | null {
  if (!Number.isFinite(row.nights) || row.nights < 1) return null;
  if (!Number.isFinite(row.nr_of_guests) || row.nr_of_guests < 1) return null;
  const head = `${row.nights}n × ${row.nr_of_guests}`;
  if (row.is_pinned) {
    if (row.pinned_total === null || row.pinned_total === undefined) return null;
    return `${head} pinned ${money(Number(row.pinned_total))}`;
  }
  const off = offsetLabel(row.derivation_type, row.derivation_value);
  return off ? `${head} ${off}` : null;
}

/** Season-keyed index of every displayable ladder row. */
export function indexStayShapeBySeason(
  plans: StayShapePlanRow[],
  rungs: StayShapeLosRow[],
  cells: StayShapeFspRow[],
): StayShapeBySeason {
  const usable = new Map<string, StayShapePlanRow>();
  for (const p of plans || []) {
    if (p.is_active === false) continue;
    if (!p.los_enabled && !p.fsp_enabled) continue;
    usable.set(p.id, p);
  }
  if (usable.size === 0) return {};

  const out: StayShapeBySeason = {};

  const entryFor = (seasonId: string, plan: StayShapePlanRow): StayShapePlanOnSeason => {
    const bucket = (out[seasonId] ??= { plans: [] });
    let entry = bucket.plans.find((e) => e.rate_plan_id === plan.id);
    if (!entry) {
      entry = { rate_plan_id: plan.id, name: plan.name, los: [], fsp: [] };
      bucket.plans.push(entry);
    }
    return entry;
  };

  for (const row of rungs || []) {
    const seasonId = row.calendar_season_id;
    if (!seasonId) continue;
    const plan = usable.get(row.rate_plan_id);
    if (!plan || !plan.los_enabled) continue;
    const label = losRungLabel(row);
    if (!label) continue;
    entryFor(seasonId, plan).los.push({ nights: row.nights, label });
  }

  for (const row of cells || []) {
    const seasonId = row.calendar_season_id;
    if (!seasonId) continue;
    const plan = usable.get(row.rate_plan_id);
    if (!plan || !plan.fsp_enabled) continue;
    const label = fspCellLabel(row);
    if (!label) continue;
    entryFor(seasonId, plan).fsp.push({ nights: row.nights, guests: row.nr_of_guests, label });
  }

  for (const seasonId of Object.keys(out)) {
    const bucket = out[seasonId];
    bucket.plans = bucket.plans.filter((p) => p.los.length > 0 || p.fsp.length > 0);
    for (const p of bucket.plans) {
      p.los.sort((a, b) => a.nights - b.nights);
      p.fsp.sort((a, b) => a.nights - b.nights || a.guests - b.guests);
    }
    bucket.plans.sort((a, b) => a.name.localeCompare(b.name));
    if (bucket.plans.length === 0) delete out[seasonId];
  }

  return out;
}
