// Unit-level (physical room) status colours and per-night lines for the Room Type Plan.
// Pure helpers — no React, no data access.

import { occupiesNight, type PlanRoom, type RoomsBooking } from "./roomTypePlanLayout";

export interface RoomStatusMeta {
  label: string;
  /** Solid swatch — legend dots and status strips. */
  dot: string;
  /** Tinted background for a night cell in this state. */
  cell: string;
  /** Badge / chip classes. */
  chip: string;
}

/** Selectable housekeeping / engineering states for a physical room. */
export const ROOM_STATUS_META: Record<string, RoomStatusMeta> = {
  available: {
    label: "Available",
    dot: "bg-emerald-500",
    cell: "bg-emerald-500/10",
    chip: "bg-emerald-500/10 text-success border-emerald-500/20",
  },
  occupied: {
    label: "Occupied",
    dot: "bg-blue-500",
    cell: "bg-blue-500/25 text-info",
    chip: "bg-blue-500/10 text-info border-blue-500/20",
  },
  dirty: {
    label: "Dirty",
    dot: "bg-amber-500",
    cell: "bg-amber-500/20",
    chip: "bg-amber-500/10 text-warning border-amber-500/20",
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-red-500",
    cell: "bg-red-500/20",
    chip: "bg-red-500/10 text-destructive border-red-500/20",
  },
  out_of_order: {
    label: "Out of order",
    dot: "bg-destructive",
    cell: "bg-destructive/25",
    chip: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

/** Statuses an operator can pick in a room line. */
export const SELECTABLE_ROOM_STATUSES = Object.keys(ROOM_STATUS_META);

export function statusMeta(status: string): RoomStatusMeta {
  return (
    ROOM_STATUS_META[status] || {
      label: status.replace(/_/g, " "),
      dot: "bg-muted",
      cell: "bg-muted/30",
      chip: "",
    }
  );
}

export interface UnitCell {
  date: Date;
  /** Reservation occupying this unit on this night, if any. */
  booking: RoomsBooking | null;
  /** First night of the stay inside the visible window — used for the label. */
  isStart: boolean;
}

export interface UnitRow {
  room: PlanRoom;
  /** Status shown in the UI (occupied wins over available when a stay is in-house today). */
  displayStatus: string;
  cells: UnitCell[];
}

/** Builds one line per physical room with its per-night reservation strip. */
export function buildUnitRows(
  dates: Date[],
  rooms: PlanRoom[],
  bookings: RoomsBooking[],
  displayStatusFor: (room: PlanRoom) => string
): UnitRow[] {
  const live = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");

  return [...rooms]
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    .map((room) => {
      const roomBookings = live.filter((b) => (b.rolos_room_ids || []).includes(room.id));
      let previousId: string | null = null;
      const cells: UnitCell[] = dates.map((date) => {
        const booking = roomBookings.find((b) => occupiesNight(b, date)) || null;
        const isStart = !!booking && booking.id !== previousId;
        previousId = booking?.id ?? null;
        return { date, booking, isStart };
      });
      return { room, displayStatus: displayStatusFor(room), cells };
    });
}
