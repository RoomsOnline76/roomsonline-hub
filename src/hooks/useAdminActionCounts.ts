import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live "needs action" counters for sidebar nav items.
 *
 * Keys match the `id` of the nav item in `src/config/navigation.ts`, so a new
 * badge is a config-only change once the count is added here.
 */
export type AdminActionCounts = Record<string, number>;

/** Routes whose queues these counters track — used to refresh on navigation away. */
export const BADGED_ROUTES = [
  "/admin/access-requests",
  "/admin/review-queue",
  "/admin/contracts",
  "/admin/commission-reports",
  "/admin/payments",
  "/admin/onboarding",
  "/dev/tasks",
];

/** Count helper that degrades to 0 instead of throwing the sidebar over. */
async function safeCount(
  run: () => PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await run();
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}


/**
 * Properties whose owner submitted the onboarding form (token used) but that
 * have not yet reached the activation/live stage — i.e. awaiting admin review.
 */
async function countOnboardingAwaitingReview(): Promise<number> {
  try {
    const { data: tokens, error: tokenError } = await supabase
      .from("property_onboarding_tokens")
      .select("property_id, used_at, created_at")
      .not("used_at", "is", null)
      .order("created_at", { ascending: false });

    if (tokenError || !tokens?.length) return 0;

    // Most recent token per property.
    const propertyIds = Array.from(new Set(tokens.map((t) => t.property_id).filter(Boolean))) as string[];
    if (propertyIds.length === 0) return 0;

    const { count, error } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .in("id", propertyIds)
      .is("permanently_deleted_at", null)
      .eq("is_active", true)
      .not("listing_status", "in", "(live,activation_ready)");

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

interface UseAdminActionCountsOptions {
  isAdmin: boolean;
  isDev: boolean;
  isFearlessLeader?: boolean;
}

export function useAdminActionCounts({ isAdmin, isDev, isFearlessLeader }: UseAdminActionCountsOptions) {
  const [counts, setCounts] = useState<AdminActionCounts>({});
  const location = useLocation();
  const inFlight = useRef(false);

  const canSeeAdminQueues = isAdmin || isDev || !!isFearlessLeader;
  const canSeeDevQueues = isDev || !!isFearlessLeader;

  const refresh = useCallback(async () => {
    if (!canSeeAdminQueues || inFlight.current) return;
    inFlight.current = true;

    try {
      const [
        accessRequests,
        reviewQueue,
        contracts,
        commissionReports,
        payments,
        onboarding,
        devTasks,
      ] = await Promise.all([
        safeCount(() =>
          supabase
            .from("access_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        ),
        safeCount(() =>
          supabase
            .from("properties")
            .select("id", { count: "exact", head: true })
            .is("permanently_deleted_at", null)
            .eq("is_active", true)
            .in("listing_status", ["review_pending", "activation_ready", "review_failed"])
        ),
        safeCount(() =>
          supabase
            .from("owner_contracts")
            .select("id", { count: "exact", head: true })
            .in("status", ["sent", "viewed"])
        ),
        safeCount(() =>
          supabase
            .from("rep_commission_reports")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending_approval")
        ),
        safeCount(() =>
          supabase
            .from("payment_transactions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        ),
        countOnboardingAwaitingReview(),
        canSeeDevQueues
          ? safeCount(() =>
              supabase
                .from("dev_tasks")
                .select("id", { count: "exact", head: true })
                .eq("status", "new")
            )
          : Promise.resolve(0),
      ]);

      setCounts({
        "access-requests": accessRequests,
        "review-queue": reviewQueue,
        contracts,
        "commission-reports": commissionReports,
        payments,
        onboarding,
        "task-tracker": devTasks,
      });
    } finally {
      inFlight.current = false;
    }
  }, [canSeeAdminQueues, canSeeDevQueues]);

  // Initial load + whenever the user navigates (acting on a queue clears its badge).
  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  // Refresh when the tab regains focus.
  useEffect(() => {
    if (!canSeeAdminQueues) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, canSeeAdminQueues]);

  const totalPending = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + (n || 0), 0),
    [counts]
  );

  return { counts, totalPending, refresh };
}
