/**
 * Loads the property's live occupancy + block map so booking dialogs can grey
 * out nights that are already sold instead of letting an operator double-book.
 */
import { useQuery } from "@tanstack/react-query";
import {
  fetchUnitAvailability,
  emptyUnitAvailability,
  type UnitAvailability,
} from "@/lib/unitAvailability";

export function useUnitAvailability(
  propertyId: string | null | undefined,
  options: { enabled?: boolean; excludeBookingId?: string | null } = {},
) {
  const { enabled = true, excludeBookingId = null } = options;
  const query = useQuery<UnitAvailability>({
    queryKey: ["unit-availability", propertyId, excludeBookingId],
    enabled: !!propertyId && enabled,
    queryFn: () => fetchUnitAvailability(propertyId as string, { excludeBookingId }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    availability: query.data ?? emptyUnitAvailability(),
    loading: query.isPending,
    refresh: query.refetch,
  };
}
