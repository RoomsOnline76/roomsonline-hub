/**
 * System-wide live ARI (Availability, Rates, Inventory) resolver
 * Works for any PMS-backed property in a portfolio context.
 */
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";

export interface LiveRoomRate {
  roomTypeId: string;
  roomName: string;
  minRate: number | null;
  available: boolean;
}

export interface LivePropertyRates {
  propertyId: string;
  rooms: LiveRoomRate[];
  lowestRate: number | null;
  fetched: boolean;
}

// Short client-side TTL cache (5 min)
const rateCache = new Map<string, { data: LivePropertyRates; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(propertyId: string, checkIn: string, checkOut: string) {
  return `${propertyId}:${checkIn}:${checkOut}`;
}

/**
 * Fetch live ARI for a single property using its PMS adapter via the
 * roomsonline-pms-api edge function.
 */
export async function fetchLiveRates(
  propertyId: string,
  externalSystem: string | null,
  checkIn?: string,
  checkOut?: string,
): Promise<LivePropertyRates> {
  const ci = checkIn || format(new Date(), "yyyy-MM-dd");
  const co = checkOut || format(addDays(new Date(), 2), "yyyy-MM-dd");

  const cacheKey = getCacheKey(propertyId, ci, co);
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const empty: LivePropertyRates = { propertyId, rooms: [], lowestRate: null, fetched: true };

  // Only attempt live fetch for PMS-backed properties
  if (!externalSystem || externalSystem === "manual" || externalSystem === "roomsonline") {
    rateCache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }

  try {
    const { data, error } = await supabase.functions.invoke("roomsonline-pms-api", {
      body: {
        action: "get_availability",
        property_id: propertyId,
        start_date: ci,
        end_date: co,
      },
    });

    if (error || !data?.success) {
      rateCache.set(cacheKey, { data: empty, ts: Date.now() });
      return empty;
    }

    const roomTypes = data.data?.room_types || data.data?.roomTypes || [];
    const rooms: LiveRoomRate[] = [];
    let lowestRate: number | null = null;

    for (const rt of roomTypes) {
      const id = rt.room_type_id || rt.roomTypeId || rt.id || "";
      const name = rt.room_type_name || rt.roomTypeName || rt.name || "";
      const rateTypes = rt.rate_types || rt.rateTypes || [];

      let minRate: number | null = null;
      let hasAvailability = false;

      // Check availability days
      const avail = rt.rooms_available_per_night || rt.roomsAvailablePerNight || [];
      for (const day of avail) {
        const units = day.available_units ?? day.numberOfRoomsAvailable ?? 0;
        const stopSell = day.stop_sell ?? day.stopSell ?? day.isClosed ?? false;
        if (units > 0 && !stopSell) hasAvailability = true;
      }

      // Extract rates
      for (const rateType of rateTypes) {
        const rates = rateType.rates || [];
        for (const r of rates) {
          const amt = r.room_amount ?? r.roomAmount ?? 0;
          if (amt > 0 && (minRate === null || amt < minRate)) {
            minRate = amt;
          }
        }
      }

      rooms.push({ roomTypeId: String(id), roomName: name, minRate, available: hasAvailability });
      if (minRate !== null && (lowestRate === null || minRate < lowestRate)) {
        lowestRate = minRate;
      }
    }

    const result: LivePropertyRates = { propertyId, rooms, lowestRate, fetched: true };
    rateCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    rateCache.set(cacheKey, { data: empty, ts: Date.now() });
    return empty;
  }
}

/**
 * Fetch live rates for multiple properties in parallel (non-blocking per property).
 * Returns a map of propertyId → LivePropertyRates.
 */
export async function fetchLiveRatesBatch(
  properties: Array<{ id: string; external_system: string | null }>,
  checkIn?: string,
  checkOut?: string,
): Promise<Record<string, LivePropertyRates>> {
  const results: Record<string, LivePropertyRates> = {};
  
  const promises = properties.map(async (p) => {
    try {
      const r = await fetchLiveRates(p.id, p.external_system, checkIn, checkOut);
      results[p.id] = r;
    } catch {
      results[p.id] = { propertyId: p.id, rooms: [], lowestRate: null, fetched: true };
    }
  });

  await Promise.allSettled(promises);
  return results;
}
