import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RU_ENDPOINT_LIBRARY,
  resolveRuEndpoint,
  type RuEndpointFamily,
} from "@/config/ruEndpointLibrary";

/**
 * Live channel traffic feed.
 *
 * The exchange log panel answers "what happened" after the fact; this hook answers "what is
 * happening right now". New `ru_api_log` rows arrive over realtime with their payloads attached, so
 * the monitor can show the outbound request and the inbound response side by side as they land,
 * while the windowed aggregates come from database helpers (the retained window is far too large to
 * roll up in the browser).
 */

export interface RuLiveTrafficRow {
  id: string;
  created_at: string;
  action: string;
  parent_action: string | null;
  trace_id: string | null;
  direction: string;
  property_id: string | null;
  ru_property_id: string | null;
  ru_owner_id: string | null;
  response_id: string | null;
  status_id: string | null;
  status_message: string | null;
  http_status: number | null;
  success: boolean;
  elapsed_ms: number | null;
  error_message: string | null;
  request_bytes: number | null;
  response_bytes: number | null;
  transport_status: string | null;
  request_xml: string | null;
  response_xml: string | null;
}

export interface RuEndpointCounter {
  action: string;
  direction: string;
  total: number;
  ok: number;
  failed: number;
  deferred: number;
  avgMs: number;
  p95Ms: number;
  lastAt: string | null;
  reqBytes: number;
  resBytes: number;
  /** Registered in the endpoint library? An unregistered verb is a review signal. */
  registered: boolean;
  family: RuEndpointFamily | null;
  label: string;
}

export interface RuTrafficPulseWindow {
  windowMinutes: number;
  calls: number;
  ok: number;
  failed: number;
  deferred: number;
  inbound: number;
  p50Ms: number;
  p95Ms: number;
  reqBytes: number;
  resBytes: number;
}

export interface RuQueueDepth {
  pending: number;
  claimed: number;
  failed: number;
  nextAt: string | null;
}

const FEED_LIMIT = 120;
const FEED_COLUMNS =
  "id, created_at, action, parent_action, trace_id, direction, property_id, ru_property_id, ru_owner_id, response_id, status_id, status_message, http_status, success, elapsed_ms, error_message, request_bytes, response_bytes, transport_status, request_xml, response_xml";

type RpcCall = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

interface EndpointStatsRow {
  action: string;
  direction: string;
  total: number | string;
  ok: number | string;
  failed: number | string;
  deferred: number | string;
  avg_ms: number | null;
  p95_ms: number | null;
  last_at: string | null;
  req_bytes: number | string | null;
  res_bytes: number | string | null;
}

interface PulseRow {
  window_minutes: number;
  calls: number | string;
  ok: number | string;
  failed: number | string;
  deferred: number | string;
  inbound: number | string;
  p50_ms: number | null;
  p95_ms: number | null;
  req_bytes: number | string | null;
  res_bytes: number | string | null;
}

const num = (value: number | string | null | undefined): number => Number(value ?? 0) || 0;

export interface UseRuLiveTrafficOptions {
  /** Rolling window for the endpoint counter table. */
  hours?: number;
  /** Aggregate refresh cadence in ms. */
  refreshMs?: number;
}

export function useRuLiveTraffic({ hours = 24, refreshMs = 15_000 }: UseRuLiveTrafficOptions = {}) {
  const [rows, setRows] = useState<RuLiveTrafficRow[]>([]);
  const [counters, setCounters] = useState<RuEndpointCounter[]>([]);
  const [pulse, setPulse] = useState<RuTrafficPulseWindow[]>([]);
  const [queue, setQueue] = useState<RuQueueDepth | null>(null);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const loadFeed = useCallback(async () => {
    const { data, error: feedError } = await supabase
      .from("ru_api_log")
      .select(FEED_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<RuLiveTrafficRow[]>();
    if (feedError) {
      setError(feedError.message);
      return;
    }
    setRows(data ?? []);
  }, []);

  const loadAggregates = useCallback(async () => {
    const rpc = supabase.rpc as unknown as RpcCall;
    const [stats, pulseResult, queueResult] = await Promise.all([
      rpc("ru_api_log_endpoint_stats", { _hours: hours }),
      rpc("ru_api_log_traffic_pulse"),
      supabase
        .from("ru_call_queue")
        .select("status, not_before")
        .in("status", ["pending", "claimed", "failed"])
        .order("not_before", { ascending: true })
        .limit(500),
    ]);

    if (!stats.error) {
      const statRows = (stats.data ?? []) as EndpointStatsRow[];
      const seen = new Set(statRows.map((r) => r.action));
      const mapped: RuEndpointCounter[] = statRows.map((row) => {
        const entry = resolveRuEndpoint(row.action);
        return {
          action: row.action,
          direction: row.direction,
          total: num(row.total),
          ok: num(row.ok),
          failed: num(row.failed),
          deferred: num(row.deferred),
          avgMs: num(row.avg_ms),
          p95Ms: num(row.p95_ms),
          lastAt: row.last_at,
          reqBytes: num(row.req_bytes),
          resBytes: num(row.res_bytes),
          registered: !!entry,
          family: entry?.family ?? null,
          label: entry?.label ?? row.action,
        };
      });
      // Every implemented verb stays visible at zero: silence on a scheduled endpoint is itself
      // a finding, and it can only be spotted if the row exists.
      for (const entry of RU_ENDPOINT_LIBRARY) {
        if (seen.has(entry.id)) continue;
        mapped.push({
          action: entry.id,
          direction: entry.direction,
          total: 0,
          ok: 0,
          failed: 0,
          deferred: 0,
          avgMs: 0,
          p95Ms: 0,
          lastAt: null,
          reqBytes: 0,
          resBytes: 0,
          registered: true,
          family: entry.family,
          label: entry.label,
        });
      }
      mapped.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
      setCounters(mapped);
    }

    if (!pulseResult.error) {
      setPulse(
        ((pulseResult.data ?? []) as PulseRow[]).map((row) => ({
          windowMinutes: Number(row.window_minutes),
          calls: num(row.calls),
          ok: num(row.ok),
          failed: num(row.failed),
          deferred: num(row.deferred),
          inbound: num(row.inbound),
          p50Ms: num(row.p50_ms),
          p95Ms: num(row.p95_ms),
          reqBytes: num(row.req_bytes),
          resBytes: num(row.res_bytes),
        })),
      );
    }

    if (!queueResult.error) {
      const queueRows = (queueResult.data ?? []) as { status: string; not_before: string }[];
      setQueue({
        pending: queueRows.filter((r) => r.status === "pending").length,
        claimed: queueRows.filter((r) => r.status === "claimed").length,
        failed: queueRows.filter((r) => r.status === "failed").length,
        nextAt: queueRows.find((r) => r.status === "pending")?.not_before ?? null,
      });
    }

    if (stats.error) setError(stats.error.message);
  }, [hours]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([loadFeed(), loadAggregates()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFeed, loadAggregates]);

  /** Realtime insert stream — the feed itself. */
  useEffect(() => {
    const channel = supabase
      .channel("ru-live-traffic")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ru_api_log" },
        (payload) => {
          setLastEventAt(new Date().toISOString());
          if (pausedRef.current) return;
          const row = payload.new as RuLiveTrafficRow;
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev].slice(0, FEED_LIMIT);
          });
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  /** Aggregates are polled: percentiles and byte totals cannot be derived from the live feed. */
  useEffect(() => {
    if (refreshMs <= 0) return;
    const timer = window.setInterval(() => {
      if (!pausedRef.current) void loadAggregates();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [loadAggregates, refreshMs]);

  const unregistered = useMemo(
    () => counters.filter((c) => !c.registered && c.total > 0),
    [counters],
  );

  const refresh = useCallback(async () => {
    await Promise.all([loadFeed(), loadAggregates()]);
  }, [loadFeed, loadAggregates]);

  return {
    rows,
    counters,
    pulse,
    queue,
    unregistered,
    connected,
    paused,
    setPaused,
    loading,
    error,
    lastEventAt,
    refresh,
    clear: useCallback(() => setRows([]), []),
  };
}
