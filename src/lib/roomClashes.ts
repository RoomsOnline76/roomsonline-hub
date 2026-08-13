/**
 * Overbooking (clash) detection shared by the Rooms grid and the Command Centre.
 *
 * A clash is not "two stays touch the same room type" — properties legitimately sell
 * several units of one type. A clash is when the number of stays covering a night is
 * greater than the number of sellable units of that type, which means one guest has
 * nowhere to sleep. Detection therefore always works off a unit count, never off
 * booking overlap alone.
 */

export interface ClashBookingLike {
  id: string;
  property_id: string | null;
  guest_name: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string | null;
  room_type_id: string | null;
  total_price?: number | null;
  adults?: number | null;
  children?: number | null;
  teens?: number | null;
  infants?: number | null;
}

export interface ClashRoomType {
  id: string;
  property_id: string;
  name: string;
  /** Sellable physical units of this type. */
  units: number;
  max_occupancy?: number | null;
  /** Indicative nightly price used to rank re-allocation suggestions. */
  nightly_rate?: number | null;
}

export interface RoomClash {
  key: string;
  propertyId: string;
  propertyName: string;
  roomTypeId: string;
  roomTypeName: string;
  units: number;
  /** First and last (exclusive) night of the contiguous oversold stretch. */
  start: string;
  end: string;
  nights: number;
  /** Worst simultaneous demand across the stretch. */
  peakDemand: number;
  bookings: ClashBookingLike[];
}

export interface ReallocationSuggestion {
  roomTypeId: string;
  roomTypeName: string;
  units: number;
  freeUnits: number;
  nightlyRate: number | null;
  /** Difference against the clashing stay's own room type rate, per night. */
  rateDelta: number | null;
  fitsParty: boolean;
  maxOccupancy: number | null;
}

const LIVE_EXCLUDED = new Set(["cancelled", "no_show"]);

export function isLiveStay(status: string | null | undefined): boolean {
  return !LIVE_EXCLUDED.has((status || "").toLowerCase());
}

function addDay(iso: string, days = 1): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every night a stay occupies — check-out night excluded. */
export function stayNights(booking: ClashBookingLike): string[] {
  const nights: string[] = [];
  let cursor = booking.check_in_date;
  let guard = 0;
  while (cursor < booking.check_out_date && guard < 400) {
    nights.push(cursor);
    cursor = addDay(cursor);
    guard += 1;
  }
  return nights;
}

export function partySize(booking: ClashBookingLike): number {
  return (booking.adults || 0) + (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0);
}

/**
 * Nights where demand for a room type exceeds its unit count, grouped into
 * contiguous stretches so the UI shows "13–15 Aug" rather than three rows.
 */
export function findRoomTypeClashes(
  bookings: ClashBookingLike[],
  roomTypes: ClashRoomType[],
  propertyNames: Record<string, string> = {}
): RoomClash[] {
  const typeById = new Map(roomTypes.map((t) => [t.id, t]));
  const demand = new Map<string, Map<string, ClashBookingLike[]>>();

  for (const booking of bookings) {
    if (!booking.room_type_id || !isLiveStay(booking.status)) continue;
    if (!typeById.has(booking.room_type_id)) continue;
    let byNight = demand.get(booking.room_type_id);
    if (!byNight) {
      byNight = new Map();
      demand.set(booking.room_type_id, byNight);
    }
    for (const night of stayNights(booking)) {
      const list = byNight.get(night) || [];
      list.push(booking);
      byNight.set(night, list);
    }
  }

  const clashes: RoomClash[] = [];
  for (const [roomTypeId, byNight] of demand) {
    const type = typeById.get(roomTypeId)!;
    const units = Math.max(type.units, 0);
    const oversold = [...byNight.entries()]
      .filter(([, list]) => list.length > units)
      .sort(([a], [b]) => a.localeCompare(b));
    if (oversold.length === 0) continue;

    let runStart = oversold[0][0];
    let runEnd = oversold[0][0];
    let runBookings = new Map<string, ClashBookingLike>();
    let peak = 0;

    const flush = () => {
      clashes.push({
        key: `${roomTypeId}:${runStart}`,
        propertyId: type.property_id,
        propertyName: propertyNames[type.property_id] || "",
        roomTypeId,
        roomTypeName: type.name,
        units,
        start: runStart,
        end: addDay(runEnd),
        nights: stayNights({
          id: "",
          property_id: null,
          guest_name: null,
          status: null,
          room_type_id: null,
          check_in_date: runStart,
          check_out_date: addDay(runEnd),
        }).length,
        peakDemand: peak,
        bookings: [...runBookings.values()].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date)),
      });
    };

    for (const [night, list] of oversold) {
      if (runBookings.size > 0 && night !== addDay(runEnd)) {
        flush();
        runStart = night;
        runBookings = new Map();
        peak = 0;
      }
      runEnd = night;
      peak = Math.max(peak, list.length);
      for (const b of list) runBookings.set(b.id, b);
    }
    if (runBookings.size > 0) flush();
  }

  return clashes.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Alternative room types in the same property that are free for the whole stay,
 * ranked by how close their price point is to the original type.
 */
export function suggestReallocations(
  booking: ClashBookingLike,
  allBookings: ClashBookingLike[],
  roomTypes: ClashRoomType[],
  options: { limit?: number } = {}
): ReallocationSuggestion[] {
  const nights = stayNights(booking);
  if (nights.length === 0) return [];
  const ownType = roomTypes.find((t) => t.id === booking.room_type_id);
  const ownRate = ownType?.nightly_rate ?? null;
  const guests = partySize(booking);

  const candidates = roomTypes.filter(
    (t) => t.property_id === booking.property_id && t.id !== booking.room_type_id && t.units > 0
  );

  const suggestions: ReallocationSuggestion[] = [];
  for (const type of candidates) {
    let worstFree = type.units;
    for (const night of nights) {
      const taken = allBookings.filter(
        (other) =>
          other.id !== booking.id &&
          other.room_type_id === type.id &&
          isLiveStay(other.status) &&
          night >= other.check_in_date &&
          night < other.check_out_date
      ).length;
      worstFree = Math.min(worstFree, type.units - taken);
      if (worstFree <= 0) break;
    }
    if (worstFree <= 0) continue;
    suggestions.push({
      roomTypeId: type.id,
      roomTypeName: type.name,
      units: type.units,
      freeUnits: worstFree,
      nightlyRate: type.nightly_rate ?? null,
      rateDelta: type.nightly_rate != null && ownRate != null ? type.nightly_rate - ownRate : null,
      fitsParty: type.max_occupancy == null || guests === 0 || guests <= type.max_occupancy,
      maxOccupancy: type.max_occupancy ?? null,
    });
  }

  return suggestions
    .sort((a, b) => {
      if (a.fitsParty !== b.fitsParty) return a.fitsParty ? -1 : 1;
      const da = a.rateDelta == null ? Number.MAX_SAFE_INTEGER : Math.abs(a.rateDelta);
      const db = b.rateDelta == null ? Number.MAX_SAFE_INTEGER : Math.abs(b.rateDelta);
      return da - db;
    })
    .slice(0, options.limit ?? 3);
}
