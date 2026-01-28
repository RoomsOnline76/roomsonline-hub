import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

interface TestRun {
  id: string;
  name: string;
  description: string | null;
  feature_target: string;
  scenarios: any[];
  status: string;
  started_at: string | null;
  completed_at: string | null;
  summary: any;
  created_by: string | null;
  created_at: string;
}

interface TestRunHistoryProps {
  runs: TestRun[];
  isLoading: boolean;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onExecuteRun: (id: string) => void;
  isExecuting: boolean;
}

export function TestRunHistory({
  runs,
  isLoading,
  selectedRunId,
  onSelectRun,
  onExecuteRun,
  isExecuting,
}: TestRunHistoryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />;
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (run: TestRun) => {
    if (run.status === "completed" && run.summary) {
      if (run.summary.failed === 0) {
        return <Badge className="bg-green-600">All Passed</Badge>;
      } else {
        return <Badge variant="destructive">{run.summary.failed} Failed</Badge>;
      }
    }
    return (
      <Badge
        variant={
          run.status === "running"
            ? "secondary"
            : run.status === "failed"
            ? "destructive"
            : "outline"
        }
      >
        {run.status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Run History</CardTitle>
        <CardDescription>Previous test runs and their results</CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No test runs yet. Generate scenarios to create your first test run.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Feature</TableHead>
                <TableHead>Scenarios</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow
                  key={run.id}
                  className={`cursor-pointer ${selectedRunId === run.id ? "bg-muted" : ""}`}
                  onClick={() => onSelectRun(run.id)}
                >
                  <TableCell>{getStatusIcon(run.status)}</TableCell>
                  <TableCell className="font-medium">
                    <div>
                      <div>{run.name}</div>
                      {run.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-48">
                          {run.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{run.feature_target}</Badge>
                  </TableCell>
                  <TableCell>{run.scenarios?.length || 0}</TableCell>
                  <TableCell>{getStatusBadge(run)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(run.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExecuteRun(run.id);
                        }}
                        disabled={isExecuting}
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
