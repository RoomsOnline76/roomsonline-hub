// Classification of NightsBridge ledger rows into sellable nights and the
// several kinds of row that must never inflate room nights: blocks, maintenance,
// owner stays, unavailable rooms (all typically exported at 0.00 revenue), the
// Room 0 placeholder, function/event bookings and holding-in-credit rows.
//
// Zero revenue is the default signal for "not a sold night", but some properties
// genuinely occupy rooms at 0.00 — Ashbourne House's "TOURVEST ALL" bookings are
// real nights. Those are rescued by a per-property keep-list.
import type { LedgerRow } from "./nightsbridgeAggregate.ts";

export type RowClass =
  | "sellable"
  | "blocked_zero_revenue"
  | "unavailable"
  | "room_zero"
  | "event"
  | "holding_credit"
  | "excluded_by_rule";


export interface RowRules {
  /** Labels whose zero-revenue rows still count as occupied nights. */
  keepPatterns: string[];
  /** Labels that are never sold nights, whatever the revenue. */
  excludePatterns: string[];
  /**
   * Treat unexplained 0.00 rows as blocks / maintenance / owner stays. Only the
   * NightsBridge exports carry those rows, so other systems keep their behaviour.
   */
  dropZeroRevenue: boolean;
}

export interface RowClassification {
  klass: RowClass;
  /** The keep/exclude pattern that decided this row, when one did. */
  matched: string | null;
}

export const EMPTY_ROW_RULES: RowRules = {
  keepPatterns: [],
  excludePatterns: [],
  dropZeroRevenue: false,
};


export const ROW_CLASS_LABELS: Record<RowClass, string> = {
  sellable: "Sold nights",
  blocked_zero_revenue: "Zero revenue (block / maintenance / owner)",
  unavailable: "Unavailable (room out of order)",
  room_zero: "Room 0",
  event: "Events",
  holding_credit: "Holding in credit",
  excluded_by_rule: "Excluded by property rule",
};


export function normaliseRules(
  keepPatterns: unknown,
  excludePatterns: unknown,
  dropZeroRevenue = true,
): RowRules {
  const clean = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : [];
  return {
    keepPatterns: clean(keepPatterns),
    excludePatterns: clean(excludePatterns),
    dropZeroRevenue,
  };
}

/** Every text field a keep/exclude pattern may match against. */
const haystack = (row: LedgerRow): string =>
  [row.guest_name, row.company, row.source, row.room_name, row.type, row.status]
    .map((value) => String(value ?? ""))
    .join(" | ")
    .toLowerCase();

const firstMatch = (row: LedgerRow, patterns: string[]): string | null => {
  if (!patterns.length) return null;
  const text = haystack(row);
  for (const pattern of patterns) {
    const needle = pattern.trim().toLowerCase();
    if (needle && text.includes(needle)) return pattern;
  }
  return null;
};

export function classifyRow(row: LedgerRow, rules: RowRules = EMPTY_ROW_RULES): RowClassification {
  const excluded = firstMatch(row, rules.excludePatterns);
  if (excluded) return { klass: "excluded_by_rule", matched: excluded };

  const room = String(row.room_name ?? "").trim().toLowerCase();
  if (/^room\s*0\b/.test(room)) return { klass: "room_zero", matched: null };
  if (room.startsWith("event")) return { klass: "event", matched: null };
  if (room.includes("holding in credit") || room.includes("holding credit")) {
    return { klass: "holding_credit", matched: null };
  }

  // Rooms flagged Unavailable are out of order, never sold nights and never
  // complimentary — whatever revenue the export prints against them.
  const status = String(row.status ?? "").trim().toLowerCase();
  if (rules.dropZeroRevenue && status.includes("unavailable")) {
    const kept = firstMatch(row, rules.keepPatterns);
    if (kept) return { klass: "sellable", matched: kept };
    return { klass: "unavailable", matched: null };
  }

  const revenue = Number(row.revenue);

  if (rules.dropZeroRevenue && Number.isFinite(revenue) && revenue === 0) {
    const kept = firstMatch(row, rules.keepPatterns);
    if (kept) return { klass: "sellable", matched: kept };
    return { klass: "blocked_zero_revenue", matched: null };
  }

  return { klass: "sellable", matched: null };
}
