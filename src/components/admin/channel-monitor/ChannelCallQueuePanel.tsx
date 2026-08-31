import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Clock, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


/**
 * Visibility for the shared background call queue.
 *
 * The channel accepts one call per method + parameters per sliding minute. Work that cannot claim a
 * slot is parked here and replayed by the single drainer, so this panel answers "is anything
 * waiting, and how long has it waited?" — the questions a deferral count could never answer.
 */

interface QueueRow {
  id: string;
  action: string;
  status: string;
  attempts: number;
  max_attempts: number;
  not_before: string;
  created_at: string;
  last_error: string | null;
  ru_owner_id: string | null;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  claimed: "bg-sky-100 text-sky-900 border-sky-300",
  done: "bg-emerald-100 text-emerald-900 border-emerald-300",
  // Terminal but not a defect: the channel said the work was already unnecessary.
  no_op: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
};

/** All-time totals per status — the recent-row window cannot answer "how many gave up ever?". */
interface QueueTotals {
  waiting: number;
  failed: number;
  terminal: number;
}

const TERMINAL_STATUSES = ["failed", "no_op", "superseded", "completed", "done"] as const;

export function ChannelCallQueuePanel() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [totals, setTotals] = useState<QueueTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const countFor = (statuses: readonly string[]) =>
      supabase
        .from("ru_call_queue")
        .select("id", { count: "exact", head: true })
        .in("status", statuses as string[]);

    const [feed, waiting, failed, terminal] = await Promise.all([
      supabase
        .from("ru_call_queue")
        .select("id, action, status, attempts, max_attempts, not_before, created_at, last_error, ru_owner_id")
        .order("created_at", { ascending: false })
        .limit(50),
      countFor(["pending", "claimed"]),
      countFor(["failed"]),
      countFor(TERMINAL_STATUSES),
    ]);

    setRows((feed.data ?? []) as QueueRow[]);
    setTotals({
      waiting: waiting.count ?? 0,
      failed: failed.count ?? 0,
      terminal: terminal.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const purge = useCallback(async () => {
    setPurging(true);
    const { data, error } = await supabase.rpc("purge_ru_call_queue_terminal", {
      _statuses: [...TERMINAL_STATUSES],
      _older_than_minutes: 0,
    });
    setPurging(false);
    if (error) {
      toast.error("Could not clear the queue history", { description: error.message });
      return;
    }
    toast.success(`Cleared ${Number(data ?? 0)} finished queue entries`);
    await load();
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const waiting = list.filter((r) => r.status === "pending" || r.status === "claimed");
    const oldest = waiting.reduce<string | null>(
      (acc, r) => (!acc || r.created_at < acc ? r.created_at : acc),
      null,
    );
    return {
      waiting: totals?.waiting ?? waiting.length,
      failed: totals?.failed ?? list.filter((r) => r.status === "failed").length,
      terminal: totals?.terminal ?? 0,
      oldest,
    };
  }, [rows, totals]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CollapsibleTrigger asChild>
            <button type="button" className="text-left">
              <CardTitle className="flex items-center gap-2 text-base">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Clock className="h-4 w-4" />
                Background call queue
                {!open && stats.waiting > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.waiting} waiting</Badge>
                )}
                {!open && stats.failed > 0 && (
                  <Badge variant="outline" className="ml-1 border-destructive/40 bg-destructive/10 text-destructive">
                    {stats.failed} gave up
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Calls held back by the channel's one-per-minute window are queued here and replayed
                automatically — queued work is not an error. Counts are all-time; the table below shows
                the 50 most recent entries.
              </CardDescription>
            </button>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void purge()}
              disabled={purging || loading || stats.terminal === 0}
              title="Deletes finished, skipped and gave-up entries. Waiting work is never touched."
            >
              <Trash2 className={`mr-2 h-4 w-4 ${purging ? "animate-pulse" : ""}`} />
              Purge history ({stats.terminal})
            </Button>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Waiting" value={stats.waiting} />
              <Stat label="Finished (all-time)" value={stats.terminal} />
              <Stat label="Gave up (all-time)" value={stats.failed} />
              <Stat
                label="Oldest waiting"
                value={stats.oldest ? formatDistanceToNow(new Date(stats.oldest), { addSuffix: false }) : "—"}
              />
            </div>


            {rows === null ? (
              <Skeleton className="h-40 w-full" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue is empty — every channel call is running on demand.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Call</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Next run</TableHead>
                      <TableHead>Last message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">
                          {row.action}
                          {row.ru_owner_id ? <span className="text-muted-foreground"> · {row.ru_owner_id}</span> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_TONE[row.status] ?? ""}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.attempts}/{row.max_attempts}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(row.not_before), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="max-w-[24rem] truncate text-xs text-muted-foreground">
                          {row.last_error ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
