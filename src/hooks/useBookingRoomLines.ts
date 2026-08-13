import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Multi-room bookings keep one line per unit in `rolos_booking_rooms`, while
 * `bookings.room_type_id` only carries the first line. Calendars therefore drew a
 * single bar for a three-room stay. This hook returns, per booking id, every room
 * type and unit id its lines reference so the grids can place all of them.
 */
export interface BookingRoomLineIndex {
  roomTypeIdsByBooking: Map<string, string[]>;
  roomIdsByBooking: Map<string, string[]>;
}

export function useBookingRoomLines(bookingIds: string[]): BookingRoomLineIndex {
  const key = useMemo(() => [...bookingIds].sort().join(","), [bookingIds]);

  const { data } = useQuery({
    queryKey: ["pms-booking-room-lines", key],
    queryFn: async () => {
      const rows: { booking_id: string; room_type_id: string | null; room_id: string | null }[] = [];
      const ids = key ? key.split(",") : [];
      // Chunked to stay inside URL length limits on wide calendar ranges.
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: page, error } = await supabase
          .from("rolos_booking_rooms")
          .select("booking_id, room_type_id, room_id")
          .in("booking_id", chunk);
        if (error) break; // RLS or transport hiccup — degrade to single-bar rendering.
        rows.push(...((page || []) as typeof rows));
      }
      return rows;
    },
    enabled: !!key,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const roomTypeIdsByBooking = new Map<string, string[]>();
    const roomIdsByBooking = new Map<string, string[]>();
    for (const row of data || []) {
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
    return { roomTypeIdsByBooking, roomIdsByBooking };
  }, [data]);
}
