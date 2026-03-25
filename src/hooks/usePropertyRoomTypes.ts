import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RoomTypeInfo = { id: string; name: string };

/**
 * Fetches room types for a property using a fallback chain:
 * 1. rolos_room_types
 * 2. hostfully_room_types
 * 3. properties.amenities.room_types JSON
 */
export async function fetchPropertyRoomTypes(propertyId: string): Promise<RoomTypeInfo[]> {
  // 1. Try rolos_room_types first
  const { data: rolosData } = await supabase
    .from('rolos_room_types')
    .select('id, name')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('name');
  if (rolosData && rolosData.length > 0) return rolosData;

  // 2. Fallback to hostfully_room_types
  const { data: hostfullyData } = await supabase
    .from('hostfully_room_types')
    .select('id, name')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('name');
  if (hostfullyData && hostfullyData.length > 0) return hostfullyData;

  // 3. Fallback to properties.amenities.room_types JSON
  const { data: property } = await supabase
    .from('properties')
    .select('amenities')
    .eq('id', propertyId)
    .single();
  const amenities = property?.amenities as { room_types?: Array<{ id?: string; name?: string }> } | null;
  if (Array.isArray(amenities?.room_types)) {
    return amenities!.room_types
      .filter((rt) => rt?.name)
      .map((rt, idx) => ({ id: rt.id || `amenity-${idx}`, name: String(rt.name) }));
  }

  return [];
}

export function usePropertyRoomTypes(propertyId: string | null) {
  return useQuery({
    queryKey: ['property-room-types', propertyId],
    queryFn: () => fetchPropertyRoomTypes(propertyId!),
    enabled: !!propertyId,
  });
}
