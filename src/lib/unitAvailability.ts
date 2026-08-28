/**
 * Unit availability resolver — the single source the booking dialogs use to decide
 * which nights can be sold.
 *
 * A night is unsellable for a unit when:
 *   • another live reservation already holds that physical unit, or
 *   • every unit of the room type is taken (demand >= sellable units), or
 *   • the night is stopped/blocked in `property_availability` (maintenance, owner
 *     block, channel stop-sell).
 *
 * `property_availability.room_type` holds a mix of room-type UUIDs and plain room
 * type names in live data, so blocks are matched on both forms — matching on one
 * alone silently loses half the blocks.
 */

import { supabase } from "@/integrations/supabase/client";
import { isBookingOccupancyRow } from "@/lib/blockAttribution";

const DEAD_BOOKING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "no_show",
  "declined",
  "rejected",
  "expired",
]);

export const isLiveBookingStatus = (status: string | null | undefined): boolean =>
  !DEAD_BOOKING_STATUSES.has(String(status ?? "").toLowerCase());

export const isoDay = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const isoToDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const addIso = (iso: string, days = 1): string => {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};

/** Every night a stay occupies — the departure day is not a night. */
export const nightsInRange = (checkIn: string, checkOut: string): string[] => {
  const out: string[] = [];
  let cursor = checkIn;
  let guard = 0;
  while (cursor < checkOut && guard < 800) {
    out.push(cursor);
    cursor = addIso(cursor);
    guard += 1;
  }
  return out;
};

export interface BlockedNight {
  iso: string;
  /** Human reason shown on hover / in the refusal toast. */
  reason: string;
  kind: "booked" | "block" | "sold_out";
}

export interface UnitAvailability {
  /** roomId -> iso night -> reason it is held. */
  unitNights: Map<string, Map<string, BlockedNight>>;
  /** roomTypeId -> iso night -> number of live stays covering it. */
  typeDemand: Map<string, Map<string, number>>;
  /** roomTypeId -> sellable unit count. */
  unitsPerType: Map<string, number>;
  /** roomTypeId -> sleeping capacity (null when not stated). */
  capacity: Map<string, number | null>;
  /** roomTypeId -> iso night -> operator/channel block. */
  typeBlocks: Map<string, Map<string, BlockedNight>>;
  roomTypeNames: Map<string, string>;
}

export const emptyUnitAvailability = (): UnitAvailability => ({
  unitNights: new Map(),
  typeDemand: new Map(),
  unitsPerType: new Map(),
  capacity: new Map(),
  typeBlocks: new Map(),
  roomTypeNames: new Map(),
});

interface FetchOptions {
  /** Window to load, defaults to today − 30 days through today + 540 days. */
  from?: string;
  to?: string;
  /** The stay being edited — its own nights must stay selectable. */
  excludeBookingId?: string | null;
}

export async function fetchUnitAvailability(
  propertyId: string,
  options: FetchOptions = {},
): Promise<UnitAvailability> {
  const snapshot = emptyUnitAvailability();
  if (!propertyId) return snapshot;

  const today = isoDay(new Date());
  const from = options.from ?? addIso(today, -30);
  const to = options.to ?? addIso(today, 540);

  const [typesRes, roomsRes, bookingsRes, availRes] = await Promise.all([
    supabase
      .from("rolos_room_types")
      .select("id, name, max_occupancy")
      .eq("property_id", propertyId),
    supabase
      .from("rolos_rooms")
      .select("id, room_type_id, status")
      .eq("property_id", propertyId),
    supabase
      .from("bookings")
      .select("id, guest_name, check_in_date, check_out_date, status")
      .eq("property_id", propertyId)
      .lt("check_in_date", to)
      .gt("check_out_date", from),
    supabase
      .from("property_availability")
      .select("room_type, date, is_stop_sell, available_units, blocked_reason, blocked_by, blocked_by_label, external_system")
      .eq("property_id", propertyId)
      .gte("date", from)
      .lte("date", to),
  ]);

  const nameToTypeId = new Map<string, string>();
  for (const t of typesRes.data ?? []) {
    snapshot.capacity.set(t.id, t.max_occupancy ?? null);
    snapshot.roomTypeNames.set(t.id, t.name ?? "");
    if (t.name) nameToTypeId.set(String(t.name).trim().toLowerCase(), t.id);
  }

  for (const r of roomsRes.data ?? []) {
    if (!r.room_type_id) continue;
    if ((r.status ?? "available") === "out_of_service") continue;
    snapshot.unitsPerType.set(r.room_type_id, (snapshot.unitsPerType.get(r.room_type_id) ?? 0) + 1);
  }

  const liveBookings = (bookingsRes.data ?? []).filter(
    (b) => isLiveBookingStatus(b.status) && b.id !== options.excludeBookingId,
  );

  if (liveBookings.length > 0) {
    const { data: lines } = await supabase
      .from("rolos_booking_rooms")
      .select("booking_id, room_id, room_type_id, status")
      .in("booking_id", liveBookings.map((b) => b.id));

    const bookingById = new Map(liveBookings.map((b) => [b.id, b]));

    for (const line of lines ?? []) {
      if ((line.status ?? "active") === "cancelled") continue;
      const booking = bookingById.get(line.booking_id);
      if (!booking?.check_in_date || !booking?.check_out_date) continue;
      const nights = nightsInRange(booking.check_in_date, booking.check_out_date);
      const label = booking.guest_name || "another reservation";

      if (line.room_id) {
        let byNight = snapshot.unitNights.get(line.room_id);
        if (!byNight) {
          byNight = new Map();
          snapshot.unitNights.set(line.room_id, byNight);
        }
        for (const n of nights) {
          byNight.set(n, { iso: n, reason: `${label} — booked`, kind: "booked" });
        }
      }

      if (line.room_type_id) {
        let byNight = snapshot.typeDemand.get(line.room_type_id);
        if (!byNight) {
          byNight = new Map();
          snapshot.typeDemand.set(line.room_type_id, byNight);
        }
        for (const n of nights) byNight.set(n, (byNight.get(n) ?? 0) + 1);
      }
    }
  }

  const ownBlockTags = options.excludeBookingId
    ? [
        `channel_booking:${options.excludeBookingId}`,
        `booking:${options.excludeBookingId}`,
        options.excludeBookingId,
      ]
    : [];

  for (const row of availRes.data ?? []) {
    const key = String(row.room_type ?? "").trim();
    if (!key || !row.date) continue;
    const typeId = snapshot.capacity.has(key) ? key : nameToTypeId.get(key.toLowerCase());
    if (!typeId) continue;
    const stopped = row.is_stop_sell === true || Number(row.available_units ?? 1) === 0;
    if (!stopped) continue;
    // Booking side-effect rows are not property blocks — occupancy comes from the
    // bookings themselves, so these would double-count (and outlive cancellations).
    if (isBookingOccupancyRow(row.external_system, row.blocked_reason, row.blocked_by)) continue;
    // The stay being edited holds its own nights via a channel block — those
    // must stay selectable, otherwise extending it looks like an overbooking.
    const reason = String(row.blocked_reason ?? "");
    if (ownBlockTags.some((tag) => reason.includes(tag))) continue;

    let byNight = snapshot.typeBlocks.get(typeId);
    if (!byNight) {
      byNight = new Map();
      snapshot.typeBlocks.set(typeId, byNight);
    }
    byNight.set(row.date, {
      iso: row.date,
      reason: row.blocked_reason || row.blocked_by_label || "Blocked by the property",
      kind: "block",
    });
  }

  return snapshot;
}

/**
 * Nights that cannot be sold for a specific unit (or, when no unit is chosen,
 * for the room type as a whole).
 */
export function blockedNightsFor(
  snapshot: UnitAvailability,
  roomTypeId: string | null | undefined,
  roomId?: string | null,
): Map<string, BlockedNight> {
  const out = new Map<string, BlockedNight>();
  if (roomId) {
    for (const [iso, info] of snapshot.unitNights.get(roomId) ?? []) out.set(iso, info);
  }
  if (roomTypeId) {
    for (const [iso, info] of snapshot.typeBlocks.get(roomTypeId) ?? []) {
      if (!out.has(iso)) out.set(iso, info);
    }
    if (!roomId) {
      // No specific unit: a night is only closed once every unit of the type is gone.
      const units = snapshot.unitsPerType.get(roomTypeId) ?? 0;
      const demand = snapshot.typeDemand.get(roomTypeId);
      if (units > 0 && demand) {
        const typeName = snapshot.roomTypeNames.get(roomTypeId) || "This room type";
        for (const [iso, count] of demand) {
          if (count >= units && !out.has(iso)) {
            out.set(iso, {
              iso,
              reason: `${typeName} — all ${units} unit${units === 1 ? "" : "s"} taken`,
              kind: "sold_out",
            });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Days react-day-picker should refuse outright. A night that is the *first* held
 * night stays clickable so a departure can land on it (back-to-back stays);
 * `findBlockedInRange` then refuses it as an arrival.
 */
export function disabledDaysFrom(blocked: Map<string, BlockedNight>): Date[] {
  const out: Date[] = [];
  for (const iso of blocked.keys()) {
    if (blocked.has(addIso(iso, -1))) out.push(isoToDate(iso));
  }
  return out;
}

/** Every held night as a Date, for the calendar's visual "blocked" modifier. */
export function blockedDaysFrom(blocked: Map<string, BlockedNight>): Date[] {
  return [...blocked.keys()].map(isoToDate);
}

/** The first held night inside a proposed stay, or null when the stay is clean. */
export function findBlockedInRange(
  blocked: Map<string, BlockedNight>,
  checkIn: string,
  checkOut: string,
): BlockedNight | null {
  for (const night of nightsInRange(checkIn, checkOut)) {
    const hit = blocked.get(night);
    if (hit) return hit;
  }
  return null;
}

/** Roles allowed to knowingly overbook. */
export function canOverbook(role: string | null | undefined): boolean {
  return ["owner", "admin", "dev", "fearless_leader"].includes(String(role ?? ""));
}
