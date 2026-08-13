import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BackgroundJobRow {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
}

export interface BackgroundJobSummary {
  pending: number;
  running: number;
  retrying: number;
  failed: number;
}

/**
 * Booking mutations hand their follow-up work (commission, channel deltas, emails) to the
 * `background_jobs` queue so the operator is never held up. This surfaces that queue so nothing
 * can die there silently.
 */
export function useBackgroundJobs(pollMs = 30000) {
  const [summary, setSummary] = useState<BackgroundJobSummary>({
    pending: 0,
    running: 0,
    retrying: 0,
    failed: 0,
  });
  const [failedJobs, setFailedJobs] = useState<BackgroundJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("background_jobs")
      .select("id, job_type, status, attempts, max_attempts, run_after, last_error, created_at")
      .in("status", ["pending", "running", "failed"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as BackgroundJobRow[];
    setSummary({
      pending: rows.filter((r) => r.status === "pending" && r.attempts === 0).length,
      running: rows.filter((r) => r.status === "running").length,
      retrying: rows.filter((r) => r.status === "pending" && r.attempts > 0).length,
      failed: rows.filter((r) => r.status === "failed").length,
    });
    setFailedJobs(rows.filter((r) => r.status === "failed").slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);

  /** Kick the worker so anything due (including freshly re-armed jobs) drains now. */
  const drain = useCallback(async () => {
    setRetrying(true);
    try {
      await supabase.functions.invoke("process-background-jobs", { body: { limit: 25 } });
      await load();
    } finally {
      setRetrying(false);
    }
  }, [load]);

  return { summary, failedJobs, loading, retrying, reload: load, drain };
}
