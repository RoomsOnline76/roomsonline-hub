import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolves the current PMS property ID.
 * Priority: 1) ?property= query param  2) auto-detect from user's ROL properties
 * For admins/devs: picks the first ROL property.
 * For owners: picks their owned ROL property.
 */
export function usePmsPropertyId() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get("property");
  const { user, isDev, isAdmin } = useAuth();
  const [propertyId, setPropertyId] = useState<string | null>(paramId);
  const [loading, setLoading] = useState(!paramId);

  useEffect(() => {
    if (paramId) {
      setPropertyId(paramId);
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const resolve = async () => {
      setLoading(true);

      // For dev/admin: grab the first ROL property
      if (isDev || isAdmin) {
        const { data } = await supabase
          .from("properties")
          .select("id")
          .eq("is_rol_property", true)
          .limit(1)
          .single();

        if (data?.id) {
          setPropertyId(data.id);
          setSearchParams((prev) => {
            prev.set("property", data.id);
            return prev;
          }, { replace: true });
        }
      } else {
        // Owner: find properties they own that are ROL
        const { data: owned } = await supabase
          .from("property_owners")
          .select("property_id")
          .eq("user_id", user.id);

        if (owned && owned.length > 0) {
          const ids = owned.map((o) => o.property_id);
          const { data: rolProp } = await supabase
            .from("properties")
            .select("id")
            .in("id", ids)
            .eq("is_rol_property", true)
            .limit(1)
            .single();

          if (rolProp?.id) {
            setPropertyId(rolProp.id);
            setSearchParams((prev) => {
              prev.set("property", rolProp.id);
              return prev;
            }, { replace: true });
          }
        }
      }
      setLoading(false);
    };

    resolve();
  }, [paramId, user, isDev, isAdmin]);

  return { propertyId, loading };
}
