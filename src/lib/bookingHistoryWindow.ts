/**
 * Shared booking-window helpers.
 *
 * Imported history (e.g. a NightsBridge export) frequently lands entirely outside the
 * forward-looking defaults used by the dashboard, bookings list, revenue and reports. These
 * helpers let every surface agree on the available range and warn when the current window is
 * empty while data exists elsewhere.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookingCoverage {
  /** Earliest non-cancelled check-in on the property (ISO date) — null when there are none. */
  earliest: string | null;
  /** Latest non-cancelled check-in on the property (ISO date). */
  latest: string | null;
  /** Total non-cancelled bookings on the property. */
  total: number;
}

export type BookingPeriodPreset =
  | "current"
  | "last_3_months"
  | "last_12_months"
  | "all_time";

export const BOOKING_PERIOD_LABELS: Record<BookingPeriodPreset, string> = {
  current: "Current window",
  last_3_months: "Last 3 months",
  last_12_months: "Last 12 months",
  all_time: "All time",
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

const monthsBack = (months: number): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
};

/**
 * Resolve a preset into a concrete from/to pair. `all_time` falls back to the property's
 * earliest booking so the query stays bounded.
 */
export function resolveBookingPeriod(
  preset: BookingPeriodPreset,
  coverage: BookingCoverage | undefined,
  fallbackFrom: string,
  fallbackTo: string,
): { from: string; to: string } {
  const forwardTo = iso(new Date(Date.now() + 60 * 86_400_000));
  switch (preset) {
    case "last_3_months":
      return { from: iso(monthsBack(3)), to: forwardTo };
    case "last_12_months":
      return { from: iso(monthsBack(12)), to: forwardTo };
    case "all_time":
      return { from: coverage?.earliest ?? iso(monthsBack(36)), to: coverage?.latest ?? forwardTo };
    default:
      return { from: fallbackFrom, to: fallbackTo };
  }
}

/**
 * Earliest / latest / total non-cancelled bookings across one or more properties. Used to
 * surface "there are bookings outside this range" affordances instead of showing an empty grid.
 */
export function useBookingCoverage(propertyIds: string[] | undefined) {
  const ids = (propertyIds ?? []).filter(Boolean);
  const key = ids.slice().sort().join(",");
  return useQuery<BookingCoverage>({
    queryKey: ["booking-coverage", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const base = () =>
        supabase.from("bookings").select("check_in_date", { count: "exact" }).in("property_id", ids).neq("status", "cancelled");

      const [first, last] = await Promise.all([
        base().order("check_in_date", { ascending: true }).limit(1),
        base().order("check_in_date", { ascending: false }).limit(1),
      ]);

      return {
        earliest: (first.data?.[0]?.check_in_date as string | undefined) ?? null,
        latest: (last.data?.[0]?.check_in_date as string | undefined) ?? null,
        total: first.count ?? 0,
      };
    },
  });
}
