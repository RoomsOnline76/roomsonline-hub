import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { RuCertificationConsole } from "@/components/integrations/RuCertificationConsole";
import { useAuth } from "@/hooks/useAuth";
import { applyAdminScope } from "@/lib/adminScope";

interface PropertyLite {
  id: string;
  name: string;
  slug: string | null;
  external_system: string | null;
  ru_push_enabled: boolean | null;
  rentalsunited_property_id: string | null;
}

/**
 * The certification console needs the same property list the RU admin page loads; it is
 * fetched here so the cost monitor's default tab stays free of the extra query.
 */
export function ChannelCertificationTab({ initialTab }: { initialTab?: string }) {
  const { scopedPropertyIds } = useAuth();
  const [properties, setProperties] = useState<PropertyLite[] | null>(null);
  const scopeKey = scopedPropertyIds.join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await applyAdminScope(
        supabase
          .from("properties")
          .select("id, name, slug, external_system, ru_push_enabled, rentalsunited_property_id")
          .order("name"),
        "id",
        scopeKey ? scopeKey.split(",") : [],
      );
      if (!cancelled) setProperties((data ?? []) as PropertyLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);


  if (!properties) return <Skeleton className="h-64 w-full" />;
  return <RuCertificationConsole properties={properties} />;
}
