import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REPORT_EVENT_LABEL,
  useReportRunEvents,
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

interface RunEventTimelineProps {
  runId: string | undefined;
  /** Poll while the run is processing so progress appears without a reload. */
  isLive?: boolean;
}

/** Append-only audit trail for a run. */
export function RunEventTimeline({ runId, isLive = false }: RunEventTimelineProps) {
  const { events, isLoading } = useReportRunEvents(runId, isLive);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          <ol className="space-y-3">
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
      </CardContent>
    </Card>
  );
}
