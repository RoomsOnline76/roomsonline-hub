import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RolProperty {
  id: string;
  name: string;
}

/**
 * Resolves the current PMS property ID.
 * Priority: 1) ?property= query param  2) auto-detect from user's ROL properties
 * Also returns all available ROL properties for switching.
 */
export function usePmsPropertyId() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get("property");
  const { user, isDev, isAdmin, isFearlessLeader } = useAuth();
  const [propertyId, setPropertyId] = useState<string | null>(paramId);
  const [properties, setProperties] = useState<RolProperty[]>([]);
  const [loading, setLoading] = useState(!paramId);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const resolve = async () => {
      setLoading(true);

      let rolProperties: RolProperty[] = [];

      if (isDev || isAdmin || isFearlessLeader) {
        const { data } = await supabase
          .from("properties")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        rolProperties = data || [];
    } else {
        // Check both primary ownership (via owner_email) and linked ownership (via property_owners)
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

        // Fetch active properties where user is primary owner OR linked owner
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
        // Deduplicate — a user can be both primary owner and linked owner
        const seen = new Set<string>();
        rolProperties = (data || []).filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      }

      setProperties(rolProperties);

      // If paramId is valid and in the list, use it
      if (paramId && rolProperties.some((p) => p.id === paramId)) {
        setPropertyId(paramId);
      } else if (rolProperties.length > 0) {
        // Auto-select first
        const first = rolProperties[0].id;
        setPropertyId(first);
        setSearchParams((prev) => {
          prev.set("property", first);
          return prev;
        }, { replace: true });
      }

      setLoading(false);
    };

    resolve();
  }, [user, isDev, isAdmin, isFearlessLeader]);

  // When paramId changes externally, sync
  useEffect(() => {
    if (paramId && paramId !== propertyId) {
      setPropertyId(paramId);
    }
  }, [paramId]);

  const switchProperty = (id: string) => {
    setPropertyId(id);
    setSearchParams((prev) => {
      prev.set("property", id);
      return prev;
    }, { replace: true });
  };

  return { propertyId, properties, loading, switchProperty };
}
