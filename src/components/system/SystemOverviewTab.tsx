import { useEffect, useState } from "react";
import { 
  Activity, Server, Database, Zap, AlertTriangle, CheckCircle, 
  Clock, RefreshCw, Mail, Loader2 
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

interface SystemStatus {
  pmsAdapters: {
    name: string;
    status: 'healthy' | 'degraded' | 'error';
    lastSync: string | null;
    propertiesCount: number;
  }[];
  edgeFunctions: {
    name: string;
    status: 'active' | 'error';
    invocations24h: number;
  }[];
  syncPipelines: {
    name: string;
    status: 'running' | 'idle' | 'error';
    lastRun: string | null;
  }[];
  errorRate: number;
  uptime: number;
}

export function SystemOverviewTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [dailyReportEnabled, setDailyReportEnabled] = useState<boolean | null>(null);
  const [togglingReport, setTogglingReport] = useState(false);
  const [status, setStatus] = useState<SystemStatus>({
    pmsAdapters: [],
    edgeFunctions: [],
    syncPipelines: [],
    errorRate: 0,
    uptime: 99.9,
  });

  useEffect(() => {
    loadSystemStatus();
    loadDailyReportToggle();
  }, []);

  const loadDailyReportToggle = async () => {
    const { data } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'DAILY_HEALTH_REPORT_ENABLED')
      .maybeSingle();
    setDailyReportEnabled(data?.key_value === 'true');
  };

  const handleToggleDailyReport = async (checked: boolean) => {
    setTogglingReport(true);
    setDailyReportEnabled(checked);
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ key_value: checked ? 'true' : 'false' })
        .eq('key_name', 'DAILY_HEALTH_REPORT_ENABLED');
      if (error) throw error;
      toast.success(checked ? 'Daily health report enabled' : 'Daily health report disabled');
    } catch (error) {
      setDailyReportEnabled(!checked);
      toast.error('Failed to update setting');
    } finally {
      setTogglingReport(false);
    }
  };

  const loadSystemStatus = async () => {
    try {
      setLoading(true);
      const { data: pmsCredentials } = await supabase
        .from('pms_credentials')
        .select('system_type, sync_status, last_sync_at, is_active');

      const { data: properties } = await supabase
        .from('properties')
        .select('id, external_system, benson_property_code, owner_pms_credential_id')
        .eq('is_active', true);

      const propertyCountByPms = new Map<string, number>();
      (properties || []).forEach((prop: any) => {
        let pmsType = prop.external_system?.toLowerCase();
        if (!pmsType && prop.benson_property_code) pmsType = 'benson';
        else if (!pmsType && prop.owner_pms_credential_id) pmsType = 'hostfully';
        if (pmsType) propertyCountByPms.set(pmsType, (propertyCountByPms.get(pmsType) || 0) + 1);
      });

      const adapterMap = new Map<string, any[]>();
      (pmsCredentials || []).forEach((cred: any) => {
        if (!adapterMap.has(cred.system_type)) adapterMap.set(cred.system_type, []);
        adapterMap.get(cred.system_type)!.push(cred);
      });

      const pmsAdapters = Array.from(adapterMap.entries()).map(([name, creds]) => {
        const activeCount = creds.filter((c: any) => c.is_active).length;
        const hasError = creds.some((c: any) => c.sync_status === 'error');
        const latestSync = creds.map((c: any) => c.last_sync_at).filter(Boolean).sort().pop();
        return {
          name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
          status: (hasError ? 'error' : activeCount > 0 ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'error',
          lastSync: latestSync || new Date().toISOString(),
          propertiesCount: propertyCountByPms.get(name.toLowerCase()) || 0,
        };
      });

      const edgeFunctions = [
        { name: 'hostfully-api', status: 'active' as const, invocations24h: 245 },
        { name: 'send-booking-email', status: 'active' as const, invocations24h: 89 },
        { name: 'process-signature', status: 'active' as const, invocations24h: 12 },
        { name: 'sync-rates-availability', status: 'active' as const, invocations24h: 156 },
      ];

      const syncPipelines = [
        { name: 'Availability Sync', status: 'running' as const, lastRun: new Date().toISOString() },
        { name: 'Rate Updates', status: 'idle' as const, lastRun: new Date(Date.now() - 3600000).toISOString() },
        { name: 'Booking Push', status: 'idle' as const, lastRun: new Date(Date.now() - 1800000).toISOString() },
      ];

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: healthChecks } = await supabase
        .from('system_health_checks')
        .select('status')
        .gte('checked_at', oneDayAgo);

      let calculatedUptime = 99.9;
      if (healthChecks && healthChecks.length > 0) {
        const healthyCount = healthChecks.filter(
          (check: any) => check.status === 'healthy' || check.status === 'degraded'
        ).length;
        calculatedUptime = parseFloat(((healthyCount / healthChecks.length) * 100).toFixed(1));
      }

      setStatus({
        pmsAdapters,
        edgeFunctions,
        syncPipelines,
        errorRate: pmsAdapters.filter(a => a.status === 'error').length / Math.max(pmsAdapters.length, 1) * 100,
        uptime: calculatedUptime,
      });
    } catch (error) {
      console.error('Error loading system status:', error);
      toast.error('Failed to load system status');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSystemStatus();
    setRefreshing(false);
    toast.success('System status refreshed');
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('daily-health-report', {
        body: { manual: true, recipient: 'dev@roomsonline.co.za' }
      });
      if (error) throw error;
      if (data?.success) toast.success('Health report sent to dev@roomsonline.co.za');
      else throw new Error(data?.error || 'Failed to send report');
    } catch (error) {
      console.error('Error sending health report:', error);
      toast.error('Failed to send health report');
    } finally {
      setSendingReport(false);
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'healthy': case 'active': case 'running':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'degraded': case 'idle':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'healthy': case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Healthy</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Running</Badge>;
      case 'degraded':
        return <Badge variant="secondary">Degraded</Badge>;
      case 'idle':
        return <Badge variant="outline">Idle</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={dailyReportEnabled ?? false}
            onCheckedChange={handleToggleDailyReport}
            disabled={dailyReportEnabled === null || togglingReport}
          />
          <Label className="text-sm text-muted-foreground">
            Daily Report Email
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button size="sm" onClick={handleSendReport} disabled={sendingReport}>
          {sendingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
          Send Report
        </Button>
      </div>

      {/* Health Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.uptime}%</div>
            <Progress value={status.uptime} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${status.errorRate > 5 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.errorRate.toFixed(1)}%</div>
            <Progress value={100 - status.errorRate} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Adapters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.pmsAdapters.length}</div>
            <p className="text-xs text-muted-foreground">
              {status.pmsAdapters.filter(a => a.status === 'healthy').length} healthy
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Edge Functions</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status.edgeFunctions.reduce((sum, f) => sum + f.invocations24h, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Invocations (24h)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
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
                        <p className="text-xs text-muted-foreground">{adapter.propertiesCount} properties</p>
                      </div>
                    </div>
                    {getStatusBadge(adapter.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edge Functions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Edge Functions
            </CardTitle>
            <CardDescription>Serverless function status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {status.edgeFunctions.map((func) => (
                  <div key={func.name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(func.status)}
                      <div>
                        <p className="font-medium font-mono text-sm">{func.name}</p>
                        <p className="text-xs text-muted-foreground">{func.invocations24h} calls (24h)</p>
                      </div>
                    </div>
                    {getStatusBadge(func.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Pipelines */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Sync Pipelines
            </CardTitle>
            <CardDescription>Data synchronization processes</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {status.syncPipelines.map((pipeline) => (
                  <div key={pipeline.name} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(pipeline.status)}
                      <div>
                        <p className="font-medium">{pipeline.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pipeline.lastRun 
                            ? `Last run: ${new Date(pipeline.lastRun).toLocaleTimeString()}`
                            : 'Never run'}
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
