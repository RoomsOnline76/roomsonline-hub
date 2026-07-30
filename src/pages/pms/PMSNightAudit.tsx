import { useState } from "react";

import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { useNightAuditLog, useTriggerNightAudit, type NightAuditLogEntry } from "@/hooks/useNightAuditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Moon, Play, CheckCircle2, XCircle, Clock, ChevronDown, DollarSign, BedDouble, Receipt, Sparkles } from "lucide-react";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-500/10 text-success border-success-border"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "running":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "error") return <XCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

function AuditRow({ entry }: { entry: NightAuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const tasks = entry.tasks_json || [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(!open)}>
        <TableCell className="font-medium">{format(new Date(entry.audit_date + "T00:00:00"), "dd MMM yyyy")}</TableCell>
        <TableCell><StatusBadge status={entry.status} /></TableCell>
        <TableCell className="text-right font-mono">{entry.charges_posted}</TableCell>
        <TableCell className="text-right font-mono">R {entry.revenue_total?.toFixed(2) || "0.00"}</TableCell>
        <TableCell className="text-right font-mono">R {entry.tax_posted?.toFixed(2) || "0.00"}</TableCell>
        <TableCell className="text-right font-mono">{entry.rooms_rolled}</TableCell>
        <TableCell className="text-right font-mono">{entry.folios_closed}</TableCell>
        <TableCell>
          {entry.started_at ? format(new Date(entry.started_at), "HH:mm:ss") : "—"}
        </TableCell>
        <TableCell>
          <CollapsibleTrigger asChild>
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            {entry.error_message && (
              <div className="text-sm text-destructive mb-3 p-2 bg-destructive/10 rounded">
                {entry.error_message}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-background border">
                  <TaskStatusIcon status={task.status} />
                  <span className="font-medium capitalize">{task.task.replace(/_/g, " ")}</span>
                  {task.count !== undefined && <span className="text-muted-foreground">({task.count})</span>}
                  {task.amount !== undefined && <span className="text-muted-foreground">R {task.amount.toFixed(2)}</span>}
                  {task.details && <span className="text-muted-foreground text-xs ml-auto">{task.details}</span>}
                </div>
              ))}
            </div>
            {entry.completed_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Duration: {Math.round((new Date(entry.completed_at).getTime() - new Date(entry.started_at).getTime()) / 1000)}s
              </p>
            )}
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function PMSNightAudit() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const { data: logs, isLoading } = useNightAuditLog(propertyId);
  const triggerAudit = useTriggerNightAudit(propertyId);

  const lastCompleted = logs?.find((l) => l.status === "completed");

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Moon className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Night Audit</h2>
            <p className="text-sm text-muted-foreground">Automated nightly charge posting, housekeeping roll & metrics calculation</p>
          </div>
        </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Last Revenue</p>
              <p className="text-lg font-bold">R {lastCompleted?.revenue_total?.toFixed(2) || "0.00"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Receipt className="w-5 h-5 text-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Last Charges</p>
              <p className="text-lg font-bold">{lastCompleted?.charges_posted || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><BedDouble className="w-5 h-5 text-info" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Rooms Rolled</p>
              <p className="text-lg font-bold">{lastCompleted?.rooms_rolled || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Sparkles className="w-5 h-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Folios Closed</p>
              <p className="text-lg font-bold">{lastCompleted?.folios_closed || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Trigger */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Audit History</h3>
        <Button
          onClick={() => triggerAudit.mutate()}
          disabled={triggerAudit.isPending}
          variant="outline"
          size="sm"
        >
          <Play className="w-4 h-4 mr-2" />
          {triggerAudit.isPending ? "Running..." : "Manual Trigger"}
        </Button>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Rooms</TableHead>
                <TableHead className="text-right">Folios</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading audit history...</TableCell>
                </TableRow>
              ) : !logs?.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Moon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No audit runs yet</p>
                    <p className="text-xs text-muted-foreground">The night audit runs automatically at midnight, or trigger it manually above.</p>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((entry) => <AuditRow key={entry.id} entry={entry} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </>
  );
}
