import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Multi-room bookings keep one line per unit in `rolos_booking_rooms`, while
 * `bookings.room_type_id` only carries the first line. Calendars therefore drew a
 * single bar for a three-room stay. This hook returns, per booking id, every room
 * type and unit id its lines reference so the grids can place all of them.
 *
 * Cancelled lines (one unit of a multi-unit stay dropped) are excluded so the
 * grid stops drawing them, and each line carries its own occupancy so a bar
 * shows the pax for that unit rather than the whole party.
 */
export interface BookingUnitLine {
  id: string;
  booking_id: string;
  room_id: string | null;
  room_type_id: string | null;
  adults: number;
  children: number;
  teens: number;
  infants: number;
  pets: number;
  rate_charged: number;
}

export interface BookingRoomLineIndex {
  roomTypeIdsByBooking: Map<string, string[]>;
  roomIdsByBooking: Map<string, string[]>;
  /** Active unit lines per booking, in load order. */
  linesByBooking: Map<string, BookingUnitLine[]>;
}

interface RawLine extends BookingUnitLine {
  status: string | null;
}

export function useBookingRoomLines(bookingIds: string[]): BookingRoomLineIndex {
  const key = useMemo(() => [...bookingIds].sort().join(","), [bookingIds]);

  const { data } = useQuery({
    queryKey: ["pms-booking-room-lines", key],
    queryFn: async () => {
      const rows: RawLine[] = [];
      const ids = key ? key.split(",") : [];
      // Chunked to stay inside URL length limits on wide calendar ranges.
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: page, error } = await supabase
          .from("rolos_booking_rooms")
          .select(
            "id, booking_id, room_type_id, room_id, adults, children, teens, infants, pets, rate_charged, status",
          )
          .in("booking_id", chunk);
        if (error) break; // RLS or transport hiccup — degrade to single-bar rendering.
        for (const r of (page || []) as Record<string, unknown>[]) {
          rows.push({
            id: String(r.id),
            booking_id: String(r.booking_id),
            room_id: (r.room_id as string) ?? null,
            room_type_id: (r.room_type_id as string) ?? null,
            adults: Number(r.adults ?? 0),
            children: Number(r.children ?? 0),
            teens: Number(r.teens ?? 0),
            infants: Number(r.infants ?? 0),
            pets: Number(r.pets ?? 0),
            rate_charged: Number(r.rate_charged ?? 0),
            status: (r.status as string) ?? "active",
          });
        }
      }
      return rows;
    },
    enabled: !!key,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const roomTypeIdsByBooking = new Map<string, string[]>();
    const roomIdsByBooking = new Map<string, string[]>();
    const linesByBooking = new Map<string, BookingUnitLine[]>();
    for (const row of data || []) {
      if ((row.status || "active") === "cancelled") continue;

      const lines = linesByBooking.get(row.booking_id) || [];
      const { status: _status, ...line } = row;
      lines.push(line);
      linesByBooking.set(row.booking_id, lines);

      if (row.room_type_id) {
        // Keep one entry per line (not per distinct type): three rooms of the same
        // type must still claim three units.
        const list = roomTypeIdsByBooking.get(row.booking_id) || [];
        list.push(row.room_type_id);
        roomTypeIdsByBooking.set(row.booking_id, list);
      }

      if (row.room_id) {
        const list = roomIdsByBooking.get(row.booking_id) || [];
        if (!list.includes(row.room_id)) list.push(row.room_id);
        roomIdsByBooking.set(row.booking_id, list);
      }
    }
    return { roomTypeIdsByBooking, roomIdsByBooking, linesByBooking };
  }, [data]);
}
