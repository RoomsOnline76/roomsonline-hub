import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportProperty {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  city: string | null;
  bedrooms: number | null;
}

/**
 * Properties available to the Revenue Reports subdomain.
 *
 * Phase 0 reads the existing `properties` table only — report-specific
 * settings (room count, cover artwork, historical baselines) arrive later.
 * Active-only, per the global property selection rule.
 */
export function useReportProperties(search: string = "") {
  const query = useQuery({
    queryKey: ["reports", "properties"],
    queryFn: async (): Promise<ReportProperty[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, brand_logo_url, city, bedrooms")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug ?? null,
        logoUrl: row.brand_logo_url ?? null,
        city: row.city ?? null,
        bedrooms: row.bedrooms ?? null,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const properties = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = query.data ?? [];
    if (!term) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.city ?? "").toLowerCase().includes(term) ||
        (p.slug ?? "").toLowerCase().includes(term),
    );
  }, [query.data, search]);

  return {
    properties,
    total: query.data?.length ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
