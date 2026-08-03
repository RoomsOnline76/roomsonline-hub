import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SpecialPolicyUsage {
  id: string;
  name: string;
  is_active: boolean;
  deal_type: string | null;
  cancellation_policy_id: string | null;
}

/**
 * Specials for a property together with the cancellation policy each one carries.
 * Used to cross-reference the Policies tab with the Specials tab.
 */
export function usePolicySpecialUsage(propertyId: string | undefined) {
  const [specials, setSpecials] = useState<SpecialPolicyUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!propertyId) {
      setSpecials([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("property_specials")
        .select("id, name, is_active, deal_type, cancellation_policy_id")
        .eq("property_id", propertyId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setSpecials((data ?? []) as unknown as SpecialPolicyUsage[]);
    } catch (e) {
      console.warn("[usePolicySpecialUsage] failed:", e);
      setSpecials([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { specials, loading, refetch };
}
