import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RealtimeBookingEvent {
  bookingId: string | null;
  propertyId: string | null;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  channel: string | null;
  isNew: boolean;
}

interface Options {
  /** Properties currently in view. Empty means "listen to nothing". */
  propertyIds: string[];
  /** Called (debounced) whenever a relevant booking row changes. */
  onChange: (event: RealtimeBookingEvent | null) => void;
  enabled?: boolean;
  /** Debounce window so a burst of writes triggers a single refresh. */
  debounceMs?: number;
}

/**
 * Live booking updates for the calendars.
 *
 * Channel requests arrive through an edge function, so nothing in the browser knows a new
 * stay exists until the page is reloaded. Subscribing to the booking tables lets the grid
 * paint an incoming request the moment it lands.
 */
export function useRealtimeBookings({ propertyIds, onChange, enabled = true, debounceMs = 400 }: Options) {
  const idsKey = [...propertyIds].sort().join(",");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const ids = idsKey.split(",").filter(Boolean);
    if (!enabled || ids.length === 0) return;

    const allowed = new Set(ids);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let queued: RealtimeBookingEvent | null = null;

    const flush = () => {
      timer = null;
      const event = queued;
      queued = null;
      onChangeRef.current(event);
    };

    const schedule = (event: RealtimeBookingEvent | null) => {
      // Keep the most interesting event of the burst: a brand new stay beats an update.
      if (event && (!queued || (event.isNew && !queued.isNew))) queued = event;
      if (timer) return;
      timer = setTimeout(flush, debounceMs);
    };

    const channel = supabase
      .channel(`rolos-bookings-${ids.slice(0, 3).join("-")}-${ids.length}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const propertyId = (row.property_id as string) || null;
          if (propertyId && !allowed.has(propertyId)) return;
          schedule({
            bookingId: (row.id as string) || null,
            propertyId,
            guestName: (row.guest_name as string) || null,
            checkIn: (row.check_in_date as string) || null,
            checkOut: (row.check_out_date as string) || null,
            status: (row.status as string) || null,
            channel: (row.booking_channel as string) || null,
            isNew: payload.eventType === "INSERT",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rolos_booking_rooms" },
        () => schedule(null),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [idsKey, enabled, debounceMs]);
}

export type { RealtimeBookingEvent };
