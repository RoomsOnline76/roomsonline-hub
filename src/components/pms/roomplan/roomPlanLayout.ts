// Layout maths for the ROL'OS Room Plan timeline (Protel-style room plan).
// Pure functions only — no React, no data access.

import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const ROOM_PLAN_COL_W = 44;
export const ROOM_PLAN_COL_W_COMPACT = 34;
export const ROOM_PLAN_ROW_H = 26;
export const ROOM_PLAN_LABEL_W = 150;

export interface RoomPlanBookingLike {
  id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  rolos_room_ids?: string[] | null;
  room_type_id?: string | null;
}

export interface BarGeometry {
  /** Column index (0-based) where the bar starts within the visible window. */
  startCol: number;
  /** Number of visible night columns the bar covers. */
  cols: number;
  /** True when the stay begins before the visible window. */
  clippedStart: boolean;
  /** True when the stay ends after the visible window. */
  clippedEnd: boolean;
}

/** Nights between check-in and check-out. */
export function bookingNights(booking: RoomPlanBookingLike): number {
  try {
    return Math.max(1, differenceInCalendarDays(parseISO(booking.check_out_date), parseISO(booking.check_in_date)));
  } catch {
    return 1;
  }
}

/**
 * Geometry for a stay inside a visible (contiguous) date window.
 * Returns null when the stay does not overlap the window at all.
 */
export function getBarGeometry(booking: RoomPlanBookingLike, dates: Date[]): BarGeometry | null {
  if (dates.length === 0) return null;
  const windowStart = dates[0];
  const windowEnd = dates[dates.length - 1];
  let checkIn: Date;
  let checkOut: Date;
  try {
    checkIn = parseISO(booking.check_in_date);
    checkOut = parseISO(booking.check_out_date);
  } catch {
    return null;
  }
  // A stay occupies the nights [checkIn, checkOut) — the checkout day itself is free.
  const lastNight = differenceInCalendarDays(checkOut, checkIn) <= 0 ? checkIn : new Date(checkOut.getTime() - 86400000);
  if (lastNight < windowStart || checkIn > windowEnd) return null;

  const rawStart = differenceInCalendarDays(checkIn, windowStart);
  const rawLastNight = differenceInCalendarDays(lastNight, windowStart);
  const startCol = Math.max(0, rawStart);
  const endCol = Math.min(dates.length - 1, rawLastNight);
  return {
    startCol,
    cols: Math.max(1, endCol - startCol + 1),
    clippedStart: rawStart < 0,
    clippedEnd: rawLastNight > dates.length - 1,
  };
}

/** Overlap lanes so two stays in the same row never cover each other. */
export function assignLanes<T extends RoomPlanBookingLike>(bookings: T[], dates: Date[]): Array<{ booking: T; lane: number; geometry: BarGeometry }> {
  const placed: Array<{ booking: T; lane: number; geometry: BarGeometry }> = [];
  const laneEnds: number[] = [];
  const sorted = [...bookings].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
  for (const booking of sorted) {
    const geometry = getBarGeometry(booking, dates);
    if (!geometry) continue;
    let lane = laneEnds.findIndex((end) => end <= geometry.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = geometry.startCol + geometry.cols;
    placed.push({ booking, lane, geometry });
  }
  return placed;
}

/** Solid bar colours, keyed on booking status. */
export const ROOM_PLAN_BAR_COLORS: Record<string, string> = {
  confirmed: "bg-blue-600 text-white border-blue-700 hover:bg-blue-500",
  pending: "bg-amber-500 text-white border-amber-600 hover:bg-amber-400",
  checked_in: "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-500",
  checked_out: "bg-slate-500 text-white border-slate-600 hover:bg-slate-400",
  cancelled: "bg-red-600/70 text-white border-red-700 line-through hover:bg-red-500/70",
  no_show: "bg-rose-600 text-white border-rose-700 hover:bg-rose-500",
};

export function getBarColor(status: string): string {
  return ROOM_PLAN_BAR_COLORS[status] || ROOM_PLAN_BAR_COLORS.pending;
}

/** A stay can only be dragged while it is still live and unfinished. */
export function isBookingDraggable(booking: RoomPlanBookingLike): boolean {
  return !["cancelled", "checked_out", "no_show"].includes(booking.status);
}

export const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
