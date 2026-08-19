import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Clock, RefreshCw } from "lucide-react";
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

export function ChannelCallQueuePanel() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ru_call_queue")
      .select("id, action, status, attempts, max_attempts, not_before, created_at, last_error, ru_owner_id")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as QueueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const waiting = list.filter((r) => r.status === "pending" || r.status === "claimed");
    const oldest = waiting.reduce<string | null>(
      (acc, r) => (!acc || r.created_at < acc ? r.created_at : acc),
      null,
    );
    return {
      waiting: waiting.length,
      done: list.filter((r) => r.status === "done").length,
      failed: list.filter((r) => r.status === "failed").length,
      oldest,
    };
  }, [rows]);

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
              </CardTitle>
              <CardDescription>
                Calls held back by the channel's one-per-minute window are queued here and replayed
                automatically — queued work is not an error.
              </CardDescription>
            </button>
          </CollapsibleTrigger>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Waiting" value={stats.waiting} />
              <Stat label="Completed (recent)" value={stats.done} />
              <Stat label="Gave up" value={stats.failed} />
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
