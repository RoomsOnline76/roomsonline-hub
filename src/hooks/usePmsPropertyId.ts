import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RolProperty {
  id: string;
  name: string;
}

/**
 * Resolves the current PMS property ID.
 * Priority: 1) ?property= query param  2) auto-detect from user's ROL properties
 * Uses React Query for caching so navigation between PMS pages doesn't re-fetch.
 *
 * When a selected property belongs to a portfolio, `portfolioPropertyIds` contains
 * all sibling property IDs (including the selected one). Pages can use
 * `portfolioProperties` to scope their views.
 */
export function usePmsPropertyId() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get("property");
  const { user, isDev, isAdmin, isFearlessLeader } = useAuth();
  const [manualPropertyId, setManualPropertyId] = useState<string | null>(null);

  const isPlatformUser = isDev || isAdmin || isFearlessLeader;

  // Cached query for available properties — shared across all PMS pages
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["pms-available-properties", user?.id, isPlatformUser],
    queryFn: async () => {
      if (!user) return [];

      if (isPlatformUser) {
        const { data } = await supabase
          .from("properties")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        return (data || []) as RolProperty[];
      }

      // Check both primary ownership and linked ownership
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single();

      const { data: owned } = await supabase
        .from("property_owners")
        .select("property_id")
        .eq("user_id", user.id);

      const linkedIds = owned?.map((o) => o.property_id) || [];

      let query = supabase
        .from("properties")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (profile?.email && linkedIds.length > 0) {
        query = query.or(`owner_email.eq.${profile.email},id.in.(${linkedIds.join(",")})`);
      } else if (profile?.email) {
        query = query.eq("owner_email", profile.email);
      } else if (linkedIds.length > 0) {
        query = query.in("id", linkedIds);
      }

      const { data } = await query;
      // Deduplicate
      const seen = new Set<string>();
      return ((data || []) as RolProperty[]).filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000,
  });

  // Resolve effective property ID
  const propertyId = useMemo(() => {
    if (manualPropertyId && properties.some(p => p.id === manualPropertyId)) {
      return manualPropertyId;
    }
    if (paramId && properties.some(p => p.id === paramId)) {
      return paramId;
    }
    if (properties.length > 0) {
      return properties[0].id;
    }
    return null;
  }, [manualPropertyId, paramId, properties]);

  // Fetch portfolio memberships for the selected property
  const { data: portfolioContext } = useQuery({
    queryKey: ["pms-property-portfolio-context", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;

      // Get portfolios this property belongs to
      const { data: memberships } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id")
        .eq("property_id", propertyId);

      if (!memberships || memberships.length === 0) return null;

      const portfolioIds = (memberships as any[]).map((m: any) => m.portfolio_id);

      // Get all member property IDs across all portfolios
      const { data: allMembers } = await supabase
        .from("property_portfolio_members" as any)
        .select("property_id, portfolio_id")
        .in("portfolio_id", portfolioIds);

      const memberIds = new Set<string>();
      (allMembers as any[] || []).forEach((m: any) => memberIds.add(m.property_id));

      // Fetch those properties
      const { data: memberProps } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", Array.from(memberIds))
        .eq("is_active", true)
        .order("name");

      return {
        portfolioIds,
        properties: (memberProps || []) as RolProperty[],
      };
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  // Portfolio-scoped properties: if selected property is in a portfolio, show only those
  const portfolioProperties = useMemo(() => {
    if (!portfolioContext?.properties?.length) return null;
    return portfolioContext.properties;
  }, [portfolioContext]);

  // Sync URL param when propertyId changes
  useEffect(() => {
    if (propertyId && propertyId !== paramId) {
      setSearchParams((prev) => {
        prev.set("property", propertyId);
        return prev;
      }, { replace: true });
    }
  }, [propertyId]);

  const switchProperty = (id: string) => {
    setManualPropertyId(id);
    setSearchParams((prev) => {
      prev.set("property", id);
      return prev;
    }, { replace: true });
  };

  return {
    propertyId,
    properties,
    /** Properties scoped to portfolio (null if not in a portfolio) */
    portfolioProperties,
    /** Portfolio IDs the selected property belongs to */
    portfolioIds: portfolioContext?.portfolioIds || [],
    loading: isLoading,
    switchProperty,
  };
}
