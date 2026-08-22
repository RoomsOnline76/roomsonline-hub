import { useMemo, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  REPORT_EVENT_LABEL,
  useReportRunEvents,
  type ReportRunEvent,
  type ReportRunEventType,
} from "@/hooks/useReportRunEvents";

const TONE: Partial<Record<ReportRunEventType, string>> = {
  processing_failed: "bg-destructive",
  processing_partial: "bg-destructive",
  processing_succeeded: "bg-primary",
  run_deleted: "bg-destructive",
};

const formatStamp = (iso: string): string =>
  new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** "1 h 12 m" / "4 m" / "38 s" — durations read at a glance, not to the second. */
const formatSpan = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
};

const at = (events: ReportRunEvent[], type: ReportRunEventType, last = false): number | null => {
  const matches = events.filter((event) => event.eventType === type);
  const pick = last ? matches[0] : matches[matches.length - 1];
  return pick ? new Date(pick.createdAt).getTime() : null;
};

interface RunEventTimelineProps {
  runId: string | undefined;
  /** Poll while the run is processing so progress appears without a reload. */
  isLive?: boolean;
}

/** Append-only audit trail for a run. Collapsed by default, with a time summary. */
export function RunEventTimeline({ runId, isLive = false }: RunEventTimelineProps) {
  const { events, isLoading } = useReportRunEvents(runId, isLive);
  const [open, setOpen] = useState(false);

  // Events arrive newest-first.
  const summary = useMemo(() => {
    const created = at(events, "run_created");
    const uploaded = at(events, "files_uploaded", true);
    const processed = at(events, "processing_succeeded", true);
    const draft = at(events, "draft_generated", true);
    const inputs = at(events, "inputs_updated", true);

    const acquisition = created && uploaded ? uploaded - created : null;
    const processing = uploaded && processed ? processed - uploaded : null;
    const slides = processed && (draft ?? inputs) ? (draft ?? inputs)! - processed : null;

    return {
      created,
      draft,
      rows: [
        { label: "Data acquisition", value: acquisition },
        { label: "Processing", value: processing },
        { label: "Slides & ordering", value: slides },
      ],
    };
  }, [events]);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <History className="h-4 w-4 text-muted-foreground" />
              Activity
              <span className="text-xs font-normal text-muted-foreground">
                {events.length} entr{events.length === 1 ? "y" : "ies"}
              </span>
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Run created</p>
              <p className="text-sm font-medium">
                {summary.created ? formatStamp(new Date(summary.created).toISOString()) : "—"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Draft report</p>
              <p className="text-sm font-medium">
                {summary.draft ? formatStamp(new Date(summary.draft).toISOString()) : "—"}
              </p>
            </div>
            {summary.rows.map((row) => (
              <div key={row.label} className="space-y-0.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                <p className="text-sm font-medium tabular-nums">{formatSpan(row.value ?? 0)}</p>
              </div>
            ))}
          </div>

          <CollapsibleContent className="space-y-3">
            {isLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            )}

            {!isLoading && events.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing recorded yet — activity appears as the run is processed.
              </p>
            )}

            {events.length > 0 && (
              <ol className="space-y-3 border-t pt-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        TONE[event.eventType] ?? "bg-muted-foreground"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {REPORT_EVENT_LABEL[event.eventType] ?? event.eventType}
                      </p>
                      {event.message && (
                        <p className="text-muted-foreground break-words">{event.message}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatStamp(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
