import { useEffect, useState, useMemo, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RolProperty {
  id: string;
  name: string;
  slug?: string;
  brand_primary_color?: string | null;
}

// ── Shared selection store (singleton across all hook instances) ──
let _selectedId: string | null = null;
const _listeners = new Set<() => void>();

function getSelectedId() {
  return _selectedId;
}

function setSelectedId(id: string | null) {
  if (id === _selectedId) return;
  _selectedId = id;
  _listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/**
 * Resolves the current PMS property ID.
 * Priority: 1) shared selected property  2) ?property= query param  3) first available
 * Uses a module-level store so all PMS pages/components share the same selection.
 */
export function usePmsPropertyId() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get("property");
  const { user, isDev, isAdmin, isFearlessLeader } = useAuth();

  const isPlatformUser = isDev || isAdmin || isFearlessLeader;

  // Read shared selection via useSyncExternalStore for proper reactivity
  const sharedSelectedId = useSyncExternalStore(subscribe, getSelectedId);

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

  // Resolve effective property ID using shared state
  const propertyId = useMemo(() => {
    // 1) Shared selection (if still valid)
    if (sharedSelectedId && properties.some(p => p.id === sharedSelectedId)) {
      return sharedSelectedId;
    }
    // 2) URL param
    if (paramId && properties.some(p => p.id === paramId)) {
      return paramId;
    }
    // 3) First available
    if (properties.length > 0) {
      return properties[0].id;
    }
    return null;
  }, [sharedSelectedId, paramId, properties]);

  // Fetch portfolio memberships for the selected property
  const { data: portfolioContext } = useQuery({
    queryKey: ["pms-property-portfolio-context", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;

      const { data: memberships } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id")
        .eq("property_id", propertyId);

      if (!memberships || memberships.length === 0) return null;

      const portfolioIds = (memberships as any[]).map((m: any) => m.portfolio_id);

      const { data: allMembers } = await supabase
        .from("property_portfolio_members" as any)
        .select("property_id, portfolio_id")
        .in("portfolio_id", portfolioIds);

      const memberIds = new Set<string>();
      (allMembers as any[] || []).forEach((m: any) => memberIds.add(m.property_id));

      const { data: memberProps } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color")
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

  const portfolioProperties = useMemo(() => {
    if (!portfolioContext?.properties?.length) return null;
    return portfolioContext.properties;
  }, [portfolioContext]);

  // Keep shared store + URL in sync when propertyId resolves
  useEffect(() => {
    if (propertyId) {
      // Update shared store
      setSelectedId(propertyId);
      // Sync URL
      if (propertyId !== paramId) {
        setSearchParams((prev) => {
          prev.set("property", propertyId);
          return prev;
        }, { replace: true });
      }
    }
  }, [propertyId]);

  const switchProperty = useCallback((id: string) => {
    setSelectedId(id);
    setSearchParams((prev) => {
      prev.set("property", id);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    propertyId,
    properties,
    portfolioProperties,
    portfolioIds: portfolioContext?.portfolioIds || [],
    loading: isLoading,
    switchProperty,
  };
}
