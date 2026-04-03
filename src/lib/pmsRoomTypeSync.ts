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
    return { inserted: 0, updated: 0, reactivated: 0 };
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
    if (firstError) throw firstError;
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("rolos_room_types").insert(inserts);
    if (insertError) throw insertError;
  }

  return { inserted: inserts.length, updated: updates.length, reactivated };
}
