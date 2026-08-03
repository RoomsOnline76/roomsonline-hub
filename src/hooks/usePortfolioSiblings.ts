import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SiblingProperty {
  id: string;
  name: string;
}

/**
 * Active sibling properties that share a portfolio with `propertyId`.
 * Used by the specials wizard and the policies tab to offer copy targets.
 */
export function usePortfolioSiblings(propertyId: string | undefined) {
  const [siblings, setSiblings] = useState<SiblingProperty[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!propertyId) {
      setSiblings([]);
      return;
    }
    setLoading(true);
    try {
      const { data: memberships } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id")
        .eq("property_id", propertyId);
      const portfolioIds = [...new Set((memberships ?? []).map((m) => m.portfolio_id))];
      if (!portfolioIds.length) {
        setSiblings([]);
        return;
      }
      const { data: siblingRows } = await supabase
        .from("property_portfolio_members")
        .select("property_id")
        .in("portfolio_id", portfolioIds)
        .neq("property_id", propertyId);
      const ids = [...new Set((siblingRows ?? []).map((r) => r.property_id))];
      if (!ids.length) {
        setSiblings([]);
        return;
      }
      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", ids)
        .eq("is_active", true)
        .order("name", { ascending: true });
      setSiblings((props ?? []) as SiblingProperty[]);
    } catch (e) {
      console.warn("[usePortfolioSiblings] failed:", e);
      setSiblings([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { siblings, loading, refetch };
}
