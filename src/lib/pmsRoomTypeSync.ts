import { supabase } from "@/integrations/supabase/client";

interface PropertyAmenities {
  room_types?: Array<{
    id?: string;
    name?: string;
    description?: string | null;
    maxPeople?: number;
    max_guests?: number;
    max_adults?: number;
    baseRate?: number;
    base_rate?: number;
  }>;
}

interface OverviewRoomType {
  id: string;
  name: string;
  description: string | null;
  max_guests: number;
  daily_rate: number | null;
  source: "amenities" | "hostfully";
}

interface ExistingRolosRoomType {
  id: string;
  name: string;
  description: string | null;
  max_occupancy: number | null;
  default_rate: number | null;
  is_active: boolean | null;
  linked_overview_id: string | null;
}

const normalizeRoomTypeName = (value: string) => value.trim().toLowerCase();

export interface RoomTypeSyncResult {
  inserted: number;
  updated: number;
  reactivated: number;
  retired: number;
  skipped?: "no_write_access";
}

const NO_WRITE_ACCESS_RESULT: RoomTypeSyncResult = {
  inserted: 0,
  updated: 0,
  reactivated: 0,
  retired: 0,
  skipped: "no_write_access",
};

/**
 * Row-level security refusal — the signed-in user can view the property but is
 * not an owner/linked owner/admin, so seeding room types is not their job.
 */
const isWriteDenied = (error: { code?: string; message?: string } | null) =>
  error?.code === "42501" ||
  /row-level security/i.test(error?.message ?? "");


const toAmenitiesRoomTypes = (amenities: PropertyAmenities | null): OverviewRoomType[] => {
  if (!Array.isArray(amenities?.room_types)) return [];

  return amenities.room_types
    .filter((roomType) => roomType?.name)
    .map((roomType, index) => ({
      id: `amenity-${roomType.id || index}`,
      name: String(roomType.name),
      description: roomType.description || null,
      max_guests: Number(roomType.maxPeople ?? roomType.max_guests ?? roomType.max_adults ?? 2) || 2,
      daily_rate: roomType.baseRate ?? roomType.base_rate ?? null,
      source: "amenities" as const,
    }));
};

const toHostfullyRoomTypes = (hostfullyTypes: Array<any> | null): OverviewRoomType[] => {
  return (hostfullyTypes || [])
    .filter((roomType) => roomType.is_active !== false)
    .map((roomType) => ({
      id: roomType.id,
      name: roomType.name,
      description: roomType.description || null,
      max_guests: Number(roomType.max_guests ?? 2) || 2,
      daily_rate: roomType.daily_rate ?? null,
      source: "hostfully" as const,
    }));
};

const needsSyncUpdate = (
  existing: ExistingRolosRoomType,
  desired: Omit<ExistingRolosRoomType, "id">
) => {
  return (
    existing.name !== desired.name ||
    (existing.description ?? null) !== desired.description ||
    Number(existing.max_occupancy ?? 2) !== desired.max_occupancy ||
    (existing.default_rate ?? null) !== desired.default_rate ||
    (existing.is_active ?? false) !== desired.is_active ||
    (existing.linked_overview_id ?? null) !== desired.linked_overview_id
  );
};

export async function syncRolosRoomTypesFromOverview(propertyId: string) {
  const [{ data: property, error: propertyError }, { data: hostfullyTypes, error: hostfullyError }] = await Promise.all([
    supabase.from("properties").select("is_rol_property, amenities").eq("id", propertyId).single(),
    supabase
      .from("hostfully_room_types")
      .select("id, name, description, max_guests, daily_rate, is_active")
      .eq("property_id", propertyId),
  ]);

  if (propertyError) throw propertyError;
  if (hostfullyError) {
    console.warn("[pmsRoomTypeSync] Failed to fetch hostfully_room_types:", hostfullyError);
  }

  const amenitiesRoomTypes = toAmenitiesRoomTypes((property?.amenities as PropertyAmenities | null) || null);
  const hostfullyRoomTypes = toHostfullyRoomTypes(hostfullyTypes as Array<any> | null);
  const overviewTypes = property?.is_rol_property && amenitiesRoomTypes.length > 0
    ? amenitiesRoomTypes
    : hostfullyRoomTypes;

  if (overviewTypes.length === 0) {
    return { inserted: 0, updated: 0, reactivated: 0, retired: 0 };
  }

  const { data: existingRolos, error: existingError } = await supabase
    .from("rolos_room_types")
    .select("id, name, description, max_occupancy, default_rate, is_active, linked_overview_id")
    .eq("property_id", propertyId);

  if (existingError) throw existingError;

  const existingRows = (existingRolos || []) as ExistingRolosRoomType[];
  const updates: Array<{ id: string } & Omit<ExistingRolosRoomType, "id">> = [];
  const inserts: Array<Omit<ExistingRolosRoomType, "id"> & { property_id: string }> = [];
  let reactivated = 0;
  const matchedIds = new Set<string>();


  for (const overviewType of overviewTypes) {
    const desired = {
      name: overviewType.name,
      description: overviewType.description,
      max_occupancy: overviewType.max_guests || 2,
      default_rate: overviewType.daily_rate ?? null,
      is_active: true,
      linked_overview_id: overviewType.source === "hostfully" ? overviewType.id : null,
    };

    const normalizedName = normalizeRoomTypeName(overviewType.name);
    const linkedMatch = desired.linked_overview_id
      ? existingRows.find((row) => row.linked_overview_id === desired.linked_overview_id)
      : undefined;
    const activeNameMatch = existingRows.find(
      (row) => row.is_active === true && normalizeRoomTypeName(row.name) === normalizedName
    );
    const anyNameMatch = existingRows.find((row) => normalizeRoomTypeName(row.name) === normalizedName);
    const match = linkedMatch || activeNameMatch || anyNameMatch;

    if (match) {
      matchedIds.add(match.id);
      if (needsSyncUpdate(match, desired)) {
        updates.push({ id: match.id, ...desired });
        if (match.is_active !== true) {
          reactivated += 1;
        }
      }
      continue;
    }


    inserts.push({ property_id: propertyId, ...desired });
  }

  if (updates.length > 0) {
    const updateResults = await Promise.all(
      updates.map(({ id, ...payload }) =>
        supabase
          .from("rolos_room_types")
          .update(payload)
          .eq("id", id)
      )
    );

    const firstError = updateResults.find((result) => result.error)?.error;
    if (firstError) {
      // Read-only viewers (staff, agencies) legitimately lack write access to
      // rolos_room_types. Treat the RLS refusal as a no-op instead of an error.
      if (isWriteDenied(firstError)) return { ...NO_WRITE_ACCESS_RESULT };
      throw firstError;
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("rolos_room_types").insert(inserts);
    if (insertError) {
      if (isWriteDenied(insertError)) return { ...NO_WRITE_ACCESS_RESULT };
      throw insertError;
    }
  }


  // Retire stale room types: active records that no longer match the Property
  // Overview list and carry no physical units or bookings. Prevents archived /
  // duplicate rows from cluttering the Room Type Plan.
  const staleCandidates = existingRows.filter(
    (row) => row.is_active === true && !matchedIds.has(row.id)
  );
  let retired = 0;

  if (staleCandidates.length > 0) {
    const candidateIds = staleCandidates.map((row) => row.id);
    const [{ data: roomsForTypes }, { data: bookingsForTypes }] = await Promise.all([
      supabase.from("rolos_rooms").select("room_type_id").in("room_type_id", candidateIds),
      supabase.from("bookings").select("room_type_id").in("room_type_id", candidateIds),
    ]);

    const inUse = new Set<string>([
      ...((roomsForTypes || []) as Array<{ room_type_id: string | null }>)
        .map((r) => r.room_type_id)
        .filter(Boolean) as string[],
      ...((bookingsForTypes || []) as Array<{ room_type_id: string | null }>)
        .map((b) => b.room_type_id)
        .filter(Boolean) as string[],
    ]);

    const retireIds = candidateIds.filter((id) => !inUse.has(id));
    if (retireIds.length > 0) {
      const { error: retireError } = await supabase
        .from("rolos_room_types")
        .update({ is_active: false })
        .in("id", retireIds);
      if (retireError) {
        console.warn("[pmsRoomTypeSync] Failed to retire stale room types:", retireError);
      } else {
        retired = retireIds.length;
      }
    }
  }

  await repairUnitRoomTypeLinks(propertyId);

  return { inserted: inserts.length, updated: updates.length, reactivated, retired };
}

/**
 * Re-point units whose `linked_rolos_id` no longer resolves to a live room type.
 *
 * Replacing a room type used to orphan the unit link, and since every rate tier
 * (calendar season, plan season, rack) is keyed off that link, the unit silently
 * priced nothing — reported downstream as "no rates for the next 365 days".
 */
export async function repairUnitRoomTypeLinks(propertyId: string): Promise<number> {
  try {
    const [{ data: units }, { data: roomTypes }] = await Promise.all([
      supabase
        .from("hostfully_room_types")
        .select("id, name, linked_rolos_id")
        .eq("property_id", propertyId)
        .eq("is_active", true),
      supabase
        .from("rolos_room_types")
        .select("id, name")
        .eq("property_id", propertyId)
        .eq("is_active", true),
    ]);

    const liveIds = new Set((roomTypes ?? []).map((r) => r.id));
    const byName = new Map(
      (roomTypes ?? []).map((r) => [normalizeRoomTypeName(String(r.name ?? "")), r.id]),
    );

    let repaired = 0;
    for (const unit of (units ?? []) as Array<{ id: string; name: string | null; linked_rolos_id: string | null }>) {
      if (unit.linked_rolos_id && liveIds.has(unit.linked_rolos_id)) continue;
      const target = byName.get(normalizeRoomTypeName(String(unit.name ?? "")));
      if (!target || target === unit.linked_rolos_id) continue;
      const { error } = await supabase
        .from("hostfully_room_types")
        .update({ linked_rolos_id: target })
        .eq("id", unit.id);
      if (!error) repaired++;
    }
    return repaired;
  } catch (e) {
    console.warn("[pmsRoomTypeSync] unit link repair failed:", e);
    return 0;
  }
}


