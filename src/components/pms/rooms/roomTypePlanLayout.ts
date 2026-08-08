// Free-unit maths for the ROL'OS Room Type Plan (Protel-style availability matrix).
// Pure functions only — no React, no data access.

import { differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import type { CalendarBookingRow } from "@/components/pms/bookingCalendarHelpers";

/** A reservation as loaded by the Rooms page. */
export interface RoomsBooking extends CalendarBookingRow {
  rolos_room_ids: string[] | null;
  /** Standardised ROL booking reference, e.g. ROL-WEB-B-DAS-00142. */
  rol_reference?: string | null;
  /** The channel/PMS's own reservation id, kept for reconciliation. */
  external_reservation_id?: string | null;
}


export interface PlanRoom {
  id: string;
  property_id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  max_occupancy: number | null;
  room_type_id: string | null;
  room_type_name?: string;
}

export interface PlanRoomType {
  id: string;
  name: string;
  property_id: string;
}

export const BLOCKED_ROOM_STATUSES = ["maintenance", "out_of_order", "out_of_service"];

/** Nights in a stay (checkout day itself is free). */
export function stayNights(booking: Pick<RoomsBooking, "check_in_date" | "check_out_date">): number {
  try {
    return Math.max(1, differenceInCalendarDays(parseISO(booking.check_out_date), parseISO(booking.check_in_date)));
  } catch {
    return 1;
  }
}

/** True when the reservation occupies the given night. */
export function occupiesNight(booking: Pick<RoomsBooking, "check_in_date" | "check_out_date">, date: Date): boolean {
  const day = format(date, "yyyy-MM-dd");
  const checkIn = booking.check_in_date;
  const checkOut = booking.check_out_date;
  if (!checkIn || !checkOut) return false;
  // Same-day stays still occupy their single night.
  if (checkIn === checkOut) return day === checkIn;
  return day >= checkIn && day < checkOut;
}

/** Total guests on a reservation. */
export function totalGuests(booking: RoomsBooking): number {
  return (booking.adults ?? 0) + (booking.children ?? 0) + (booking.teens ?? 0) + (booking.infants ?? 0);
}

/** Human-readable pax breakdown, e.g. "2 adults, 1 child". */
export function paxLabel(booking: RoomsBooking): string {
  const parts: string[] = [];
  const a = booking.adults ?? 0;
  if (a > 0) parts.push(`${a} adult${a === 1 ? "" : "s"}`);
  const c = booking.children ?? 0;
  if (c > 0) parts.push(`${c} child${c === 1 ? "" : "ren"}`);
  const t = booking.teens ?? 0;
  if (t > 0) parts.push(`${t} teen${t === 1 ? "" : "s"}`);
  const i = booking.infants ?? 0;
  if (i > 0) parts.push(`${i} infant${i === 1 ? "" : "s"}`);
  const p = booking.pets ?? 0;
  if (p > 0) parts.push(`${p} pet${p === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "No guest count captured";
}

export interface PlanCell {
  date: Date;
  /** Units still sellable on this night. */
  free: number;
  /** Units that exist for this type, excluding blocked rooms. */
  sellable: number;
  /** Reservations touching this night for this room type. */
  bookings: RoomsBooking[];
}

export interface PlanRow {
  roomType: PlanRoomType;
  /** Physical units configured for this room type. */
  units: number;
  /** Units withheld because the room is under maintenance / out of order. */
  blocked: number;
  cells: PlanCell[];
}

/**
 * Builds the Room Type Plan matrix: one row per room type, one cell per night.
 * Free units = sellable units − reservations occupying that night for the type.
 *
 * Room types with no physical units are skipped — they are archived / duplicate
 * leftovers rather than sellable inventory. When the property has no units at
 * all (fresh setup) every type is kept so the plan is not empty.
 */
export function buildRoomTypePlan(
  dates: Date[],
  roomTypes: PlanRoomType[],
  rooms: PlanRoom[],
  bookings: RoomsBooking[]
): PlanRow[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const hasAnyUnits = rooms.length > 0;

  const visibleTypes = hasAnyUnits
    ? roomTypes.filter((rt) => rooms.some((r) => r.room_type_id === rt.id))
    : roomTypes;

  return visibleTypes.map((roomType) => {

    const typeRooms = rooms.filter((r) => r.room_type_id === roomType.id);
    const blocked = typeRooms.filter((r) => BLOCKED_ROOM_STATUSES.includes(r.status)).length;
    const sellable = Math.max(0, typeRooms.length - blocked);
    const typeRoomIds = new Set(typeRooms.map((r) => r.id));

    const typeBookings = bookings.filter((b) => {
      if (b.status === "cancelled" || b.status === "no_show") return false;
      const assigned = (b.rolos_room_ids || []).filter((id) => typeRoomIds.has(id));
      if (assigned.length > 0) return true;
      // Unassigned reservations still consume a unit of their booked type.
      const hasKnownRoom = (b.rolos_room_ids || []).some((id) => roomById.has(id));
      return !hasKnownRoom && b.room_type_id === roomType.id;
    });

    const cells: PlanCell[] = dates.map((date) => {
      const nightBookings = typeBookings.filter((b) => occupiesNight(b, date));
      let used = 0;
      const seenRooms = new Set<string>();
      for (const b of nightBookings) {
        const assigned = (b.rolos_room_ids || []).filter((id) => typeRoomIds.has(id));
        if (assigned.length > 0) {
          for (const id of assigned) {
            if (!seenRooms.has(id)) {
              seenRooms.add(id);
              used += 1;
            }
          }
        } else {
          used += 1;
        }
      }
      return { date, free: Math.max(0, sellable - used), sellable, bookings: nightBookings };
    });

    return { roomType, units: typeRooms.length, blocked, cells };
  });
}

/** Tailwind classes for a cell based on how tight availability is. */
export function cellHeatClass(cell: PlanCell): string {
  if (cell.sellable === 0) return "bg-muted/40 text-muted-foreground";
  if (cell.free <= 0) return "bg-destructive/15 text-destructive font-semibold";
  if (cell.free === 1) return "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold";
  if (cell.free / cell.sellable <= 0.34) return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "text-foreground";
}

export interface WeekSpan {
  /** ISO week label, e.g. "Week 32". */
  label: string;
  /** Number of visible columns this week covers. */
  span: number;
}

/** Groups the visible dates into calendar-week header spans. */
export function groupIntoWeeks(dates: Date[]): WeekSpan[] {
  const spans: WeekSpan[] = [];
  let currentKey = "";
  for (const date of dates) {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const key = format(weekStart, "yyyy-ww");
    const label = `Week ${format(date, "II")}`;
    if (key !== currentKey) {
      spans.push({ label, span: 1 });
      currentKey = key;
    } else {
      spans[spans.length - 1].span += 1;
    }
  }
  return spans;
}
