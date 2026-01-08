import { format } from "date-fns";
import { Copy, AlertTriangle, ExternalLink } from "lucide-react";
import { AuditLog } from "@/pages/AdminAudit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AuditDiffViewer } from "./AuditDiffViewer";

interface AuditLogDetailProps {
  log: AuditLog;
}

export function AuditLogDetail({ log }: AuditLogDetailProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const exportAsJSON = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${log.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Exported as JSON");
  };

  return (
    <div className="space-y-6 pr-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{log.change_summary}</h3>
          <Button variant="outline" size="sm" onClick={exportAsJSON}>
            Export JSON
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(log.created_at), "PPpp")}
        </p>
      </div>

      <Separator />

      {/* Sensitive Data Warning */}
      {log.is_sensitive && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-600">Sensitive Data Redacted</p>
            <p className="text-xs text-muted-foreground">
              Fields redacted: {log.redacted_fields.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Actor Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Actor</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">User Email</p>
            <p className="font-medium">{log.user_email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">User Role</p>
            <Badge variant="outline">{log.user_role}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">IP Address</p>
            <p className="font-mono text-xs">{log.ip_address || "N/A"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Request Origin</p>
            <Badge variant="secondary">{log.request_origin.replace("_", " ")}</Badge>
          </div>
        </div>
        {log.user_agent && (
          <div>
            <p className="text-muted-foreground text-sm">User Agent</p>
            <p className="text-xs font-mono truncate" title={log.user_agent}>
              {log.user_agent}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Action Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Action Details</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Action Type</p>
            <Badge>{log.action_type.replace("_", " ")}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Table</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">{log.table_name}</code>
          </div>
          <div>
            <p className="text-muted-foreground">Record ID</p>
            <div className="flex items-center gap-1">
              <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[120px]">
                {log.record_id}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(log.record_id, "Record ID")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {log.property_id && (
            <div>
              <p className="text-muted-foreground">Property ID</p>
              <code className="text-xs bg-muted px-2 py-1 rounded truncate">
                {log.property_id.slice(0, 8)}...
              </code>
            </div>
          )}
        </div>
        
        {log.edge_function_name && (
          <div>
            <p className="text-muted-foreground text-sm">Edge Function</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">{log.edge_function_name}</code>
          </div>
        )}

        {log.correlation_id && (
          <div>
            <p className="text-muted-foreground text-sm">Correlation ID</p>
            <div className="flex items-center gap-1">
              <code className="text-xs bg-muted px-2 py-1 rounded">{log.correlation_id}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(log.correlation_id!, "Correlation ID")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {log.changed_fields && log.changed_fields.length > 0 && (
          <div>
            <p className="text-muted-foreground text-sm mb-2">Changed Fields</p>
            <div className="flex flex-wrap gap-1">
              {log.changed_fields.map((field) => (
                <Badge key={field} variant="outline" className="text-xs">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Diff Viewer */}
      {(log.old_values || log.new_values) && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Changes</h4>
          <AuditDiffViewer
            oldValues={log.old_values}
            newValues={log.new_values}
            changedFields={log.changed_fields}
          />
        </div>
      )}

      {/* Metadata */}
      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Metadata</h4>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        </>
      )}

      {/* Integrity */}
      {log.immutable_hash && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Integrity</h4>
            <div>
              <p className="text-muted-foreground text-sm">Hash (SHA-256)</p>
              <code className="text-[10px] bg-muted px-2 py-1 rounded block break-all">
                {log.immutable_hash}
              </code>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
