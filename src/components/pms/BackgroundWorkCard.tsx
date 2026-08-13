import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBackgroundJobs } from "@/hooks/useBackgroundJobs";

const JOB_LABELS: Record<string, string> = {
  recalculate_commission: "Commission recalculation",
  channel_ari_delta: "Rates & availability push",
  channel_content_delta: "Content push",
  booking_email: "Guest email",
  booking_sync_status: "Sync status",
};

/**
 * Booking edits, cancellations and moves return as soon as the record is correct and hand the
 * rest — commission, channel pushes, emails — to the background queue. This shows that queue so
 * nothing fails silently after the operator has moved on.
 */
export function BackgroundWorkCard() {
  const { summary, failedJobs, loading, retrying, drain } = useBackgroundJobs();

  const outstanding = summary.pending + summary.running + summary.retrying + summary.failed;
  if (loading && outstanding === 0) return null;
  if (outstanding === 0) return null;

  const handleRetry = async () => {
    try {
      await drain(summary.failed > 0);
      toast.success("Background work pushed through");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run the queue");
    }
  };

  return (
    <Card className={summary.failed > 0 ? "border-destructive/40" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Background work
              {summary.failed > 0 && <Badge variant="destructive">{summary.failed} failed</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">
              Channel pushes, commission and emails that follow a booking change.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRetry} disabled={retrying}>
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{summary.pending} queued</Badge>
          {summary.running > 0 && <Badge variant="secondary">{summary.running} running</Badge>}
          {summary.retrying > 0 && <Badge variant="outline">{summary.retrying} retrying</Badge>}
        </div>
        {failedJobs.length > 0 && (
          <ul className="space-y-1.5">
            {failedJobs.map((job) => (
              <li key={job.id} className="text-xs border rounded-md px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{JOB_LABELS[job.job_type] ?? job.job_type}</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                </div>
                {job.last_error && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2">{job.last_error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
