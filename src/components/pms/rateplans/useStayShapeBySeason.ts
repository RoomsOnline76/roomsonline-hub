import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  indexStayShapeBySeason,
  type StayShapeBySeason,
  type StayShapeFspRow,
  type StayShapeLosRow,
  type StayShapePlanRow,
} from "./indexStayShapeBySeason";

/**
 * Read-only: which saved LOS / full-stay ladders sit on which Calendar season.
 * One load per mount, no polling, never writes. Empty on any failure — a
 * display strip must never break the page it hangs off.
 */
export function useStayShapeBySeason(propertyId: string | null | undefined) {
  const { data } = useQuery<StayShapeBySeason>({
    queryKey: ["stay-shape-by-season", propertyId],
    queryFn: async () => {
      if (!propertyId) return {};

      const plansRes = await supabase
        .from("rolos_rate_plans")
        .select("id, name, is_active, los_enabled, fsp_enabled")
        .eq("property_id", propertyId)
        .is("deleted_at", null);

      if (plansRes.error) return {};
      const plans = (plansRes.data || []) as unknown as StayShapePlanRow[];
      const ids = plans
        .filter((p) => p.is_active !== false && (p.los_enabled || p.fsp_enabled))
        .map((p) => p.id);
      if (ids.length === 0) return {};

      const [rungsRes, cellsRes] = await Promise.all([
        supabase
          .from("rolos_rate_plan_los_rungs")
          .select("rate_plan_id, calendar_season_id, nights, derivation_type, derivation_value, is_pinned, pinned_rate")
          .in("rate_plan_id", ids),
        supabase
          .from("rolos_rate_plan_fsp_cells")
          .select("rate_plan_id, calendar_season_id, nights, nr_of_guests, derivation_type, derivation_value, is_pinned, pinned_total")
          .in("rate_plan_id", ids),
      ]);

      const rungs = (rungsRes.error ? [] : rungsRes.data || []) as unknown as StayShapeLosRow[];
      const cells = (cellsRes.error ? [] : cellsRes.data || []) as unknown as StayShapeFspRow[];

      return indexStayShapeBySeason(plans, rungs, cells);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return data ?? {};
}
