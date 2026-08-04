import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScenarioGenerator } from "@/components/testing/ScenarioGenerator";
import { TestResultsPanel } from "@/components/testing/TestResultsPanel";
import { TestRunHistory } from "@/components/testing/TestRunHistory";
import { Play, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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

export default function DevTesting() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("generate");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Fetch test runs
  const { data: testRuns, isLoading: runsLoading } = useQuery({
    queryKey: ["test-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as TestRun[];
    },
  });

  // Fetch logs for selected run
  const { data: testLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["test-logs", selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return [];
      const { data, error } = await supabase
        .from("test_logs")
        .select("*")
        .eq("run_id", selectedRunId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Cast to expected format
      return (data || []).map((log) => ({
        ...log,
        assertions: Array.isArray(log.assertions) ? log.assertions : [],
        duration_ms: log.duration_ms ?? null,
        error_message: log.error_message ?? null,
        error_stack: log.error_stack ?? null,
        request_data: log.request_data,
        response_data: log.response_data,
      }));
    },
    enabled: !!selectedRunId,
  });

  // Execute test run mutation
  const executeRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.functions.invoke("execute-test-run", {
        body: { runId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Test run completed");
      queryClient.invalidateQueries({ queryKey: ["test-runs"] });
      queryClient.invalidateQueries({ queryKey: ["test-logs"] });
    },
    onError: (error) => {
      toast.error(`Test execution failed: ${error.message}`);
    },
  });

  const handleRunCreated = (runId: string) => {
    setSelectedRunId(runId);
    setActiveTab("results");
    queryClient.invalidateQueries({ queryKey: ["test-runs"] });
  };

  const handleExecuteRun = (runId: string) => {
    executeRunMutation.mutate(runId);
  };

  const selectedRun = testRuns?.find((r) => r.id === selectedRunId);

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="TOBI-Assisted Testing"
          subtitle="Generate and execute test scenarios with TOBI"
        />

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Runs</CardDescription>
              <CardTitle className="text-2xl">{testRuns?.length || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Passed</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {testRuns?.filter((r) => r.status === "completed" && r.summary?.failed === 0).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-2xl text-red-600">
                {testRuns?.filter((r) => r.status === "failed" || (r.summary?.failed > 0)).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Running</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">
                {testRuns?.filter((r) => r.status === "running").length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="generate">Generate Scenarios</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="history">Run History</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-4">
            <ScenarioGenerator onRunCreated={handleRunCreated} />
          </TabsContent>

          <TabsContent value="results" className="space-y-4">
            {selectedRun ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {selectedRun.name}
                        <Badge
                          variant={
                            selectedRun.status === "completed"
                              ? "default"
                              : selectedRun.status === "failed"
                              ? "destructive"
                              : selectedRun.status === "running"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {selectedRun.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Target: {selectedRun.feature_target} • {selectedRun.scenarios?.length || 0} scenarios
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ["test-logs", selectedRunId] })}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                      {selectedRun.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleExecuteRun(selectedRun.id)}
                          disabled={executeRunMutation.isPending}
                        >
                          {executeRunMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Execute
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                <TestResultsPanel
                  logs={testLogs || []}
                  summary={selectedRun.summary}
                  isLoading={logsLoading}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a test run from history or generate new scenarios
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <TestRunHistory
              runs={testRuns || []}
              isLoading={runsLoading}
              selectedRunId={selectedRunId}
              onSelectRun={(id) => {
                setSelectedRunId(id);
                setActiveTab("results");
              }}
              onExecuteRun={handleExecuteRun}
              isExecuting={executeRunMutation.isPending}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
