// Per-property NightsBridge quirks (server side).
//
// Mirrors src/lib/nbProfile.ts. Everything here is driven by configuration on
// `property_report_settings.nb_profile` — the parser never knows a property name.
import type { AggregateResult, LedgerRow } from "./nightsbridgeAggregate.ts";

export interface NbRouteToken {
  match: string;
  property_id: string;
}

export interface NbProfile {
  exclude_patterns: string[];
  keep_patterns: string[];
  route_tokens: NbRouteToken[];
  sheet_map: Record<string, string>;
  group_property_ids: string[];
  /** Siblings whose own export already claims rows this export duplicates. */
  dedupe_sibling_property_ids: string[];
  group_label: string | null;
  stly_from_prior_workbook: boolean;
  historical_from_current_ledger: boolean;
}

export const EMPTY_NB_PROFILE: NbProfile = {
  exclude_patterns: [],
  keep_patterns: [],
  route_tokens: [],
  sheet_map: {},
  group_property_ids: [],
  dedupe_sibling_property_ids: [],
  group_label: null,
  stly_from_prior_workbook: false,
  historical_from_current_ledger: false,
};

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = String(entry ?? "").trim();
    if (text) seen.add(text);
  }
  return [...seen];
};

const tokenList = (value: unknown): NbRouteToken[] => {
  if (!Array.isArray(value)) return [];
  const out: NbRouteToken[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const match = String((entry as NbRouteToken).match ?? "").trim();
    const propertyId = String((entry as NbRouteToken).property_id ?? "").trim();
    if (match && propertyId) out.push({ match, property_id: propertyId });
  }
  return out;
};

const stringMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();
    const propertyId = String(raw ?? "").trim();
    if (name && propertyId) out[name] = propertyId;
  }
  return out;
};

export function parseNbProfile(value: unknown): NbProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_NB_PROFILE };
  const raw = value as Record<string, unknown>;
  const label = String(raw.group_label ?? "").trim();
  return {
    exclude_patterns: stringList(raw.exclude_patterns),
    keep_patterns: stringList(raw.keep_patterns),
    route_tokens: tokenList(raw.route_tokens),
    sheet_map: stringMap(raw.sheet_map),
    group_property_ids: stringList(raw.group_property_ids),
    dedupe_sibling_property_ids: stringList(raw.dedupe_sibling_property_ids),
    group_label: label || null,
    stly_from_prior_workbook: Boolean(raw.stly_from_prior_workbook),
    historical_from_current_ledger: Boolean(raw.historical_from_current_ledger),
  };
}

/** A ledger row plus where the file/sheet it arrived on came from. */
export interface RoutableRow extends LedgerRow {
  /** Sheet the row was read from, when the source was a workbook. */
  source_sheet?: string | null;
}

const haystack = (row: RoutableRow): string =>
  [row.room_name, row.guest_name, row.company, row.source]
    .map((value) => String(value ?? ""))
    .join(" | ")
    .toLowerCase();

/**
 * Which property a row belongs to, or null when nothing claims it.
 * Sheet mapping wins over room/guest tokens: a per-property sheet is explicit.
 */
export function routeRow(
  row: RoutableRow,
  profile: NbProfile,
): { property_id: string; matched: string } | null {
  const sheet = String(row.source_sheet ?? "").trim();
  if (sheet) {
    for (const [name, propertyId] of Object.entries(profile.sheet_map)) {
      if (name.toLowerCase() === sheet.toLowerCase()) {
        return { property_id: propertyId, matched: `sheet "${name}"` };
      }
    }
  }
  if (profile.route_tokens.length) {
    const text = haystack(row);
    for (const token of profile.route_tokens) {
      const needle = token.match.trim().toLowerCase();
      if (needle && text.includes(needle)) {
        return { property_id: token.property_id, matched: token.match };
      }
    }
  }
  return null;
}

export interface RoutingOutcome {
  /** Rows that belong to the run's property (or that nothing routed away). */
  kept: RoutableRow[];
  /** Rows claimed by a sibling property, with the token that claimed them. */
  routedAway: Array<{ row: RoutableRow; property_id: string; matched: string }>;
  /** Counts per destination property, for the parse event. */
  routedCounts: Record<string, number>;
}

/**
 * Splits a mixed ledger for a single-property run.
 * Rows routed to another property leave the snapshot but stay auditable.
 */
export function splitByRouting(
  rows: RoutableRow[],
  profile: NbProfile,
  runPropertyId: string,
): RoutingOutcome {
  const kept: RoutableRow[] = [];
  const routedAway: RoutingOutcome["routedAway"] = [];
  const routedCounts: Record<string, number> = {};

  const routingActive =
    profile.route_tokens.length > 0 || Object.keys(profile.sheet_map).length > 0;
  if (!routingActive) return { kept: rows, routedAway, routedCounts };

  for (const row of rows) {
    const routed = routeRow(row, profile);
    if (!routed || routed.property_id === runPropertyId) {
      kept.push(row);
      continue;
    }
    routedAway.push({ row, property_id: routed.property_id, matched: routed.matched });
    routedCounts[routed.property_id] = (routedCounts[routed.property_id] ?? 0) + 1;
  }

  return { kept, routedAway, routedCounts };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Adds routed-away rows to the snapshot's audit list so the reviewer sees every
 * sibling row leaving this property's figures in the Excluded rows card.
 */
export function recordRoutedRows(
  aggregate: AggregateResult,
  routedAway: RoutingOutcome["routedAway"],
  propertyNames: Record<string, string>,
): void {
  for (const entry of routedAway) {
    const month = String(entry.row.arrival ?? "").slice(0, 7);
    if (!month) continue;
    const label = propertyNames[entry.property_id] ?? entry.property_id;

    const list = aggregate.excluded_rows[month] ?? [];
    if (list.length < 250) {
      list.push({
        booking_id: entry.row.booking_id,
        arrival: entry.row.arrival,
        nights: entry.row.nights,
        revenue: round2(entry.row.revenue || 0),
        room_name: entry.row.room_name,
        guest_name: entry.row.guest_name ?? "",
        company: entry.row.company ?? "",
        source: entry.row.source,
        reason: "excluded_by_rule",
        matched: `${entry.matched} → ${label}`,
      });
    }
    aggregate.excluded_rows[month] = list;

    const byReason = aggregate.non_sellable_by_reason.excluded_by_rule ?? {};
    const bucket = byReason[month] ?? { revenue: 0, nights: 0, rows: 0 };
    bucket.revenue = round2(bucket.revenue + (entry.row.revenue || 0));
    bucket.nights += entry.row.nights || 0;
    bucket.rows += 1;
    byReason[month] = bucket;
    aggregate.non_sellable_by_reason.excluded_by_rule = byReason;

    aggregate.totals.non_sellable_rows += 1;
  }
}
