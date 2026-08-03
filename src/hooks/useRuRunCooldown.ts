import { useCallback, useEffect, useState } from "react";

/** Rentals United tolerates roughly one API call per sliding minute. */
export const RU_RUN_COOLDOWN_SECONDS = 60;

const STORAGE_KEY = "ru_cert_last_run_at";

function readStoredStart(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function remainingFrom(startedAtMs: number | null): number {
  if (!startedAtMs) return 0;
  const elapsed = (Date.now() - startedAtMs) / 1000;
  return Math.max(0, Math.ceil(RU_RUN_COOLDOWN_SECONDS - elapsed));
}

/**
 * Tracks the RU rate-limit cooldown so the UI cannot fire a second certification
 * call inside the 1-per-sliding-minute window. Survives reloads via localStorage
 * and can be seeded from the newest run's `started_at`.
 */
export function useRuRunCooldown() {
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() => readStoredStart());
  const [remaining, setRemaining] = useState<number>(() => remainingFrom(readStoredStart()));

  useEffect(() => {
    setRemaining(remainingFrom(startedAtMs));
    if (!startedAtMs) return;
    const id = window.setInterval(() => {
      const next = remainingFrom(startedAtMs);
      setRemaining(next);
      if (next === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  /** Marks a run as just started (or seeds from a server timestamp). */
  const markRun = useCallback((startedAt?: string | number | null) => {
    const ts = startedAt == null ? Date.now() : typeof startedAt === "number" ? startedAt : new Date(startedAt).getTime();
    if (!Number.isFinite(ts)) return;
    setStartedAtMs((prev) => (prev != null && prev > ts ? prev : ts));
    try {
      localStorage.setItem(STORAGE_KEY, String(ts));
    } catch {
      /* storage unavailable — in-memory cooldown still applies */
    }
  }, []);

  return { cooldownSeconds: remaining, cooling: remaining > 0, markRun };
}
