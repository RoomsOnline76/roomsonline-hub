import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RevenueStreamTotals {
  accommodation: number;
  fnb: number;
  other: number;
  hasSplit: boolean;
}

/**
 * Aggregates posted folio revenue by stream for a date range.
 * Returns hasSplit = false when no property posts F&B revenue, so callers can
 * keep showing the existing single-revenue KPIs unchanged.
 */
export function useRevenueStreamTotals(dateRange: { start: string; end: string }, propertyIds?: string[]) {
  return useQuery<RevenueStreamTotals>({
    queryKey: ["revenue-stream-totals", dateRange.start, dateRange.end, (propertyIds || []).join(",")],
    queryFn: async () => {
      const empty: RevenueStreamTotals = { accommodation: 0, fnb: 0, other: 0, hasSplit: false };

      let folioQuery = supabase
        .from("rolos_folios" as any)
        .select("id, property_id, booking:bookings!inner(check_in_date)");
      if (propertyIds?.length) folioQuery = folioQuery.in("property_id", propertyIds);
      const { data: folios } = await folioQuery;

      const folioIds = (folios || [])
        .filter((f: any) => {
          const d = f.booking?.check_in_date;
          return !d || (d >= dateRange.start && d <= dateRange.end);
        })
        .map((f: any) => f.id);
      if (!folioIds.length) return empty;

      const { data: rows } = await supabase
        .from("rolos_folio_transactions" as any)
        .select("amount, revenue_stream, transaction_type")
        .in("folio_id", folioIds);

      const totals = { accommodation: 0, fnb: 0, other: 0 };
      (rows || []).forEach((r: any) => {
        const amt = Number(r.amount || 0);
        if (amt <= 0 || r.transaction_type === "payment") return;
        const key = r.revenue_stream === "fnb" || r.revenue_stream === "other" ? r.revenue_stream : "accommodation";
        totals[key as keyof typeof totals] += amt;
      });

      return { ...totals, hasSplit: totals.fnb > 0 || totals.other > 0 };
    },
    staleTime: 60_000,
  });
}
