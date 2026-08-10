import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  RefreshCw, Activity, Clock, AlertTriangle, CheckCircle2, XCircle,
  Download, Timer, ChevronDown, ChevronRight, PauseCircle, Mail
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ComponentHealthCard } from "@/components/health/ComponentHealthCard";
import { HealthStatusBadge } from "@/components/health/HealthStatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ComponentType = 'all' | 'pms' | 'internal' | 'external' | 'infrastructure';
type TimeRange = '1h' | '24h' | '7d' | '30d';

interface Component {
  id: string;
  component_key: string;
  component_name: string;
  component_type: string;
  is_critical: boolean;
  expected_latency_ms: number;
  is_active: boolean;
}

interface HealthCheck {
  id: string;
  component_key: string;
  status: string;
  latency_ms: number;
  error_code: string | null;
  error_message: string | null;
  checked_at: string;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export function ComponentHealthTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<ComponentType>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['health-checks'] });
      queryClient.invalidateQueries({ queryKey: ['health-components'] });
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, queryClient]);

  const { data: components, isLoading: componentsLoading } = useQuery({
    queryKey: ['health-components'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health_components')
        .select('*')
        .order('is_active', { ascending: false })
        .order('component_type', { ascending: true });
      if (error) throw error;
      return data as Component[];
    },
  });

  const timeRangeStart = useMemo(() => {
    const now = new Date();
    switch (timeRange) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  }, [timeRange]);

  const { data: healthChecks, isLoading: checksLoading } = useQuery({
    queryKey: ['health-checks', timeRangeStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health_checks')
        .select('*')
        .gte('checked_at', timeRangeStart)
        .order('checked_at', { ascending: false });
      if (error) throw error;
      return data as HealthCheck[];
    },
  });

  const runHealthCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('system-health-check');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Health Check Complete", description: `Status: ${data.overall_status}. ${data.summary?.healthy || 0} healthy, ${data.summary?.failed || 0} failed.` });
      queryClient.invalidateQueries({ queryKey: ['health-checks'] });
    },
    onError: (error) => {
      toast({ title: "Health Check Failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    },
  });

  const sendEmailReport = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-health-report');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Email Report Sent", description: data?.message || "Health report email sent successfully." });
    },
    onError: (error) => {
      toast({ title: "Email Failed", description: error instanceof Error ? error.message : "Failed to send report", variant: "destructive" });
    },
  });

  const componentStats = useMemo(() => {
    if (!components || !healthChecks) return {};
    const stats: Record<string, { lastStatus: string; lastChecked: string; avgLatency: number; uptimePercentage: number; failureCount: number; recentChecks: HealthCheck[] }> = {};

    components.forEach(comp => {
      if (comp.component_key === 'nightsbridge') {
        stats[comp.component_key] = { lastStatus: 'healthy', lastChecked: 'Iframe-based', avgLatency: 0, uptimePercentage: 100, failureCount: 0, recentChecks: [] };
        return;
      }
      const checks = healthChecks.filter(c => c.component_key === comp.component_key);
      const healthyChecks = checks.filter(c => c.status === 'healthy').length;
      const degradedChecks = checks.filter(c => c.status === 'degraded').length;
      const failedChecks = checks.filter(c => c.status === 'failed').length;
      const latencies = checks.filter(c => c.latency_ms).map(c => c.latency_ms);
      const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
      const lastCheck = checks[0];
      // Unverifiable checks (e.g. browser-restricted API keys) are not outages — exclude them
      // from the uptime denominator instead of counting them as downtime.
      const gradedChecks = healthyChecks + degradedChecks + failedChecks;
      const uptime = gradedChecks > 0 ? ((healthyChecks + degradedChecks) / gradedChecks) * 100 : 100;

      stats[comp.component_key] = {
        lastStatus: lastCheck?.status || 'unknown',
        lastChecked: lastCheck ? formatTimeAgo(new Date(lastCheck.checked_at)) : 'Never',
        avgLatency, uptimePercentage: uptime, failureCount: failedChecks,
        recentChecks: checks.slice(0, 50),
      };
    });
    return stats;
  }, [components, healthChecks]);

  const overallStats = useMemo(() => {
    if (!components || !componentStats) return { healthy: 0, degraded: 0, failed: 0, unknown: 0, uptime: 0, avgLatency: 0, activeCount: 0 };
    const activeComponents = components.filter(c => c.is_active);
    let healthy = 0, degraded = 0, failed = 0, unknown = 0, totalUptime = 0, totalLatency = 0, latencyCount = 0;

    activeComponents.forEach(comp => {
      const stat = componentStats[comp.component_key];
      if (!stat) { unknown++; return; }
      if (stat.lastStatus === 'healthy') healthy++;
      else if (stat.lastStatus === 'degraded') degraded++;
      else if (stat.lastStatus === 'failed') failed++;
      else unknown++;
      totalUptime += stat.uptimePercentage;
      if (stat.avgLatency > 0) { totalLatency += stat.avgLatency; latencyCount++; }
    });

    return {
      healthy, degraded, failed, unknown,
      uptime: activeComponents.length > 0 ? totalUptime / activeComponents.length : 0,
      avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
      activeCount: activeComponents.length,
    };
  }, [components, componentStats]);

  const { activeComponents, inactiveComponents } = useMemo(() => {
    if (!components) return { activeComponents: [], inactiveComponents: [] };
    const filtered = selectedType === 'all' ? components : components.filter(c => c.component_type === selectedType);
    return { activeComponents: filtered.filter(c => c.is_active), inactiveComponents: filtered.filter(c => !c.is_active) };
  }, [components, selectedType]);

  const lastCheckTime = useMemo(() => {
    if (!healthChecks || healthChecks.length === 0) return null;
    return new Date(healthChecks[0].checked_at);
  }, [healthChecks]);

  const exportToCsv = () => {
    if (!components || !componentStats) return;
    const rows = [
      ['Component', 'Type', 'Critical', 'Status', 'Avg Latency (ms)', 'Uptime (%)', 'Failures', 'Last Checked'],
      ...components.map(comp => {
        const stats = componentStats[comp.component_key];
        return [comp.component_name, comp.component_type, comp.is_critical ? 'Yes' : 'No', stats?.lastStatus || 'unknown', stats?.avgLatency || 0, (stats?.uptimePercentage || 0).toFixed(2), stats?.failureCount || 0, stats?.lastChecked || 'Never'];
      }),
    ];
    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = componentsLoading || checksLoading;

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last checked: {lastCheckTime ? formatTimeAgo(lastCheckTime) : 'Never'}</span>
          <span className="text-muted-foreground/50">•</span>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={cn("flex items-center gap-1.5 hover:text-foreground transition-colors", autoRefresh && "text-green-600 dark:text-green-400")}>
            <span className={cn("h-2 w-2 rounded-full", autoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
            Auto-refresh: {autoRefresh ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToCsv} disabled={isLoading}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendEmailReport.mutate()} disabled={sendEmailReport.isPending}>
            <Mail className={cn("h-4 w-4 mr-2", sendEmailReport.isPending && "animate-spin")} />
            {sendEmailReport.isPending ? 'Sending...' : 'Send Report'}
          </Button>
          <Button onClick={() => runHealthCheck.mutate()} disabled={runHealthCheck.isPending}>
            <RefreshCw className={cn("h-4 w-4 mr-2", runHealthCheck.isPending && "animate-spin")} />
            {runHealthCheck.isPending ? 'Running...' : 'Run Check Now'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />Overall Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <HealthStatusBadge status={overallStats.failed > 0 ? 'failed' : overallStats.degraded > 0 ? 'degraded' : 'healthy'} size="lg" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />Uptime ({timeRange})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <p className={cn("text-2xl font-bold", overallStats.uptime >= 99 ? "text-green-600 dark:text-green-400" : overallStats.uptime >= 95 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400")}>
                {overallStats.uptime.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Timer className="h-4 w-4" />Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{overallStats.avgLatency}ms</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="flex items-baseline gap-2">
                <p className={cn("text-2xl font-bold", overallStats.failed > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>{overallStats.failed}</p>
                <span className="text-sm text-muted-foreground">/ {overallStats.activeCount} active</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />{overallStats.healthy} Healthy
        </Badge>
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />{overallStats.degraded} Degraded
        </Badge>
        <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />{overallStats.failed} Failed
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as ComponentType)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pms">PMS</TabsTrigger>
            <TabsTrigger value="internal">Internal</TabsTrigger>
            <TabsTrigger value="external">External</TabsTrigger>
            <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          {(['1h', '24h', '7d', '30d'] as TimeRange[]).map(range => (
            <Button key={range} variant={timeRange === range ? 'secondary' : 'ghost'} size="sm" onClick={() => setTimeRange(range)}>{range}</Button>
          ))}
        </div>
      </div>

      {/* Components */}
      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : activeComponents.length === 0 && inactiveComponents.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-muted-foreground">No components found for this filter.</p></Card>
      ) : (
        <div className="space-y-6">
          {activeComponents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />Active Monitored Systems ({activeComponents.length})
              </h3>
              {activeComponents.map(component => {
                const stats = componentStats[component.component_key];
                return (
                  <ComponentHealthCard
                    key={component.id}
                    componentKey={component.component_key}
                    componentName={component.component_name}
                    componentType={component.component_type}
                    isCritical={component.is_critical}
                    isActive={component.is_active}
                    expectedLatency={component.expected_latency_ms}
                    lastStatus={stats?.lastStatus || 'unknown'}
                    lastChecked={stats?.lastChecked || 'Never'}
                    avgLatency={stats?.avgLatency || 0}
                    uptimePercentage={stats?.uptimePercentage || 0}
                    failureCount24h={stats?.failureCount || 0}
                    recentChecks={stats?.recentChecks || []}
                  />
                );
              })}
            </div>
          )}

          {inactiveComponents.length > 0 && (
            <Collapsible open={inactiveExpanded} onOpenChange={setInactiveExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <PauseCircle className="h-4 w-4" />Waiting / Not Active ({inactiveComponents.length} systems)
                  </span>
                  {inactiveExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <Card className="border-dashed">
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {inactiveComponents.map(component => (
                        <div key={component.id} className="flex items-center justify-between px-4 py-3 text-muted-foreground">
                          <div className="flex items-center gap-3">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                            <span className="font-medium">{component.component_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <Badge variant="outline" className="text-xs font-normal opacity-60">{component.component_type}</Badge>
                            <span className="text-xs opacity-50">Not Active</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
