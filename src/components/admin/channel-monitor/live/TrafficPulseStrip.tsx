import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { RuQueueDepth, RuTrafficPulseWindow } from "@/hooks/useRuLiveTraffic";

/**
 * Throughput at three horizons plus the throttle queue depth: the numbers that tell an engineer
 * whether the channel link is busy, slow, or backing up.
 */

const WINDOW_LABEL: Record<number, string> = { 1: "last minute", 5: "last 5 min", 60: "last hour" };

function kb(value: number): string {
  if (!value) return "0";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  pulse: RuTrafficPulseWindow[];
  queue: RuQueueDepth | null;
}

export function TrafficPulseStrip({ pulse, queue }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {pulse.map((window) => (
        <div key={window.windowMinutes} className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {WINDOW_LABEL[window.windowMinutes] ?? `last ${window.windowMinutes} min`}
          </p>
          <p className="text-xl font-semibold">{window.calls}</p>
          <p className="text-xs text-muted-foreground">
            {window.ok} delivered · {window.failed} failed · {window.deferred} throttled
            {window.inbound ? ` · ${window.inbound} inbound` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            p50 {window.p50Ms} ms · p95 {window.p95Ms} ms · {kb(window.reqBytes + window.resBytes)}
          </p>
        </div>
      ))}
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Throttle queue</p>
        <p className="text-xl font-semibold">{queue ? queue.pending : "—"}</p>
        <p className="text-xs text-muted-foreground">
          {queue ? `${queue.claimed} in flight · ${queue.failed} failed` : "loading"}
        </p>
        {queue?.nextAt ? (
          <Badge variant="outline" className="mt-1 text-[11px]">
            next replay {formatDistanceToNow(new Date(queue.nextAt), { addSuffix: true })}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
