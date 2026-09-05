import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ruTokenCount, ruTokenId, type RuAmenity } from "@/lib/ruAmenities";

export interface ResolvedAmenity {
  /** Original stored token (`ru:<id>` or `ru:<id>:<count>`) or free-text label. */
  raw: string;
  /** Display label — the channel catalogue name, or the raw string when unknown. */
  label: string;
  /** Resolved quantity for countable amenities, otherwise 1. */
  count: number;
  /** True when the token could not be matched to the channel catalogue. */
  unmapped: boolean;
}

const EMPTY: ResolvedAmenity[] = [];

/**
 * Loads the Rentals United amenity catalogue once and resolves stored amenity
 * tokens (`ru:<id>[:<count>]`) and free-text labels into human-readable labels.
 *
 * Several editors surface just an amenity *count* pill; this hook gives them the
 * names behind the count for hover/tooltip disclosure without each one paging
 * the dictionary itself.
 */
export function useRuAmenityCatalogue() {
  const [catalogue, setCatalogue] = useState<Map<number, RuAmenity>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The RU dictionary is larger than PostgREST's default 1000-row window, so page it.
      const page = 1000;
      const all: RuAmenity[] = [];
      for (let from = 0; from < 10000; from += page) {
        const { data, error } = await supabase
          .from("ru_amenities")
          .select("id, name, category, is_recommended, scope, popular_rank, ru_group, supports_count")
          .eq("is_active", true)
          .order("name")
          .range(from, from + page - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as RuAmenity[]));
        if (data.length < page) break;
      }
      if (cancelled) return;
      setCatalogue(new Map(all.map((a) => [a.id, a])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const resolve = useMemo(() => {
    if (loading) return (_values: string[] | undefined | null): ResolvedAmenity[] => EMPTY;
    return (values: string[] | undefined | null): ResolvedAmenity[] => {
      const list = Array.isArray(values) ? values : [];
      const out: ResolvedAmenity[] = [];
      for (const raw of list) {
        const id = ruTokenId(raw);
        if (id != null) {
          const a = catalogue.get(id);
          out.push({
            raw,
            label: a?.name ?? `Channel amenity #${id}`,
            count: ruTokenCount(raw),
            unmapped: !a,
          });
        } else if (typeof raw === "string" && raw.trim()) {
          out.push({ raw, label: raw, count: 1, unmapped: true });
        }
      }
      return out;
    };
  }, [catalogue, loading]);

  return { resolve, loading };
}
