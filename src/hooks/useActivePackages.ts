import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RolosPackage } from "@/lib/packages";

/** Active packages for a property (booking / group attachment surfaces). */
export function useActivePackages(propertyId: string | null | undefined) {
  const [packages, setPackages] = useState<RolosPackage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) { setPackages([]); return; }
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("rolos_packages")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .order("display_order")
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setPackages((data || []) as RolosPackage[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [propertyId]);

  return { packages, loading };
}
