import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportProperty {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  city: string | null;
  /** Sellable room / unit count used by the revenue reports. */
  roomCount: number | null;
  /** Standalone reporting client — exists for reports only, not in ROL. */
  isReportsClient: boolean;
}


/** Names that mark internal fixtures which must never appear in reports. */
const EXCLUDED_NAME_PATTERNS = [/sandbox/i, /\btest\b/i, /rutest/i, /pruebas/i, /\bdemo\b/i, /sample/i];

function isInternalFixture(name: string): boolean {
  return EXCLUDED_NAME_PATTERNS.some((re) => re.test(name));
}

/**
 * Properties available to the Revenue Reports subdomain.
 *
 * Active, non-archived, non-test, non-sandbox properties only.
 * Room count resolution order:
 *   1. property_report_settings.room_count (explicit override)
 *   2. sum of total_units across ACTIVE channel room types (sellable inventory)
 *   3. null (unknown — never fall back to bedrooms, which counts bedrooms not units)
 */
export function useReportProperties(search: string = "") {
  const query = useQuery({
    queryKey: ["reports", "properties"],
    queryFn: async (): Promise<ReportProperty[]> => {
      const SELECT =
        "id, name, slug, brand_logo_url, city, is_test_property, is_sandbox, ru_archived, is_reports_client";

      const [rolRes, clientRes] = await Promise.all([
        supabase
          .from("properties")
          .select(SELECT)
          .eq("is_active", true)
          .eq("is_reports_client", false)
          .order("name", { ascending: true }),
        // Standalone reporting clients are parked (is_active = false) so they
        // never leak into ROL selectors; the fixture-name filter does not apply.
        supabase
          .from("properties")
          .select(SELECT)
          .eq("is_reports_client", true)
          .is("reports_client_archived_at", null)
          .order("name", { ascending: true }),
      ]);
      if (rolRes.error) throw rolRes.error;
      if (clientRes.error) throw clientRes.error;

      const eligible = [
        ...(rolRes.data ?? []).filter(
          (row) =>
            !row.is_test_property &&
            !row.is_sandbox &&
            !row.ru_archived &&
            !isInternalFixture(row.name ?? ""),
        ),
        ...(clientRes.data ?? []),
      ];
      const ids = eligible.map((row) => row.id);
      if (ids.length === 0) return [];

      const [settingsRes, roomTypesRes] = await Promise.all([
        supabase.from("property_report_settings").select("property_id, room_count").in("property_id", ids),
        supabase
          .from("hostfully_room_types")
          .select("property_id, total_units, is_active")
          .in("property_id", ids)
          .eq("is_active", true),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      if (roomTypesRes.error) throw roomTypesRes.error;

      const overrides = new Map<string, number>();
      for (const row of settingsRes.data ?? []) {
        if (typeof row.room_count === "number" && row.room_count > 0) {
          overrides.set(row.property_id, row.room_count);
        }
      }

      const inventory = new Map<string, number>();
      for (const row of roomTypesRes.data ?? []) {
        const units = typeof row.total_units === "number" && row.total_units > 0 ? row.total_units : 1;
        inventory.set(row.property_id, (inventory.get(row.property_id) ?? 0) + units);
      }

      return eligible
        .map((row) => {
          const isReportsClient = Boolean(row.is_reports_client);
          return {
            id: row.id,
            name: row.name,
            slug: row.slug ?? null,
            logoUrl: row.brand_logo_url ?? null,
            city: row.city ?? null,
            // Reporting clients have no channel inventory — settings only.
            roomCount: isReportsClient
              ? overrides.get(row.id) ?? null
              : overrides.get(row.id) ?? inventory.get(row.id) ?? null,
            isReportsClient,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
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
