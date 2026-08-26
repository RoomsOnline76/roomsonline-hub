/**
 * Durable channel-onboarding gate for one property.
 *
 * Reads the gate the backend owns (Ready-to-sell + the two monitor steps + the current
 * account binding). No channel traffic: the readiness grade is local and the monitor
 * steps are recorded outcomes, so opening this panel is cheap and safe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionExpiredError } from "@/lib/ensureFreshSession";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchOnboardGate,
  gradeReadyToSell,
  type OnboardGateSnapshot,
} from "@/lib/channelOnboardOrchestrator";

export type GateStepStatus = "pending" | "blocked" | "passed" | "stale" | "unknown";

export interface ChannelOnboardGate {
  snapshot: OnboardGateSnapshot | null;
  loading: boolean;
  grading: boolean;
  error: string | null;
  /** The login token could not be renewed — the operator must sign in again. */
  sessionExpired: boolean;
  readyToSell: boolean;
  readyToSellStatus: GateStepStatus;
  readyToSellBlockers: string[];
  stepAStatus: GateStepStatus;
  stepBStatus: GateStepStatus;
  connected: boolean;
  refresh: () => Promise<void>;
  regrade: () => Promise<boolean>;
}

const statusOf = (
  snapshot: OnboardGateSnapshot | null,
  key: "ready_to_sell" | "monitor_step_a" | "monitor_step_b" | "ready_to_connect",
): GateStepStatus => (snapshot?.steps?.[key]?.status as GateStepStatus | undefined) ?? "pending";

export function useChannelOnboardGate(propertyId: string | null): ChannelOnboardGate {
  const [snapshot, setSnapshot] = useState<OnboardGateSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { loading: authLoading, user } = useAuth();
  // A stale response from a previously selected property must never overwrite the current one.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!propertyId) {
      setSnapshot(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const next = await fetchOnboardGate(propertyId);
      if (id === requestId.current) setSnapshot(next);
    } catch (err) {
      if (id === requestId.current) {
        setSnapshot(null);
        if (err instanceof SessionExpiredError) {
          setSessionExpired(true);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "The onboarding gate could not be read");
        }
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [authLoading, propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // An ungraded property would look "not ready" purely because nobody pressed Re-check.
  // Grading is local and cheap, so do it once per property when no verdict exists yet.
  const gradedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyId || loading || !snapshot || sessionExpired) return;
    const status = snapshot.steps?.ready_to_sell?.status;
    if (status && status !== "pending" && status !== "unknown") return;
    if (gradedFor.current === propertyId) return;
    gradedFor.current = propertyId;
    void regradeRef.current?.();
  }, [loading, propertyId, sessionExpired, snapshot]);

  const regrade = useCallback(async (): Promise<boolean> => {
    if (!propertyId) return false;
    setGrading(true);
    setError(null);
    try {
      const graded = await gradeReadyToSell(propertyId);
      await refresh();
      return graded.ready;
    } catch (err) {
      if (err instanceof SessionExpiredError) setSessionExpired(true);
      else setError(err instanceof Error ? err.message : "Readiness could not be graded");
      return false;
    } finally {
      setGrading(false);
    }
  }, [propertyId, refresh]);

  // Kept in a ref so the auto-grade effect never re-runs just because the callback changed.
  const regradeRef = useRef<(() => Promise<boolean>) | null>(null);
  regradeRef.current = regrade;

  const readyToSellBlockers = useMemo(() => {
    const details = snapshot?.steps?.ready_to_sell?.details as
      | { failing?: Array<{ label?: string; unit?: string | null; detail?: string | null }> }
      | null
      | undefined;
    return (details?.failing ?? []).map((f) =>
      [f.unit, f.detail || f.label].filter(Boolean).join(": "),
    );
  }, [snapshot]);

  const readyToSellStatus = statusOf(snapshot, "ready_to_sell");

  return {
    snapshot,
    loading,
    grading,
    error,
    sessionExpired: sessionExpired || (!authLoading && !user),
    readyToSell: readyToSellStatus === "passed",
    readyToSellStatus,
    readyToSellBlockers,
    stepAStatus: statusOf(snapshot, "monitor_step_a"),
    stepBStatus: statusOf(snapshot, "monitor_step_b"),
    connected: statusOf(snapshot, "ready_to_connect") === "passed",
    refresh,
    regrade,
  };
}
