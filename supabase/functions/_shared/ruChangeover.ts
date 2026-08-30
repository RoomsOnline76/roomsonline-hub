/**
 * Changeover code translation between ROL'OS and the channel wire format.
 *
 * ROL'OS internal scale (UI, `amenities.changeover`, `amenities.changeover_rules`):
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 *
 * Channel wire scale (`<C>` in Push_PutAvbUnits_RQ / `Changeover` in the calendar) — MEASURED
 * live on 2026-08-30 against listing 5973280, not assumed:
 *   4 = arrival AND departure allowed   ← the only code that lets a guest check in
 *   1 = neither arrival nor departure
 *   2 / 3 = one-sided codes; both refused a check-in in the probe, so they are treated as
 *           "arrival closed" and are never used to publish a merely one-sided ROL'OS rule.
 *
 * Why this matters: we previously sent 1 for "both allowed", which published every night of
 * every calendar as "no check-in, no check-out". The channel then refused every reservation
 * write with "Property is not available for a given dates - Can't check in or check out on
 * selected dates" even though Units=1 / IsBlocked=false read back cleanly. Sending 4 for the
 * same stay was accepted immediately (the next refusal was only the price check, status 34).
 *
 * A one-sided internal rule (arrival-only / departure-only) cannot be expressed on the wire
 * without closing arrivals outright, so it is published as 4 and stays enforced locally by our
 * own availability guard — a rare over-permissive night beats a permanent sales blackout.
 */

const TO_WIRE: Record<number, number> = { 0: 1, 1: 4, 2: 4, 3: 4 };
const FROM_WIRE: Record<number, number> = { 1: 0, 2: 2, 3: 1, 4: 3 };

/** Internal (0..3) → wire (1..4). Unknown/null falls back to "arrival and departure". */
export function toWireChangeover(internal: unknown): number {
  const n = Number(internal);
  return Number.isFinite(n) && TO_WIRE[n] != null ? TO_WIRE[n] : 4;
}


/** Wire (1..4) → internal (0..3). Returns null when the value is absent or unknown. */
export function fromWireChangeover(wire: unknown): number | null {
  if (wire == null || wire === '') return null;
  const n = Number(wire);
  return Number.isFinite(n) && FROM_WIRE[n] != null ? FROM_WIRE[n] : null;
}
