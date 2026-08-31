import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";
import { channelEditGateState } from "@/lib/channelEditGate";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Floating pill that reports how many channel-manager calls are waiting in the queue right now.
 *
 * The channel accepts one push per method per minute, so a save made moments after another is
 * parked and delivered by the background drainer. Rather than a noisy countdown, this pill stays
 * quiet: it shows the live queue count — (0), (1), (9) — and reveals what is actually waiting on
 * hover.
 */

const REFRESH_MS = 5_000;

interface QueueRow {
  id: string;
  action: string;
  status: string;
  not_before: string;
  created_at: string;
  last_error: string | null;
}

interface RuRateGateTimerProps {
  propertyId?: string | null;
  /** Bumped by the editor after a save so the queue re-reads immediately. */
  refreshKey?: number;
  /** Hidden entirely when the listing is not distributed through the channel. */
  enabled?: boolean;
}

export function RuRateGateTimer({ propertyId, refreshKey = 0, enabled = true }: RuRateGateTimerProps) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [linked, setLinked] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The pill only belongs on listings that actually distribute through the channel manager,
  // and only once the property has cleared the Channel onboarding wizard (steps 1–13).
  useEffect(() => {
    if (!propertyId || !enabled) {
      setLinked(false);
      return;
    }
    void (async () => {
      const [{ data }, gate] = await Promise.all([
        supabase
          .from("properties")
          .select("ru_push_enabled, ru_archived")
          .eq("id", propertyId)
          .maybeSingle(),
        channelEditGateState(propertyId),
      ]);
      if (!mounted.current) return;
      setLinked(gate.open && data?.ru_push_enabled === true && data?.ru_archived !== true);
    })();
  }, [propertyId, enabled, refreshKey]);

  const load = useCallback(async () => {
    if (!propertyId || !enabled) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from("ru_call_queue")
      .select("id, action, status, not_before, created_at, last_error")
      .in("status", ["pending", "claimed", "failed"])
      .order("created_at", { ascending: true })
      .limit(20);
    if (error || !mounted.current) return;
    setRows((data ?? []) as QueueRow[]);
  }, [propertyId, enabled]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, refreshKey]);

  const { waiting, failed, detail } = useMemo(() => {
    const waitingRows = rows.filter((r) => r.status === "pending" || r.status === "claimed");
    const failedRows = rows.filter((r) => r.status === "failed");
    const detailLines = waitingRows
      .slice(0, 8)
      .map((r) => `${r.action}${r.status === "claimed" ? " (running)" : ""}`);
    return {
      waiting: waitingRows.length,
      failed: failedRows.length,
      detail: detailLines.join("\n"),
    };
  }, [rows]);

  if (!propertyId || !enabled || !linked) return null;

  const hasItems = waiting > 0 || failed > 0;
  const dotColor = failed > 0
    ? "hsl(var(--destructive))"
    : waiting > 0
      ? "hsl(var(--primary))"
      : "hsl(var(--muted))";

  return (
    <div className="fixed right-6 bottom-40 z-50 hidden sm:block animate-fade-in">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm"
          >
            <span
              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: dotColor }}
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
              ({waiting})
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[16rem] whitespace-pre-line text-xs">
          {hasItems
            ? `${failed > 0 ? `${failed} failed · ` : ""}${waiting} waiting in the ${CHANNEL_MANAGER} queue:\n${detail}${waiting > 8 ? `\n+${waiting - 8} more` : ""}`
            : `${CHANNEL_MANAGER} queue is empty — a save now pushes straight away.`}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
