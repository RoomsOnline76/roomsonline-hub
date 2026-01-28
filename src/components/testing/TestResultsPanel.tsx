import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertCircle, Clock, Download, Copy } from "lucide-react";
import { toast } from "sonner";

interface TestLog {
  id: string;
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  category: string;
  status: string;
  duration_ms: number | null;
  assertions: any[];
  error_message: string | null;
  error_stack: string | null;
  request_data: any;
  response_data: any;
  created_at: string;
}

interface TestResultsPanelProps {
  logs: TestLog[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration_ms: number;
  } | null;
  isLoading: boolean;
}

export function TestResultsPanel({ logs, summary, isLoading }: TestResultsPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const exportToJson = () => {
    const exportData = {
      summary,
      logs: logs.map((log) => ({
        scenario: log.scenario_name,
        category: log.category,
        status: log.status,
        duration_ms: log.duration_ms,
        assertions: log.assertions,
        error: log.error_message,
      })),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-results-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Results exported");
  };

  const copyToClipboard = () => {
    const text = logs
      .map((log) => `${log.status === "pass" ? "✓" : "✗"} ${log.scenario_name}: ${log.status}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "skip":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const passedCount = logs.filter((l) => l.status === "pass").length;
  const failedCount = logs.filter((l) => l.status === "fail").length;
  const skippedCount = logs.filter((l) => l.status === "skip").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            {logs.length} scenarios • {passedCount} passed • {failedCount} failed • {skippedCount} skipped
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyToClipboard}>
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={exportToJson}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-muted rounded-md p-3 text-center">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-md p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
              <div className="text-xs text-muted-foreground">Passed</div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-md p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="bg-muted rounded-md p-3 text-center">
              <div className="text-2xl font-bold">{Math.round(summary.duration_ms / 1000)}s</div>
              <div className="text-xs text-muted-foreground">Duration</div>
            </div>
          </div>
        )}

        {/* Test Logs */}
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No test results yet. Execute the test run to see results.
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {logs.map((log) => (
              <AccordionItem key={log.id} value={log.id} className="border rounded-md px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    {getStatusIcon(log.status)}
                    <div>
                      <div className="font-medium">{log.scenario_name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {log.category}
                        </Badge>
                        {log.duration_ms && <span>{log.duration_ms}ms</span>}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  {/* Assertions */}
                  {log.assertions && log.assertions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Assertions</h4>
                      <div className="space-y-1">
                        {log.assertions.map((assertion: any, idx: number) => (
                          <div
                            key={idx}
                            className={`text-xs p-2 rounded ${
                              assertion.passed
                                ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200"
                                : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              {assertion.passed ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              <span className="font-medium">{assertion.name}</span>
                            </div>
                            {!assertion.passed && (
                              <div className="mt-1 pl-4">
                                <div>Expected: {assertion.expected}</div>
                                <div>Actual: {assertion.actual}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {log.error_message && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-red-600">Error</h4>
                      <pre className="text-xs bg-red-50 dark:bg-red-950 p-3 rounded overflow-x-auto text-red-800 dark:text-red-200">
                        {log.error_message}
                      </pre>
                    </div>
                  )}

                  {/* Request/Response Data */}
                  {(log.request_data || log.response_data) && (
                    <div className="grid grid-cols-2 gap-4">
                      {log.request_data && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Request</h4>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(log.request_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.response_data && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Response</h4>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(log.response_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
