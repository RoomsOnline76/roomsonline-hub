import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getChannelLabel } from "./ChannelLogo";
import { format } from "date-fns";

interface SyncLogEntry {
  id: string;
  connection_id: string;
  channel_name?: string;
  sync_type: string;
  status: string;
  records_processed: number;
  errors: unknown;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  push_inventory: "Push Inventory",
  pull_reservations: "Pull Reservations",
  push_rates: "Push Rates",
  full_sync: "Full Sync",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  success: "default",
  partial: "secondary",
  failed: "destructive",
};

export function SyncLogTable({ logs }: { logs: SyncLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No sync activity yet.</p>
        <p className="text-xs mt-1">Sync operations will appear here once channels are connected.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Records</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(log.started_at), "MMM d, HH:mm:ss")}
              </TableCell>
              <TableCell className="text-xs">{log.channel_name ? getChannelLabel(log.channel_name) : "—"}</TableCell>
              <TableCell className="text-xs">{SYNC_TYPE_LABELS[log.sync_type] ?? log.sync_type}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[log.status] ?? "secondary"} className="text-[10px]">
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-xs">{log.records_processed}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
