import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  findRoomTypeClashes,
  suggestReallocations,
  type ClashBookingLike,
  type ClashRoomType,
  type ReallocationSuggestion,
  type RoomClash,
} from "@/lib/roomClashes";

interface Options {
  propertyIds: string[];
  propertyNames?: Record<string, string>;
  /** How far ahead to scan for clashes. */
  horizonDays?: number;
  enabled?: boolean;
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Forward-looking overbooking scan for a set of properties. Only future/current
 * nights matter operationally — a historic clash can no longer be re-allocated.
 */
export function usePortfolioOverbookings({
  propertyIds,
  propertyNames = {},
  horizonDays = 180,
  enabled = true,
}: Options) {
  const [bookings, setBookings] = useState<ClashBookingLike[]>([]);
  const [roomTypes, setRoomTypes] = useState<ClashRoomType[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = useMemo(() => [...propertyIds].sort().join(","), [propertyIds]);

  const load = useCallback(async () => {
    const ids = idsKey.split(",").filter(Boolean);
    if (!enabled || ids.length === 0) {
      setBookings([]);
      setRoomTypes([]);
      return;
    }
    setLoading(true);
    try {
      const from = isoDay(0);
      const to = isoDay(horizonDays);
      const [typesRes, roomsRes, bookingsRes, seasonRes] = await Promise.all([
        supabase
          .from("rolos_room_types")
          .select("id, property_id, name, max_occupancy, default_rate, is_active")
          .in("property_id", ids)
          .eq("is_active", true),
        supabase.from("rolos_rooms").select("id, property_id, room_type_id, status").in("property_id", ids),
        supabase
          .from("bookings")
          .select(
            "id, property_id, guest_name, check_in_date, check_out_date, status, room_type_id, total_price, adults, children, teens, infants"
          )
          .in("property_id", ids)
          .not("status", "in", "(cancelled,no_show)")
          .lt("check_in_date", to)
          .gt("check_out_date", from),
        supabase
          .from("rolos_rate_plan_season_rates")
          .select("room_type_id, base_rate, is_active, deleted_at")
          .in("room_type_id", []) // filled after types resolve
          .limit(1),
      ]);

      const types = typesRes.data || [];
      const rooms = (roomsRes.data || []).filter((r) => (r.status || "available") !== "out_of_service");
      const unitCount = new Map<string, number>();
      for (const room of rooms) {
        if (!room.room_type_id) continue;
        unitCount.set(room.room_type_id, (unitCount.get(room.room_type_id) || 0) + 1);
      }

      // Indicative price point per type: median active season rate, else the default rate.
      const typeIds = types.map((t) => t.id);
      const rateByType = new Map<string, number>();
      if (typeIds.length > 0) {
        const { data: seasonRates } = await supabase
          .from("rolos_rate_plan_season_rates")
          .select("room_type_id, base_rate")
          .in("room_type_id", typeIds)
          .eq("is_active", true)
          .is("deleted_at", null);
        const buckets = new Map<string, number[]>();
        for (const row of seasonRates || []) {
          if (!row.room_type_id || row.base_rate == null) continue;
          const list = buckets.get(row.room_type_id) || [];
          list.push(Number(row.base_rate));
          buckets.set(row.room_type_id, list);
        }
        for (const [id, list] of buckets) {
          list.sort((a, b) => a - b);
          rateByType.set(id, list[Math.floor(list.length / 2)]);
        }
      }
      void seasonRes;

      setRoomTypes(
        types.map((t) => ({
          id: t.id,
          property_id: t.property_id,
          name: t.name,
          units: unitCount.get(t.id) ?? 1,
          max_occupancy: t.max_occupancy,
          nightly_rate: rateByType.get(t.id) ?? (t.default_rate != null ? Number(t.default_rate) : null),
        }))
      );
      setBookings((bookingsRes.data || []) as ClashBookingLike[]);
    } finally {
      setLoading(false);
    }
  }, [idsKey, horizonDays, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const clashes: RoomClash[] = useMemo(
    () => findRoomTypeClashes(bookings, roomTypes, propertyNames),
    [bookings, roomTypes, propertyNames]
  );

  const suggestFor = useCallback(
    (booking: ClashBookingLike): ReallocationSuggestion[] => suggestReallocations(booking, bookings, roomTypes),
    [bookings, roomTypes]
  );

  return { clashes, loading, suggestFor, refresh: load, roomTypes };
}
