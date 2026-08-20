import type { QueryClient } from "@tanstack/react-query";

/**
 * Every query that renders night restrictions (blocks, min/max stay, lead days, rate-plan
 * closures) across the room plan, day/week/month grids, the portfolio view and the
 * "Manage restrictions" list. A restriction change invalidates all of them together — picking
 * one refetch by hand is what made removed blocks reappear and then vanish a moment later.
 */
export const RESTRICTION_QUERY_KEYS = [
  "pms-cal-overrides",
  "pms-portfolio-overrides",
  "pms-cal-rooms",
  "restriction-spans",
  "calendar-availability",
  "rate-plan-stop-sell",
] as const;

/** Invalidate and immediately refetch everything that shows restrictions. */
export function invalidateRestrictionQueries(queryClient: QueryClient): void {
  for (const key of RESTRICTION_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" });
  }
}
