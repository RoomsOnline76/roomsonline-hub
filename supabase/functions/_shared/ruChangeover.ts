/**
 * Changeover code translation between ROL'OS and the channel wire format.
 *
 * ROL'OS internal scale (UI, `amenities.changeover`, `amenities.changeover_rules`):
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 *
 * Channel wire scale (`<C>` in Push_PutAvbUnits_RQ / `Changeover` in the availability calendar),
 * MEASURED against the live channel (Leopard listing 5974995, 2026-08-31):
 *   4 = check-in AND check-out allowed  ← the only code that lets a reservation register
 *   1 = neither check-in nor check-out
 *   2 / 3 = one-sided codes; both refuse a check-in in practice
 *
 * History — read before "fixing" this again. The published spec reads 1 = both allowed, and this
 * file was once reverted to that reading. With a demonstrably clean calendar (Units="1",
 * IsBlocked=false, Reservations="0", MinStay 1) every stay published with `<C>1</C>` was refused
 * with "Property is not available for a given dates - Can't check in or check out on selected
 * dates", while the identical stay on nights republished as `<C>4</C>` was accepted immediately
 * (reservation 147112908). The measurement wins over the document.
 *
 * One-sided internal rules (1 and 2) publish as 4 — an over-permissive night at the channel beats
 * a total sales blackout — and are enforced locally by the availability guard for direct bookings.
 */

const TO_WIRE: Record<number, number> = { 0: 1, 1: 4, 2: 4, 3: 4 };
const FROM_WIRE: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3 };

/** Internal (0..3) → wire (1..4). Unknown/null falls back to "check-in and check-out". */
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
