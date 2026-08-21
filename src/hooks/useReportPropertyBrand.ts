import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RoomCountSource = "rooms" | "room-types" | "bedrooms" | "none";

export interface ReportPropertyBrandData {
  brandOverrideEnabled: boolean;
  logoUrl: string | null;
  primary: string | null;
  secondary: string | null;
  /** Sellable rooms as recorded in ROL inventory. */
  roomCount: number;
  roomCountSource: RoomCountSource;
}

/**
 * Reads a single property's ROL branding plus its sellable-room inventory so
 * the report settings screen can pull both instead of asking for typed input.
 */
export function useReportPropertyBrand(propertyId: string | undefined) {
  const query = useQuery({
    queryKey: ["reports", "property-brand", propertyId],
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReportPropertyBrandData | null> => {
      if (!propertyId) return null;

      const [propertyResult, roomsResult, roomTypesResult] = await Promise.all([
        supabase
          .from("properties")
          .select(
            "brand_override_enabled, brand_logo_url, brand_primary_color, brand_secondary_color, bedrooms",
          )
          .eq("id", propertyId)
          .maybeSingle(),
        supabase
          .from("rolos_rooms")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId),
        supabase
          .from("rolos_room_types")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId),
      ]);

      if (propertyResult.error) throw propertyResult.error;
      const property = propertyResult.data;
      if (!property) return null;

      const rooms = roomsResult.count ?? 0;
      const roomTypes = roomTypesResult.count ?? 0;
      const bedrooms = property.bedrooms ?? 0;

      let roomCount = 0;
      let roomCountSource: RoomCountSource = "none";
      if (rooms > 0) {
        roomCount = rooms;
        roomCountSource = "rooms";
      } else if (roomTypes > 0) {
        roomCount = roomTypes;
        roomCountSource = "room-types";
      } else if (bedrooms > 0) {
        roomCount = bedrooms;
        roomCountSource = "bedrooms";
      }

      return {
        brandOverrideEnabled: Boolean(property.brand_override_enabled),
        logoUrl: property.brand_logo_url ?? null,
        primary: property.brand_primary_color ?? null,
        secondary: property.brand_secondary_color ?? null,
        roomCount,
        roomCountSource,
      };
    },
  });

  return {
    brand: query.data ?? null,
    isLoading: query.isLoading,
  };
}

export const ROOM_COUNT_SOURCE_LABEL: Record<RoomCountSource, string> = {
  rooms: "from ROL room inventory",
  "room-types": "from ROL room types",
  bedrooms: "from the property bedroom count",
  none: "no inventory recorded in ROL yet",
};
