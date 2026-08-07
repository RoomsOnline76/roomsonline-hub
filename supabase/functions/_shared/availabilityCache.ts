// ============================================================================
// AVAILABILITY CACHE MIRROR (native ROL'OS PMS)
// ============================================================================
// rolos_inventory_calendar is the authoritative inventory surface for native
// properties. pms_availability_cache is what the booking engine, embeds and
// channel pushes actually read. Never delta-apply to the cache: derive it from
// the calendar and upsert, so blocks/pickups/bookings/cancellations can never
// drift and missing cache rows are materialised instead of silently ignored
// (a property with no cache rows would otherwise keep selling sold-out nights).
// ============================================================================

// deno-lint-ignore no-explicit-any
type Client = any;

const SOURCE = "roomsonline" as const;

export function nightsBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur < end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Mirror rolos_inventory_calendar → pms_availability_cache for one room type
 * over a date range. Returns the number of cache rows written.
 */
export async function syncAvailabilityCache(
  supabase: Client,
  propertyId: string,
  roomTypeId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const dates = nightsBetween(startDate, endDate);
  if (!dates.length) return 0;

  const { data: calendar, error } = await supabase
    .from("rolos_inventory_calendar")
    .select("date, available_units")
    .eq("property_id", propertyId)
    .eq("room_type_id", roomTypeId)
    .in("date", dates);
  if (error) {
    console.error("[availabilityCache] inventory calendar read failed", error);
    return 0;
  }
  if (!calendar?.length) return 0;

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("pms_availability_cache")
    .select("date, restrictions")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE)
    .eq("external_room_type_id", roomTypeId)
    .in("date", dates);
  const restrictionsByDate = new Map<string, unknown>(
    (existing || []).map((r: { date: string; restrictions: unknown }) => [r.date, r.restrictions]),
  );

  const rows = calendar.map((c: { date: string; available_units: number | null }) => ({
    property_id: propertyId,
    system_type: SOURCE,
    external_room_type_id: roomTypeId,
    date: c.date,
    available_units: Math.max(0, Number(c.available_units || 0)),
    restrictions: restrictionsByDate.get(c.date) ?? {},
    fetched_at: now,
    source_timestamp: now,
    updated_at: now,
  }));

  const { error: upsertErr } = await supabase
    .from("pms_availability_cache")
    .upsert(rows, {
      onConflict: "property_id,system_type,external_room_type_id,date",
      ignoreDuplicates: false,
    });
  if (upsertErr) {
    console.error("[availabilityCache] cache sync failed", upsertErr);
    return 0;
  }
  return rows.length;
}

/**
 * Adjust booked_units on the authoritative calendar then mirror to the cache.
 */
export async function applyBookedInventory(
  supabase: Client,
  propertyId: string,
  roomTypeId: string,
  startDate: string,
  endDate: string,
  delta: number,
): Promise<void> {
  const { error } = await supabase.rpc("rolos_adjust_booked_inventory", {
    _property_id: propertyId,
    _room_type_id: roomTypeId,
    _start_date: startDate,
    _end_date: endDate,
    _delta: delta,
  });
  if (error) console.warn("[availabilityCache] booked inventory adjust failed:", error.message);
  await syncAvailabilityCache(supabase, propertyId, roomTypeId, startDate, endDate);
}
