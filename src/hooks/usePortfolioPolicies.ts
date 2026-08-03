import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ReservationPolicy } from "@/hooks/useReservationPolicies";

/**
 * Reservation policies belonging to sibling properties in the same portfolio.
 * These can be activated (copied or linked) on the current property.
 */
export function usePortfolioPolicies(propertyId: string | undefined, siblingIds: string[]) {
  const [policies, setPolicies] = useState<ReservationPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const key = siblingIds.join(",");

  const refetch = useCallback(async () => {
    if (!propertyId || !key) {
      setPolicies([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("rolos_reservation_policies")
        .select("*")
        .in("property_id", key.split(","))
        .order("name", { ascending: true });
      setPolicies((data ?? []) as unknown as ReservationPolicy[]);
    } catch (e) {
      console.warn("[usePortfolioPolicies] failed:", e);
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId, key]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { portfolioPolicies: policies, loading, refetch };
}
