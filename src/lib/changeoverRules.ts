/**
 * Changeover rules — one resolver for authoring, calendars and the local availability guard.
 *
 * Authoring shapes, in order of precedence for a given night:
 *   1. unit override      — `amenities.changeover_by_unit[unitId]`
 *   2. date-range / season span — `amenities.changeover_spans[]`
 *   3. weekday override   — `amenities.changeover_rules.saturday` …
 *   4. property master    — `amenities.changeover`
 *
 * Internal code scale (never the wire scale):
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 */

import { changeoverCodeLabel, CHANGEOVER_DOW_KEYS, type ChangeoverDowKey } from "@/config/channelPropertyTypes";

export interface ChangeoverSpan {
  /** Stable id so the editor can update/remove a row. */
  id: string;
  /** Inclusive ISO date range the span applies to. */
  from: string;
  to: string;
  code: number;
  /** Set when the span was authored by picking a season. */
  season_id?: string | null;
  label?: string | null;
}

export interface ChangeoverConfig {
  master: number | null;
  rules: Partial<Record<ChangeoverDowKey, number>>;
  spans: ChangeoverSpan[];
  byUnit: Record<string, number>;
}

export type ChangeoverSource = "unit" | "span" | "weekday" | "master" | "assumed";

export interface ChangeoverResolution {
  code: number;
  source: ChangeoverSource;
  /** Human sentence naming where the rule came from. */
  origin: string;
}

const isCode = (v: unknown): v is number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 3;
};

const WEEKDAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Read the authored config out of a property's `amenities` jsonb. */
export function changeoverConfigFromAmenities(
  amenities: Record<string, unknown> | null | undefined,
): ChangeoverConfig {
  const a = (amenities ?? {}) as Record<string, unknown>;
  const rawRules = (a.changeover_rules ?? null) as Record<string, unknown> | null;
  const rules: Partial<Record<ChangeoverDowKey, number>> = {};
  if (rawRules && typeof rawRules === "object" && !Array.isArray(rawRules)) {
    for (const day of CHANGEOVER_DOW_KEYS) {
      if (isCode(rawRules[day])) rules[day] = Number(rawRules[day]);
    }
  }
  const rawByUnit = (a.changeover_by_unit ?? null) as Record<string, unknown> | null;
  const byUnit: Record<string, number> = {};
  if (rawByUnit && typeof rawByUnit === "object" && !Array.isArray(rawByUnit)) {
    for (const [unitId, value] of Object.entries(rawByUnit)) {
      if (isCode(value)) byUnit[unitId] = Number(value);
    }
  }
  return {
    master: isCode(a.changeover) ? Number(a.changeover) : null,
    rules,
    spans: normalizeChangeoverSpans(a.changeover_spans),
    byUnit,
  };
}

/** Tolerant parse of the stored span list — bad rows are dropped, never thrown on. */
export function normalizeChangeoverSpans(raw: unknown): ChangeoverSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: ChangeoverSpan[] = [];
  raw.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const from = typeof r.from === "string" ? r.from.slice(0, 10) : "";
    const to = typeof r.to === "string" ? r.to.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    if (!isCode(r.code)) return;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `span-${index}-${from}`,
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      code: Number(r.code),
      season_id: typeof r.season_id === "string" ? r.season_id : null,
      label: typeof r.label === "string" ? r.label : null,
    });
  });
  // Later spans win on overlap, so keep authoring order.
  return out;
}

function spanForDate(spans: ChangeoverSpan[], dateIso: string): ChangeoverSpan | null {
  let match: ChangeoverSpan | null = null;
  for (const span of spans) {
    if (dateIso >= span.from && dateIso <= span.to) match = span;
  }
  return match;
}

/** The changeover rule in force on one night, and where it came from. */
export function resolveChangeover(
  config: ChangeoverConfig,
  dateIso: string,
  unitId?: string | null,
): ChangeoverResolution {
  if (unitId && isCode(config.byUnit[unitId])) {
    return { code: config.byUnit[unitId], source: "unit", origin: "Unit override" };
  }
  const span = spanForDate(config.spans, dateIso);
  if (span) {
    return {
      code: span.code,
      source: "span",
      origin: span.label
        ? `Season "${span.label}"`
        : `Date range ${span.from} → ${span.to}`,
    };
  }
  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  // CHANGEOVER_DOW_KEYS is Sunday-first, matching getUTCDay().
  const weekdayKey = CHANGEOVER_DOW_KEYS[dow] as ChangeoverDowKey;
  if (isCode(config.rules[weekdayKey])) {

    return {
      code: Number(config.rules[weekdayKey]),
      source: "weekday",
      origin: `${WEEKDAY_LABEL[dow]} rule`,
    };
  }
  if (isCode(config.master)) {
    return { code: Number(config.master), source: "master", origin: "Property master rule" };
  }
  return { code: 3, source: "assumed", origin: "No rule authored — assumed both allowed" };
}

/**
 * The exception to show on a calendar night: null when the night follows the property master
 * rule (calendars mark exceptions only).
 */
export function changeoverException(
  config: ChangeoverConfig,
  dateIso: string,
  unitId?: string | null,
): { code: number; origin: string; tooltip: string } | null {
  const resolved = resolveChangeover(config, dateIso, unitId);
  const masterCode = isCode(config.master) ? Number(config.master) : 3;
  if (resolved.source === "master" || resolved.source === "assumed") return null;
  if (resolved.code === masterCode) return null;
  return {
    code: resolved.code,
    origin: resolved.origin,
    tooltip: `Changeover: ${changeoverCodeLabel(resolved.code)}\n${resolved.origin} — differs from the property master rule (${changeoverCodeLabel(masterCode)}).`,
  };
}

export { changeoverCodeLabel };
