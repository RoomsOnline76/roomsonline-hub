/**
 * Authored changeover rules — plain-language guard for reservation writes.
 *
 * ROL'OS authors arrival/departure permission per weekday (`amenities.changeover_rules`, e.g.
 * `{ saturday: 0, sunday: 0 }`) with a property default in `amenities.changeover`. Internal scale:
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 *
 * A stay that arrives or departs on a barred day is refused by the channel with its own raw text
 * ("Property is not available for a given dates - Can't check in or check out on selected dates"),
 * which reads like a fault and used to send us into a reopen/replay ladder that would have
 * republished nights over the operator's own rule. That refusal is legitimate, so it is detected
 * here BEFORE any channel call and reported in words the operator can act on.
 */

const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type Amenities = Record<string, unknown> | null | undefined;

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : null;
}

/** Internal changeover code (0..3) in force on a given date. Defaults to 3 (both allowed). */
export function changeoverCodeForDate(
  propertyAmenities: Amenities,
  unitAmenities: Amenities,
  unitId: string | null | undefined,
  dateIso: string,
): number {
  const byUnit = (propertyAmenities?.changeover_by_unit ?? null) as Record<string, unknown> | null;
  const unitOverride = unitId && byUnit && typeof byUnit === 'object' ? byUnit[unitId] : null;
  const overrideAmenities = (unitOverride && typeof unitOverride === 'object' ? unitOverride : unitAmenities) as Amenities;

  const rules = ((overrideAmenities?.changeover_rules ?? propertyAmenities?.changeover_rules) ?? null) as
    | Record<string, unknown>
    | null;
  const fallback = num(overrideAmenities?.changeover) ?? num(propertyAmenities?.changeover) ?? 3;

  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  const dayName = DOW_NAMES[dow];
  if (rules && typeof rules === 'object') {
    const byName = num(rules[dayName]);
    if (byName != null) return byName;
    const byIndex = num(rules[String(dow)]);
    if (byIndex != null) return byIndex;
  }
  return fallback;
}

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function label(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return `${WEEKDAY_LABEL[d.getUTCDay()]} ${dateIso}`;
}

/**
 * Returns a plain-language reason when the property's own changeover rules bar this stay's arrival
 * or departure day, or null when the stay is allowed.
 */
export function describeChangeoverViolation(
  propertyAmenities: Amenities,
  unitAmenities: Amenities,
  unitId: string | null | undefined,
  checkIn: string,
  checkOut: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;

  const arrivalCode = changeoverCodeForDate(propertyAmenities, unitAmenities, unitId, checkIn);
  const departureCode = changeoverCodeForDate(propertyAmenities, unitAmenities, unitId, checkOut);
  const arrivalAllowed = arrivalCode === 1 || arrivalCode === 3;
  const departureAllowed = departureCode === 2 || departureCode === 3;

  if (!arrivalAllowed && !departureAllowed) {
    return `This property does not accept arrivals on ${label(checkIn)} or departures on ${label(checkOut)}. Change the dates or relax the changeover rule for those days.`;
  }
  if (!arrivalAllowed) {
    return `This property does not accept arrivals on ${label(checkIn)}. Change the arrival date or relax the changeover rule for that day.`;
  }
  if (!departureAllowed) {
    return `This property does not accept departures on ${label(checkOut)}. Change the departure date or relax the changeover rule for that day.`;
  }
  return null;
}
