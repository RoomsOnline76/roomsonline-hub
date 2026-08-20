import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Quiet countdown for the channel manager's sliding-minute push gate.
 *
 * The channel accepts one push per method per minute, so a save made moments after another one is
 * parked and delivered by the background drainer. This pill makes that wait visible without
 * shouting: it reads the per-section gate state from `ru_push_gate_status` and ticks locally.
 */

const WINDOW_SECONDS = 60;
const REFRESH_MS = 15_000;

type Section = "content" | "rates";

interface GateRow {
  section: string;
  last_called_at: string | null;
  wait_seconds: number | null;
}

interface GateState {
  section: Section;
  /** Absolute epoch ms at which the next push is allowed. */
  readyAt: number;
}

const SECTION_LABEL: Record<Section, string> = {
  content: "content",
  rates: "rates & availability",
};

interface RuRateGateTimerProps {
  propertyId?: string | null;
  /** Bumped by the editor after a save so the gate re-reads immediately. */
  refreshKey?: number;
  /** Hidden entirely when the listing is not distributed through the channel. */
  enabled?: boolean;
}

export function RuRateGateTimer({ propertyId, refreshKey = 0, enabled = true }: RuRateGateTimerProps) {
  const [gates, setGates] = useState<GateState[]>([]);
  const [linked, setLinked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The pill only belongs on listings that actually distribute through the channel manager.
  useEffect(() => {
    if (!propertyId || !enabled) {
      setLinked(false);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("properties")
        .select("ru_push_enabled, ru_archived")
        .eq("id", propertyId)
        .maybeSingle();
      if (!mounted.current) return;
      setLinked(data?.ru_push_enabled === true && data?.ru_archived !== true);
    })();
  }, [propertyId, enabled]);

  const load = useCallback(async () => {
    if (!propertyId || !enabled) {
      setGates([]);
      return;
    }
    const { data, error } = await supabase.rpc("ru_push_gate_status", { _property_id: propertyId });
    if (error || !mounted.current) return;
    const rows = (data ?? []) as GateRow[];
    setGates(
      rows
        .filter((r) => r.section === "content" || r.section === "rates")
        .map((r) => ({
          section: r.section as Section,
          readyAt: Date.now() + Math.max(0, Math.min(WINDOW_SECONDS, Number(r.wait_seconds ?? 0))) * 1000,
        }))
        .filter((g) => g.readyAt > Date.now()),
    );
  }, [propertyId, enabled]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, refreshKey]);

  // Local tick keeps the countdown smooth without polling the backend every second.
  useEffect(() => {
    if (gates.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [gates.length]);

  const active = useMemo(
    () =>
      gates
        .map((g) => ({ ...g, remaining: Math.max(0, Math.ceil((g.readyAt - now) / 1000)) }))
        .filter((g) => g.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining),
    [gates, now],
  );

  if (!propertyId || !enabled || !linked) return null;

  const lead = active[0];
  const held = active.length > 0;
  // Idle shows a complete, muted ring so the pill stays present rather than blinking in and out.
  const pct = held ? Math.min(100, Math.max(0, ((WINDOW_SECONDS - lead.remaining) / WINDOW_SECONDS) * 100)) : 100;
  const detail = active.map((g) => `${SECTION_LABEL[g.section]} ${g.remaining}s`).join(" · ");

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
              className="relative inline-flex h-4 w-4 shrink-0 rounded-full"
              style={{
                background: held
                  ? `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}% 100%)`
                  : "hsl(var(--muted))",
              }}
              aria-hidden="true"
            >
              <span className="absolute inset-[3px] rounded-full bg-card" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
              {held ? `Next push in ${lead.remaining}s` : "Push window open"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[15rem] text-xs">
          {CHANNEL_MANAGER} accepts one update per minute. Held: {detail}. Saves made now are queued and
          delivered automatically.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
