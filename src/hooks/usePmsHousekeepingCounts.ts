import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HousekeepingCounts {
  /** Rooms flagged dirty and awaiting a clean. */
  dirty: number;
  /** Housekeeping tasks that are not yet completed/cancelled. */
  cleaningTasks: number;
  /** Maintenance dockets still open (reported / assigned / in progress). */
  openDockets: number;
  /** Dockets resolved but still awaiting a "room ready" confirmation. */
  awaitingReady: number;
  /** Everything that needs an action or a review. */
  total: number;
}

const EMPTY: HousekeepingCounts = {
  dirty: 0,
  cleaningTasks: 0,
  openDockets: 0,
  awaitingReady: 0,
  total: 0,
};

const OPEN_DOCKET_STATUSES = ["reported", "assigned", "in_progress"];
const CLOSED_TASK_STATUSES = ["completed", "cancelled", "verified"];

/**
 * Portfolio-aware counter for the ROLOS housekeeping workload.
 * Used by the Housekeeping board action cards and the sidebar badge.
 */
export function usePmsHousekeepingCounts(propertyIds: string[], pollMs = 60_000) {
  const [counts, setCounts] = useState<HousekeepingCounts>(EMPTY);
  const [loading, setLoading] = useState(false);
  const key = propertyIds.slice().sort().join(",");

  const refresh = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setCounts(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const [dirtyRes, tasksRes, docketsRes, readyRes] = await Promise.all([
        (supabase.from("rolos_rooms") as any)
          .select("id", { count: "exact", head: true })
          .in("property_id", ids)
          .eq("status", "dirty"),
        (supabase.from("rolos_housekeeping_tasks") as any)
          .select("id, rolos_rooms!inner(property_id)", { count: "exact", head: true })
          .in("rolos_rooms.property_id", ids)
          .not("status", "in", `(${CLOSED_TASK_STATUSES.join(",")})`),
        (supabase.from("rolos_maintenance_requests") as any)
          .select("id", { count: "exact", head: true })
          .in("property_id", ids)
          .in("status", OPEN_DOCKET_STATUSES),
        (supabase.from("rolos_maintenance_requests") as any)
          .select("id", { count: "exact", head: true })
          .in("property_id", ids)
          .eq("status", "resolved")
          .eq("room_ready_confirmed", false),
      ]);

      const dirty = dirtyRes.count || 0;
      const cleaningTasks = tasksRes.count || 0;
      const openDockets = docketsRes.count || 0;
      const awaitingReady = readyRes.count || 0;
      setCounts({
        dirty,
        cleaningTasks,
        openDockets,
        awaitingReady,
        total: dirty + cleaningTasks + openDockets + awaitingReady,
      });
    } catch {
      // Counters are advisory — never break navigation on a failed count.
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    refresh();
    if (!pollMs) return;
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { counts, loading, refresh };
}
