import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RevenueStreamTotals {
  accommodation: number;
  fnb: number;
  other: number;
  hasSplit: boolean;
}

export interface RevenueMixPropertyRow {
  propertyId: string;
  propertyName: string;
  accommodation: number;
  fnb: number;
  other: number;
  total: number;
  nights: number;
  /** Accommodation revenue per booked room night. */
  accomAdr: number;
  hasSplit: boolean;
}

export interface RevenueMixResult extends RevenueStreamTotals {
  total: number;
  /** Share of posted revenue that is pure accommodation (1 when no split exists). */
  accommodationShare: number;
  nights: number;
  accomAdr: number;
  byProperty: RevenueMixPropertyRow[];
}

const EMPTY: RevenueMixResult = {
  accommodation: 0,
  fnb: 0,
  other: 0,
  total: 0,
  hasSplit: false,
  accommodationShare: 1,
  nights: 0,
  accomAdr: 0,
  byProperty: [],
};

function nightsBetween(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 1;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

function streamKey(value: unknown): "accommodation" | "fnb" | "other" {
  return value === "fnb" || value === "other" ? value : "accommodation";
}

/**
 * Aggregates posted folio revenue by stream (Accommodation / F&B / Other) for a
 * date range, both in total and per property.
 *
 * Source of truth is `rolos_folio_transactions` — positive, non-payment lines —
 * the same basis as the Revenue page's Total / Accommodation view. Properties
 * that post no F&B come back with hasSplit = false so callers keep showing the
 * single-revenue KPIs unchanged.
 */
export function useRevenueMix(dateRange: { start: string; end: string }, propertyIds?: string[]) {
  const idsKey = (propertyIds || []).slice().sort().join(",");

  return useQuery<RevenueMixResult>({
    queryKey: ["revenue-mix", dateRange.start, dateRange.end, idsKey],
    queryFn: async () => {
      let folioQuery = supabase
        .from("rolos_folios" as any)
        .select("id, property_id, booking:bookings!inner(check_in_date, check_out_date)");
      if (propertyIds?.length) folioQuery = folioQuery.in("property_id", propertyIds);
      const { data: folios } = await folioQuery;

      const inRange = (folios || []).filter((f: any) => {
        const d = f.booking?.check_in_date;
        return !d || (d >= dateRange.start && d <= dateRange.end);
      });
      const folioIds = inRange.map((f: any) => f.id);
      if (!folioIds.length) return EMPTY;

      const folioMeta = new Map<string, { propertyId: string; nights: number }>();
      inRange.forEach((f: any) => {
        folioMeta.set(f.id, {
          propertyId: f.property_id,
          nights: nightsBetween(f.booking?.check_in_date, f.booking?.check_out_date),
        });
      });

      const [{ data: rows }, { data: props }] = await Promise.all([
        supabase
          .from("rolos_folio_transactions" as any)
          .select("folio_id, amount, revenue_stream, transaction_type")
          .in("folio_id", folioIds),
        supabase
          .from("properties")
          .select("id, name")
          .in("id", Array.from(new Set(inRange.map((f: any) => f.property_id).filter(Boolean)))),
      ]);

      const nameById = new Map<string, string>((props || []).map((p: any) => [p.id, p.name]));

      const perProperty = new Map<
        string,
        { accommodation: number; fnb: number; other: number; folioIds: Set<string> }
      >();
      const totals = { accommodation: 0, fnb: 0, other: 0 };

      (rows || []).forEach((r: any) => {
        const amt = Number(r.amount || 0);
        if (amt <= 0 || r.transaction_type === "payment") return;
        const meta = folioMeta.get(r.folio_id);
        if (!meta) return;
        const key = streamKey(r.revenue_stream);
        totals[key] += amt;

        let bucket = perProperty.get(meta.propertyId);
        if (!bucket) {
          bucket = { accommodation: 0, fnb: 0, other: 0, folioIds: new Set() };
          perProperty.set(meta.propertyId, bucket);
        }
        bucket[key] += amt;
        bucket.folioIds.add(r.folio_id);
      });

      const byProperty: RevenueMixPropertyRow[] = Array.from(perProperty.entries())
        .map(([propertyId, b]) => {
          const total = b.accommodation + b.fnb + b.other;
          const nights = Array.from(b.folioIds).reduce(
            (sum, id) => sum + (folioMeta.get(id)?.nights || 0),
            0,
          );
          return {
            propertyId,
            propertyName: nameById.get(propertyId) || "Unnamed property",
            accommodation: b.accommodation,
            fnb: b.fnb,
            other: b.other,
            total,
            nights,
            accomAdr: nights > 0 ? b.accommodation / nights : 0,
            hasSplit: b.fnb > 0 || b.other > 0,
          };
        })
        .sort((a, b) => b.total - a.total);

      const total = totals.accommodation + totals.fnb + totals.other;
      const hasSplit = totals.fnb > 0 || totals.other > 0;
      const nights = byProperty.reduce((s, r) => s + r.nights, 0);

      return {
        ...totals,
        total,
        hasSplit,
        accommodationShare: hasSplit && total > 0 ? totals.accommodation / total : 1,
        nights,
        accomAdr: nights > 0 ? totals.accommodation / nights : 0,
        byProperty,
      };
    },
    staleTime: 60_000,
  });
}

/**
 * Back-compatible wrapper: portfolio-wide stream totals only.
 * @deprecated prefer useRevenueMix, which also returns the per-property rows.
 */
export function useRevenueStreamTotals(
  dateRange: { start: string; end: string },
  propertyIds?: string[],
) {
  const query = useRevenueMix(dateRange, propertyIds);
  const d = query.data;
  return {
    ...query,
    data: d
      ? ({ accommodation: d.accommodation, fnb: d.fnb, other: d.other, hasSplit: d.hasSplit } as RevenueStreamTotals)
      : undefined,
  };
}
