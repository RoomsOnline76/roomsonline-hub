// Group-export de-duplication for NightsBridge clients whose flagship BBID
// exports the sibling properties' bookings too.
//
// Jembisa is the reference case: the Jembisa bookings report carries Magari and
// Palala stays verbatim (same guest, arrival, nights and revenue). Those rows
// cannot be routed by a stable text token — the only reliable signal is that the
// sibling's own export already claims the identical row. Every parse therefore
// stores a fingerprint per kept row, and a group parse drops rows a sibling
// already reported for the same review, recording them as excluded so the
// reviewer still sees them.
import type { AggregateResult, LedgerRow } from "./nightsbridgeAggregate.ts";

/** Stable identity of a booking line across two exports of the same stay. */
export function fingerprintRow(row: LedgerRow): string {
  const money = Math.round((Number(row.revenue) || 0) * 100);
  const label = String(row.guest_name ?? row.room_name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return [label, String(row.arrival ?? "").slice(0, 10), Number(row.nights) || 0, money].join("|");
}

export const fingerprintMonth = (row: LedgerRow): string =>
  String(row.arrival ?? "").slice(0, 7);

export interface SiblingDedupeOutcome {
  kept: LedgerRow[];
  dropped: Array<{ row: LedgerRow; property_id: string }>;
  droppedCounts: Record<string, number>;
}

/**
 * Removes rows whose fingerprint a sibling property already claimed.
 * `claims` maps fingerprint → property_id of the sibling that reported it.
 */
export function splitBySiblingClaims(
  rows: LedgerRow[],
  claims: Map<string, string>,
): SiblingDedupeOutcome {
  if (claims.size === 0) return { kept: rows, dropped: [], droppedCounts: {} };

  const kept: LedgerRow[] = [];
  const dropped: SiblingDedupeOutcome["dropped"] = [];
  const droppedCounts: Record<string, number> = {};
  // A group export can hold the same sibling line twice (one per unit); each
  // sibling claim may only remove as many rows as the sibling itself reported.
  const budget = new Map<string, number>();

  for (const row of rows) {
    const key = fingerprintRow(row);
    const owner = claims.get(key);
    if (!owner) {
      kept.push(row);
      continue;
    }
    const used = budget.get(key) ?? 0;
    budget.set(key, used + 1);
    dropped.push({ row, property_id: owner });
    droppedCounts[owner] = (droppedCounts[owner] ?? 0) + 1;
  }

  return { kept, dropped, droppedCounts };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Adds sibling-claimed rows to the snapshot's audit list. */
export function recordSiblingDroppedRows(
  aggregate: AggregateResult,
  dropped: SiblingDedupeOutcome["dropped"],
  propertyNames: Record<string, string>,
): void {
  for (const entry of dropped) {
    const month = fingerprintMonth(entry.row);
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
        matched: `already reported by ${label}`,
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
