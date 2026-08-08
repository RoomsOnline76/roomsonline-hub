import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RolActualRevenue {
  /** Commission + subscription revenue earned in the current calendar month (ZAR). */
  currentMonthZar: number;
  /** Trailing 3-month average monthly revenue (ZAR) — used to drive runway. */
  trailingMonthlyAvgZar: number;
  commissionZar: number;
  subscriptionZar: number;
  /** Number of commission-bearing bookings in the trailing window. */
  bookingCount: number;
}

const monthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfCurrentMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const CONFIRMED_STATUSES = ["confirmed", "completed", "checked_in", "checked_out", "paid"];

/**
 * Actual ROL revenue as recorded via commission fees on confirmed bookings plus
 * collected PMS subscription invoices. Drives runway rather than a manually
 * entered revenue figure.
 */
export function useRolActualRevenue() {
  return useQuery<RolActualRevenue>({
    queryKey: ["rol-actual-revenue"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const windowStart = monthsAgo(3).toISOString();
      const monthStart = startOfCurrentMonth().toISOString();

      const [bookingsRes, subsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("calculated_commission, created_at, status")
          .in("status", CONFIRMED_STATUSES)
          .gte("created_at", windowStart),
        supabase
          .from("subscription_invoices")
          .select("amount, currency, status, paid_at, created_at")
          .eq("status", "paid")
          .gte("created_at", windowStart),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (subsRes.error) throw subsRes.error;

      let commissionZar = 0;
      let subscriptionZar = 0;
      let currentMonthZar = 0;
      let bookingCount = 0;

      for (const row of bookingsRes.data ?? []) {
        const amount = Number(row.calculated_commission ?? 0);
        if (!Number.isFinite(amount) || amount === 0) continue;
        commissionZar += amount;
        bookingCount += 1;
        if ((row.created_at ?? "") >= monthStart) currentMonthZar += amount;
      }

      for (const row of subsRes.data ?? []) {
        const amount = Number(row.amount ?? 0);
        if (!Number.isFinite(amount) || amount === 0) continue;
        subscriptionZar += amount;
        const stamp = row.paid_at ?? row.created_at ?? "";
        if (stamp >= monthStart) currentMonthZar += amount;
      }

      const total = commissionZar + subscriptionZar;

      return {
        currentMonthZar,
        trailingMonthlyAvgZar: total / 3,
        commissionZar,
        subscriptionZar,
        bookingCount,
      };
    },
  });
}
