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
  | "blocked_marker"
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
  blocked_marker: "Block / closed (no occupant named)",
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

/** Fields a pattern can be scoped to, e.g. `guest:MOI` or `room:Room 0`. */
const SCOPES = ["guest", "company", "room", "source", "status", "type"] as const;
type Scope = (typeof SCOPES)[number];

const fieldText = (row: LedgerRow, scope: Scope): string => {
  switch (scope) {
    case "guest":
      return String(row.guest_name ?? "");
    case "company":
      return String(row.company ?? "");
    case "room":
      return String(row.room_name ?? "");
    case "source":
      return String(row.source ?? "");
    case "status":
      return String(row.status ?? "");
    case "type":
      return String(row.type ?? "");
  }
};

/** Every text field an unscoped keep/exclude pattern may match against. */
const haystack = (row: LedgerRow): string =>
  [row.guest_name, row.company, row.source, row.room_name, row.type, row.status]
    .map((value) => String(value ?? ""))
    .join(" | ")
    .toLowerCase();

const firstMatch = (row: LedgerRow, patterns: string[]): string | null => {
  if (!patterns.length) return null;
  const all = haystack(row);
  for (const pattern of patterns) {
    const raw = pattern.trim();
    if (!raw) continue;
    // Scoped pattern: only that one field decides.
    const colon = raw.indexOf(":");
    if (colon > 0) {
      const scope = raw.slice(0, colon).trim().toLowerCase() as Scope;
      const needle = raw.slice(colon + 1).trim().toLowerCase();
      if (SCOPES.includes(scope) && needle) {
        if (fieldText(row, scope).toLowerCase().includes(needle)) return pattern;
        continue;
      }
    }
    if (all.includes(raw.toLowerCase())) return pattern;
  }
  return null;
};

/**
 * Labels NightsBridge operators type into a booking that is really a closed or
 * held room rather than an occupant: blocks, maintenance, owner use, "not
 * available", repairs, or the room's own name typed into the guest field.
 */
const MARKER_LABEL =
  /(\bblock|\bclose[ds]?\b|not available|unavailable|maintenance|owner use|owners use|out of order|do not book|repair|reno(vation)?|do not sell|\bheld\b|\bhold\b)/i;

/** The person or account the night is occupied by, if any. */
const occupant = (row: LedgerRow): string =>
  String(row.guest_name ?? "").trim() || String(row.company ?? "").trim();

/**
 * True when nobody is really in the room: no occupant named, a placeholder
 * (x, xx, n/a, -) or a block/closed marker.
 */
export function looksLikeBlockMarker(row: LedgerRow): boolean {
  const label = occupant(row);
  if (!label) return true;
  if (/^[-–—.]+$/.test(label)) return true;
  if (/^x+$/i.test(label)) return true;
  if (/^n\/?a$/i.test(label)) return true;
  return MARKER_LABEL.test(label);
}

/** Room labels reduced to comparable keys ("Kunjani Suite - 2 Bedroom" -> "kunjanisuite2bedroom"). */
export const roomKey = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Every distinct room label the export uses, for occupant-marker detection. */
export function roomNameKeys(rows: LedgerRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const key = roomKey(row.room_name);
    if (key.length >= 4) out.add(key);
  }
  return out;
}

export function classifyRow(
  row: LedgerRow,
  rules: RowRules = EMPTY_ROW_RULES,
  roomNames?: Set<string>,
): RowClassification {
  const excluded = firstMatch(row, rules.excludePatterns);
  if (excluded) return { klass: "excluded_by_rule", matched: excluded };

  const room = String(row.room_name ?? "").trim().toLowerCase();
  if (/^room\s*0\b/.test(room)) return { klass: "room_zero", matched: null };
  if (room.startsWith("event")) return { klass: "event", matched: null };
  if (room.includes("holding in credit") || room.includes("holding credit")) {
    return { klass: "holding_credit", matched: null };
  }

  // A property's keep-list always wins: those labels are real occupancy even
  // when the export shows 0.00 or flags the room Unavailable.
  const kept = firstMatch(row, rules.keepPatterns);
  if (kept) return { klass: "sellable", matched: kept };

  // Status alone never decides. Operators host real guests free of charge on
  // rooms flagged "Unavailable" and those nights are sold, so only the label on
  // the booking can tell a hold apart from a guest. A property that closes
  // rooms under a name the label rules cannot recognise adds it to its own
  // exclude list (field-scoped, e.g. `guest:courtney`).
  // An operator holding a unit often types the unit's own name into the guest
  // field ("Kunjani Suite" against Presidential Villa). Nobody is staying, so
  // the nights are not sellable even though a token amount may be captured.
  if (roomNames && roomNames.size > 0) {
    const label = roomKey(occupant(row));
    if (label.length >= 5 && label !== roomKey(row.room_name)) {
      for (const name of roomNames) {
        if (name === label || name.startsWith(label)) {
          return { klass: "blocked_marker", matched: null };
        }
      }
    }
  }

  // NightsBridge exports carry blocks, maintenance and owner holds as bookings.
  // They are recognised by the label typed into the booking, not by revenue:
  // real guests are sometimes hosted at 0.00 (comps, packages, tour operators).
  if (rules.dropZeroRevenue && looksLikeBlockMarker(row)) {
    return { klass: "blocked_marker", matched: null };
  }

  return { klass: "sellable", matched: null };
}

/**
 * Classes whose money is still accommodation revenue on the ledger even though
 * their nights are not sellable room nights. Room 0, events and holding-in-
 * credit are separate revenue streams and are reported on their own lines.
 *
 * A property exclude-list match (`excluded_by_rule`) is NOT in this list: an
 * explicit exclude pattern means the line belongs to a sibling property or
 * another ledger, so neither its nights nor its money are this property's.
 */
export const REVENUE_BEARING_NON_SELLABLE: RowClass[] = [
  "blocked_marker",
  "blocked_zero_revenue",
  "unavailable",
];


