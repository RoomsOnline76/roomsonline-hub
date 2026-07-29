import { useCallback, useEffect, useState } from "react";
import {
  Activity, Server, Database, Zap, AlertTriangle, CheckCircle,
  Clock, RefreshCw, Mail, Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AdapterStatus = "healthy" | "degraded" | "error";
type PipelineStatus = "running" | "idle" | "error";

interface PmsAdapter {
  name: string;
  status: AdapterStatus;
  lastSync: string | null;
  propertiesCount: number;
}

interface ApiEndpointStat {
  name: string;
  status: "active" | "error";
  calls24h: number;
  errors24h: number;
  avgLatencyMs: number;
}

interface SyncPipeline {
  name: string;
  status: PipelineStatus;
  lastRun: string | null;
  runs24h: number;
  failures24h: number;
}

interface SystemStatus {
  pmsAdapters: PmsAdapter[];
  apiEndpoints: ApiEndpointStat[];
  syncPipelines: SyncPipeline[];
  apiCalls24h: number;
  errorRate: number;
  uptime: number;
}

const EMPTY_STATUS: SystemStatus = {
  pmsAdapters: [],
  apiEndpoints: [],
  syncPipelines: [],
  apiCalls24h: 0,
  errorRate: 0,
  uptime: 0,
};

function titleise(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatWhen(value: string | null): string {
  if (!value) return "Never";
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} h ago`;
  return new Date(value).toLocaleDateString();
}

export function SystemOverviewTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [dailyReportEnabled, setDailyReportEnabled] = useState<boolean | null>(null);
  const [togglingReport, setTogglingReport] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<SystemStatus>(EMPTY_STATUS);

  const loadDailyReportToggle = useCallback(async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "DAILY_HEALTH_REPORT_ENABLED")
      .maybeSingle();
    setDailyReportEnabled(data?.key_value === "true");
  }, []);

  const handleToggleDailyReport = async (checked: boolean) => {
    setTogglingReport(true);
    setDailyReportEnabled(checked);
    try {
      const { error } = await supabase
        .from("api_keys")
        .update({ key_value: checked ? "true" : "false" })
        .eq("key_name", "DAILY_HEALTH_REPORT_ENABLED");
      if (error) throw error;
      toast.success(checked ? "Daily health report enabled" : "Daily health report disabled");
    } catch {
      setDailyReportEnabled(!checked);
      toast.error("Failed to update setting");
    } finally {
      setTogglingReport(false);
    }
  };

  const loadSystemStatus = useCallback(async () => {
    try {
      setLoading(true);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        { data: pmsCredentials },
        { data: properties },
        { data: healthChecks },
        { data: apiLogs },
        { data: syncRows },
      ] = await Promise.all([
        supabase.from("pms_credentials").select("system_type, sync_status, last_sync_at, is_active"),
        supabase
          .from("properties")
          .select("id, external_system, benson_property_code, owner_pms_credential_id")
          .eq("is_active", true),
        supabase.from("system_health_checks").select("status").gte("checked_at", oneDayAgo),
        supabase
          .from("api_request_log")
          .select("endpoint, action, status_code, response_time_ms, created_at")
          .gte("created_at", oneDayAgo)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("sync_logs")
          .select("sync_type, external_system, status, created_at")
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      // ── PMS adapters ───────────────────────────────────────────────────────
      const propertyCountByPms = new Map<string, number>();
      (properties || []).forEach((prop: any) => {
        let pmsType = prop.external_system?.toLowerCase();
        if (!pmsType && prop.benson_property_code) pmsType = "benson";
        else if (!pmsType && prop.owner_pms_credential_id) pmsType = "hostfully";
        if (pmsType) propertyCountByPms.set(pmsType, (propertyCountByPms.get(pmsType) || 0) + 1);
      });

      const adapterMap = new Map<string, any[]>();
      (pmsCredentials || []).forEach((cred: any) => {
        if (!adapterMap.has(cred.system_type)) adapterMap.set(cred.system_type, []);
        adapterMap.get(cred.system_type)!.push(cred);
      });

      const pmsAdapters: PmsAdapter[] = Array.from(adapterMap.entries()).map(([name, creds]) => {
        const activeCount = creds.filter((c: any) => c.is_active).length;
        const hasError = creds.some((c: any) => c.sync_status === "error" || c.sync_status === "failed");
        const latestSync = creds.map((c: any) => c.last_sync_at).filter(Boolean).sort().pop() || null;
        return {
          name: titleise(name),
          status: (hasError ? "error" : activeCount > 0 ? "healthy" : "degraded") as AdapterStatus,
          lastSync: latestSync,
          propertiesCount: propertyCountByPms.get(name.toLowerCase()) || 0,
        };
      });

      // ── API traffic (real, from api_request_log) ───────────────────────────
      const endpointMap = new Map<string, { calls: number; errors: number; latency: number[] }>();
      (apiLogs || []).forEach((row: any) => {
        const key = row.endpoint || row.action || "unknown";
        if (!endpointMap.has(key)) endpointMap.set(key, { calls: 0, errors: 0, latency: [] });
        const entry = endpointMap.get(key)!;
        entry.calls += 1;
        if ((row.status_code ?? 200) >= 400) entry.errors += 1;
        if (row.response_time_ms) entry.latency.push(row.response_time_ms);
      });

      const apiEndpoints: ApiEndpointStat[] = Array.from(endpointMap.entries())
        .map(([name, e]) => ({
          name,
          status: (e.errors > 0 ? "error" : "active") as "active" | "error",
          calls24h: e.calls,
          errors24h: e.errors,
          avgLatencyMs: e.latency.length
            ? Math.round(e.latency.reduce((a, b) => a + b, 0) / e.latency.length)
            : 0,
        }))
        .sort((a, b) => b.calls24h - a.calls24h)
        .slice(0, 8);

      const apiCalls24h = (apiLogs || []).length;
      const apiErrors24h = (apiLogs || []).filter((r: any) => (r.status_code ?? 200) >= 400).length;

      // ── Sync pipelines (real, from sync_logs) ──────────────────────────────
      const pipelineMap = new Map<string, { runs: number; failures: number; last: string | null; lastStatus: string }>();
      (syncRows || []).forEach((row: any) => {
        const key = titleise(row.sync_type || "sync") +
          (row.external_system ? ` · ${titleise(row.external_system)}` : "");
        if (!pipelineMap.has(key)) {
          pipelineMap.set(key, { runs: 0, failures: 0, last: row.created_at, lastStatus: row.status });
        }
        const entry = pipelineMap.get(key)!;
        entry.runs += 1;
        if (row.status === "error" || row.status === "failed") entry.failures += 1;
      });

      const syncPipelines: SyncPipeline[] = Array.from(pipelineMap.entries())
        .map(([name, e]) => {
          const recent = e.last ? Date.now() - new Date(e.last).getTime() < 60 * 60 * 1000 : false;
          const status: PipelineStatus =
            e.lastStatus === "error" || e.lastStatus === "failed" ? "error" : recent ? "running" : "idle";
          return { name, status, lastRun: e.last, runs24h: e.runs, failures24h: e.failures };
        })
        .sort((a, b) => (b.lastRun || "").localeCompare(a.lastRun || ""))
        .slice(0, 6);

      // ── Uptime / error rate ────────────────────────────────────────────────
      let calculatedUptime = 0;
      if (healthChecks && healthChecks.length > 0) {
        const healthyCount = healthChecks.filter(
          (check: any) => check.status === "healthy" || check.status === "degraded",
        ).length;
        calculatedUptime = parseFloat(((healthyCount / healthChecks.length) * 100).toFixed(1));
      }

      const errorRate = apiCalls24h > 0
        ? (apiErrors24h / apiCalls24h) * 100
        : (pmsAdapters.filter((a) => a.status === "error").length / Math.max(pmsAdapters.length, 1)) * 100;

      setStatus({
        pmsAdapters,
        apiEndpoints,
        syncPipelines,
        apiCalls24h,
        errorRate,
        uptime: calculatedUptime,
      });
      setLastLoadedAt(new Date());
    } catch (error) {
      console.error("Error loading system status:", error);
      toast.error("Failed to load system status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystemStatus();
    loadDailyReportToggle();
  }, [loadSystemStatus, loadDailyReportToggle]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSystemStatus();
    setRefreshing(false);
    toast.success("System status refreshed");
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-health-report", {
        body: { manual: true, recipient: "dev@roomsonline.co.za" },
      });
      if (error) throw error;
      if (data?.success) toast.success("Health report sent to dev@roomsonline.co.za");
      else throw new Error(data?.error || "Failed to send report");
    } catch (error) {
      console.error("Error sending health report:", error);
      toast.error("Failed to send health report");
    } finally {
      setSendingReport(false);
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case "healthy": case "active": case "running":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "degraded": case "idle":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "error":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "healthy": case "active":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Healthy</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Running</Badge>;
      case "degraded":
        return <Badge variant="secondary">Degraded</Badge>;
      case "idle":
        return <Badge variant="outline">Idle</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Live figures from health checks, API request logs and sync logs (last 24 hours).
          {lastLoadedAt && ` Updated ${formatWhen(lastLoadedAt.toISOString())}.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={dailyReportEnabled ?? false}
              onCheckedChange={handleToggleDailyReport}
              disabled={dailyReportEnabled === null || togglingReport}
            />
            <Label className="text-sm text-muted-foreground">Daily Report Email</Label>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSendReport} disabled={sendingReport}>
            {sendingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Send Report
          </Button>
        </div>
      </div>

      {/* Health overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health Check Uptime</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{status.uptime ? `${status.uptime}%` : "—"}</div>
                <Progress value={status.uptime} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">Last 24h checks</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Error Rate</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${status.errorRate > 5 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{status.errorRate.toFixed(1)}%</div>
                <Progress value={100 - status.errorRate} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">4xx/5xx responses (24h)</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Adapters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{status.pmsAdapters.length}</div>
                <p className="text-xs text-muted-foreground">
                  {status.pmsAdapters.filter((a) => a.status === "healthy").length} healthy
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Requests</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{status.apiCalls24h}</div>
                <p className="text-xs text-muted-foreground">Logged calls (24h)</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* PMS Adapters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              PMS Adapters
            </CardTitle>
            <CardDescription>Property management system connections</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : status.pmsAdapters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No PMS adapters configured</p>
            ) : (
              <div className="space-y-3">
                {status.pmsAdapters.map((adapter) => (
                  <div key={adapter.name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(adapter.status)}
                      <div>
                        <p className="font-medium">{adapter.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {adapter.propertiesCount} properties · last sync {formatWhen(adapter.lastSync)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(adapter.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* API traffic */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              API Traffic (24h)
            </CardTitle>
            <CardDescription>Busiest endpoints from the request log</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : status.apiEndpoints.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No API requests logged in the last 24 hours
              </p>
            ) : (
              <div className="space-y-3">
                {status.apiEndpoints.map((func) => (
                  <div key={func.name} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div className="flex min-w-0 items-center gap-3">
                      {getStatusIcon(func.status)}
                      <div className="min-w-0">
                        <p className="font-medium font-mono text-sm truncate">{func.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {func.calls24h} calls · {func.errors24h} errors
                          {func.avgLatencyMs ? ` · ${func.avgLatencyMs}ms avg` : ""}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(func.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync pipelines */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Sync Pipelines
            </CardTitle>
            <CardDescription>Recent synchronisation activity (last 7 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : status.syncPipelines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No sync activity recorded</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {status.syncPipelines.map((pipeline) => (
                  <div key={pipeline.name} className="flex items-center justify-between gap-3 p-4 rounded-lg border">
                    <div className="flex min-w-0 items-center gap-3">
                      {getStatusIcon(pipeline.status)}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{pipeline.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pipeline.runs24h} runs · {pipeline.failures24h} failed · {formatWhen(pipeline.lastRun)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(pipeline.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
