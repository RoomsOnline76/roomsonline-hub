import { format } from "date-fns";
import { Eye, MoreHorizontal, AlertTriangle } from "lucide-react";
import { AuditLog } from "@/pages/AdminAudit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AuditLogTableProps {
  logs: AuditLog[];
  onViewDetail: (log: AuditLog) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

const getActionBadgeVariant = (action: string) => {
  switch (action) {
    case "create":
      return "default";
    case "update":
      return "secondary";
    case "delete":
      return "destructive";
    case "permission_change":
      return "outline";
    case "sync":
      return "secondary";
    default:
      return "outline";
  }
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "dev":
      return "destructive";
    case "admin":
      return "default";
    case "owner":
      return "secondary";
    case "system":
      return "outline";
    default:
      return "outline";
  }
};

const getOriginBadgeVariant = (origin: string) => {
  switch (origin) {
    case "admin_ui":
      return "default";
    case "edge_function":
      return "secondary";
    case "db_trigger":
      return "outline";
    case "cron":
      return "secondary";
    default:
      return "outline";
  }
};

export function AuditLogTable({ logs, onViewDetail, onLoadMore, hasMore, loading }: AuditLogTableProps) {
  if (logs.length === 0 && !loading) {
    return (
      <div className="border rounded-lg p-12 text-center text-muted-foreground">
        <p>No audit logs found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead className="max-w-[300px]">Summary</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-mono text-xs">
                {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="text-sm truncate max-w-[180px]">{log.user_email}</span>
                  <Badge variant={getRoleBadgeVariant(log.user_role)} className="w-fit text-[10px]">
                    {log.user_role}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getActionBadgeVariant(log.action_type)}>
                  {log.action_type.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {log.table_name}
                  </code>
                  {log.is_sensitive && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Contains redacted sensitive data
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-[300px]">
                <p className="text-sm truncate" title={log.change_summary}>
                  {log.change_summary}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={getOriginBadgeVariant(log.request_origin)} className="text-[10px]">
                  {log.request_origin.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewDetail(log)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="p-4 border-t flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
