import { useEffect, useState } from "react";
import { 
  Server, 
  Power,
  PowerOff,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Play,
  Circle,
  Wifi,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { VISIBLE_PMS_SYSTEMS, PMS_CATEGORY_SYSTEMS, CHANNEL_MANAGER_SYSTEMS, PMSSystemConfig, getIntegrationStatusInfo, IntegrationStatus } from "@/lib/pmsSystemsConfig";
import { HyperGuestDetails } from "@/components/pms";
import { ChannelCredentialEditor } from "@/components/pms/ChannelCredentialEditor";

const DISTRIBUTION_CHANNELS = ["hyperguest", "hotelbeds", "rentalsunited", "profitroom"];

interface PMSAdapter {
  id: string;
  system_type: string;
  property_name: string | null;
  is_active: boolean;
  sync_status: string | null;
  last_sync_at: string | null;
  environment: string;
  capabilities: Record<string, boolean> | null;
}

interface TrackerStatus {
  system_type: string;
  integration_status: IntegrationStatus | null;
  is_production: boolean;
}

interface SystemWithConnections {
  config: PMSSystemConfig;
  connections: PMSAdapter[];
  trackerStatus: TrackerStatus | null;
  cacheLastSync: string | null;
}

export default function DevPMS() {
  const [adapters, setAdapters] = useState<PMSAdapter[]>([]);
  const [trackerStatuses, setTrackerStatuses] = useState<TrackerStatus[]>([]);
  const [cacheActivity, setCacheActivity] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [nightsBridgeLastActivity, setNightsBridgeLastActivity] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch pms_credentials, pms_tracker_status, NightsBridge sessions, and cache activity in parallel
      const [credentialsResult, trackerResult, nbSessionResult, cacheResult] = await Promise.all([
        supabase
          .from('pms_credentials')
          .select('*')
          .order('system_type'),
        supabase
          .from('pms_tracker_status')
          .select('system_type, integration_status, is_production')
          .order('system_type'),
        supabase
          .from('nightsbridge_booking_sessions')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Get latest cache fetch per external_system
        supabase.rpc('get_latest_cache_activity' as any),
      ]);
      
      if (credentialsResult.error) throw credentialsResult.error;
      if (trackerResult.error) throw trackerResult.error;

      setAdapters((credentialsResult.data || []).map((a: any) => ({
        id: a.id,
        system_type: a.system_type,
        property_name: a.property_name,
        is_active: a.is_active ?? true,
        sync_status: a.sync_status,
        last_sync_at: a.last_sync_at,
        environment: a.environment,
        capabilities: a.capabilities,
      })));

      setTrackerStatuses((trackerResult.data || []).map((t: any) => ({
        system_type: t.system_type,
        integration_status: t.integration_status,
        is_production: t.is_production ?? false,
      })));

      // Build cache activity map: { benson: '2026-04-07T18:26:07Z', ... }
      const cacheMap: Record<string, string> = {};
      if (cacheResult.data && !cacheResult.error) {
        (cacheResult.data as any[]).forEach((row: any) => {
          if (row.external_system && row.latest_fetched_at) {
            cacheMap[row.external_system] = row.latest_fetched_at;
          }
        });
      }
      setCacheActivity(cacheMap);

      setNightsBridgeLastActivity(nbSessionResult?.data?.created_at || null);
    } catch (error) {
      console.error('Error loading PMS data:', error);
      toast.error('Failed to load PMS data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const toggleAdapter = async (adapter: PMSAdapter) => {
    setToggling(adapter.id);
    
    try {
      const newStatus = !adapter.is_active;
      
      const { error } = await supabase
        .from('pms_credentials')
        .update({ 
          is_active: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', adapter.id);
      
      if (error) throw error;

      setAdapters(prev => prev.map(a => 
        a.id === adapter.id ? { ...a, is_active: newStatus } : a
      ));
      
      toast.success(`${adapter.system_type} adapter ${newStatus ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling adapter:', error);
      toast.error('Failed to update adapter');
    } finally {
      setToggling(null);
    }
  };

  const triggerSync = async (adapter: PMSAdapter) => {
    setSyncing(adapter.id);
    toast.info(`Triggering sync for ${adapter.property_name || adapter.system_type}...`);
    
    try {
      // Call the appropriate edge function based on system_type
      const { error } = await supabase.functions.invoke(`${adapter.system_type}-api`, {
        body: { action: 'health_check', credential_id: adapter.id }
      });
      
      if (error) throw error;
      
      // Update last_sync_at on success
      const { error: updateError } = await supabase
        .from('pms_credentials')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', adapter.id);
      
      if (updateError) throw updateError;
      
      // Refresh data to show updated status
      await loadData();
      toast.success('Sync completed successfully');
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Sync failed - check edge function logs');
    } finally {
      setSyncing(null);
    }
  };

  // Sync status is determined by last_sync_at timestamp, not the unused sync_status field
  const getConnectionIcon = (isActive: boolean, lastSyncAt: string | null, isWidgetBased: boolean) => {
    if (!isActive) return <PowerOff className="h-4 w-4 text-muted-foreground" />;
    
    // Widget-based systems are always "online"
    if (isWidgetBased) {
      return <Wifi className="h-4 w-4 text-emerald-500" />;
    }
    
    // If has synced, it's operational
    if (lastSyncAt) {
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    }
    // Never synced yet
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  // Connection sync badge based on actual sync history
  const getConnectionSyncBadge = (isActive: boolean, lastSyncAt: string | null, isWidgetBased: boolean) => {
    if (!isActive) return <Badge variant="outline">Disabled</Badge>;
    
    // Widget-based systems show "Online" status
    if (isWidgetBased) {
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Online</Badge>;
    }
    
    if (lastSyncAt) {
      // Has synced - show when
      const syncDate = new Date(lastSyncAt);
      const now = new Date();
      const hoursSince = (now.getTime() - syncDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSince < 24) {
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Synced</Badge>;
      } else if (hoursSince < 72) {
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Stale</Badge>;
      } else {
        return <Badge variant="secondary">Outdated</Badge>;
      }
    }
    
    return <Badge variant="outline" className="text-muted-foreground">Never Synced</Badge>;
  };

  // Get last activity display for widget-based systems
  const getWidgetLastActivity = () => {
    if (nightsBridgeLastActivity) {
      return `Active ${formatDistanceToNow(new Date(nightsBridgeLastActivity))} ago`;
    }
    return 'No sessions';
  };

  // Build systems list from centralized config with their connections and tracker status
  const buildSystemGroup = (systems: PMSSystemConfig[]) => systems.map(config => ({
    config,
    connections: adapters.filter(a => a.system_type === config.key),
    trackerStatus: trackerStatuses.find(t => t.system_type === config.key) || null,
    cacheLastSync: cacheActivity[config.key] || null,
  }));

  const pmsSystemsWithConnections = buildSystemGroup(PMS_CATEGORY_SYSTEMS);
  const channelManagersWithConnections = buildSystemGroup(CHANNEL_MANAGER_SYSTEMS);
  

  // Get the latest sync across all connections for a system
  const getLatestSync = (connections: PMSAdapter[]): string | null => {
    const syncs = connections
      .map(c => c.last_sync_at)
      .filter((s): s is string => s !== null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return syncs[0] || null;
  };

  // Stats - filter to only visible systems
  const visibleSystemKeys = VISIBLE_PMS_SYSTEMS.map(s => s.key);
  const visibleConnections = adapters.filter(a => visibleSystemKeys.includes(a.system_type));
  const totalConnections = visibleConnections.length;
  const activeConnections = visibleConnections.filter(a => a.is_active).length;
  const errorConnections = visibleConnections.filter(a => a.sync_status === 'error').length;
  const deployedSystems = trackerStatuses.filter(t => t.integration_status === 'deployed' && visibleSystemKeys.includes(t.system_type)).length;

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="PMS Control"
          subtitle="Manage property management system adapters and connections"
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Systems</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{VISIBLE_PMS_SYSTEMS.length}</div>
            <p className="text-xs text-muted-foreground">{totalConnections} connections</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
            <Power className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {activeConnections}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {errorConnections}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deployed Systems</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deployedSystems} / {VISIBLE_PMS_SYSTEMS.length}
            </div>
            <p className="text-xs text-muted-foreground">From pms_tracker_status</p>
          </CardContent>
        </Card>
      </div>

      {/* All PMS Systems */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* PMS Systems */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Property Management Systems</h2>
            <div className="space-y-6">
              {pmsSystemsWithConnections.map(({ config, connections, trackerStatus, cacheLastSync }) => {
                const integrationStatus = trackerStatus?.integration_status || 'coming_soon';
                const statusInfo = getIntegrationStatusInfo(integrationStatus);
                const latestCredentialSync = getLatestSync(connections);
                const latestSync = [latestCredentialSync, cacheLastSync]
                  .filter((s): s is string => s !== null)
                  .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
                const isDeployed = integrationStatus === 'deployed' || integrationStatus === 'in_testing';
                
                return (
                  <Card key={config.key} className={!isDeployed && connections.length === 0 ? "opacity-50" : ""}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        {config.name}
                        {config.isInternal && (
                          <Badge variant="outline" className="ml-2 text-xs">Internal</Badge>
                        )}
                        {config.isWidgetOnly && (
                          <Badge variant="outline" className="ml-2 text-xs">Widget</Badge>
                        )}
                        <Badge 
                          variant={statusInfo.variant}
                          className={`ml-2 text-xs ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </Badge>
                        {trackerStatus?.is_production && (
                          <Badge className="ml-1 text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            Production
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {config.description}
                        {connections.length > 0 && (
                          <span className="ml-2 font-medium">
                            • {connections.length} connection{connections.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {latestSync && (
                          <span className="ml-2 text-muted-foreground">
                            • Last ARI: {formatDistanceToNow(new Date(latestSync), { addSuffix: true })} ({format(new Date(latestSync), 'MMM d, HH:mm')})
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                  {connections.length > 0 && (
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Property</TableHead>
                            <TableHead>Environment</TableHead>
                            <TableHead>{config.isWidgetOnly ? 'Status' : 'Sync Status'}</TableHead>
                            <TableHead>{config.isWidgetOnly ? 'Last Activity' : 'Last Sync'}</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {connections.map((adapter) => (
                            <TableRow key={adapter.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {getConnectionIcon(adapter.is_active, adapter.last_sync_at || cacheLastSync, config.isWidgetOnly)}
                                  {adapter.property_name || 'Unnamed'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {adapter.environment}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {getConnectionSyncBadge(adapter.is_active, adapter.last_sync_at || cacheLastSync, config.isWidgetOnly)}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {config.isWidgetOnly 
                                  ? getWidgetLastActivity()
                                  : (() => {
                                      const effectiveSync = adapter.last_sync_at || cacheLastSync;
                                      return effectiveSync 
                                        ? formatDistanceToNow(new Date(effectiveSync), { addSuffix: true })
                                        : 'Never';
                                    })()
                                }
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!config.isWidgetOnly && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => triggerSync(adapter)}
                                      disabled={!adapter.is_active || syncing === adapter.id}
                                    >
                                      <Play className={`h-4 w-4 ${syncing === adapter.id ? 'animate-spin' : ''}`} />
                                    </Button>
                                  )}
                                  
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={toggling === adapter.id}
                                      >
                                        {adapter.is_active ? (
                                          <Power className="h-4 w-4 text-emerald-500" />
                                        ) : (
                                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          {adapter.is_active ? 'Disable' : 'Enable'} Adapter?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {adapter.is_active 
                                            ? 'This will stop all sync operations for this connection. Bookings will not be pushed until re-enabled.'
                                            : 'This will resume sync operations for this connection.'
                                          }
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => toggleAdapter(adapter)}>
                                          {adapter.is_active ? 'Disable' : 'Enable'}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                  {connections.length === 0 && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Circle className="h-3 w-3" />
                        {config.isWidgetOnly 
                          ? 'Widget-based integration (no API connections)' 
                          : 'No connections configured'}
                      </div>
                    </CardContent>
                  )}
                  {config.key === 'hyperguest' && (
                    <CardContent className="pt-0">
                      <HyperGuestDetails />
                    </CardContent>
                  )}
                  {DISTRIBUTION_CHANNELS.includes(config.key) && config.key !== 'hyperguest' && (
                    <CardContent className="pt-0">
                      <ChannelCredentialEditor channelName={config.key} />
                    </CardContent>
                  )}
                </Card>
                );
              })}
            </div>
          </div>

          {/* Channel Managers */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Channel Managers</h2>
            <div className="space-y-6">
              {channelManagersWithConnections.map(({ config, connections, trackerStatus, cacheLastSync }) => {
                const integrationStatus = trackerStatus?.integration_status || 'coming_soon';
                const statusInfo = getIntegrationStatusInfo(integrationStatus);
                const latestCredentialSync = getLatestSync(connections);
                const latestSync = [latestCredentialSync, cacheLastSync]
                  .filter((s): s is string => s !== null)
                  .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
                const isDeployed = integrationStatus === 'deployed' || integrationStatus === 'in_testing';
                
                return (
                  <Card key={config.key} className={!isDeployed && connections.length === 0 ? "opacity-50" : ""}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        {config.name}
                        {config.isWidgetOnly && (
                          <Badge variant="outline" className="ml-2 text-xs">Widget</Badge>
                        )}
                        <Badge 
                          variant={statusInfo.variant}
                          className={`ml-2 text-xs ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </Badge>
                        {trackerStatus?.is_production && (
                          <Badge className="ml-1 text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            Production
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {config.description}
                        {connections.length > 0 && (
                          <span className="ml-2 font-medium">
                            • {connections.length} connection{connections.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {latestSync && (
                          <span className="ml-2 text-muted-foreground">
                            • Last ARI: {formatDistanceToNow(new Date(latestSync), { addSuffix: true })} ({format(new Date(latestSync), 'MMM d, HH:mm')})
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                  {connections.length > 0 && (
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Property</TableHead>
                            <TableHead>Environment</TableHead>
                            <TableHead>{config.isWidgetOnly ? 'Status' : 'Sync Status'}</TableHead>
                            <TableHead>{config.isWidgetOnly ? 'Last Activity' : 'Last Sync'}</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {connections.map((adapter) => (
                            <TableRow key={adapter.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {getConnectionIcon(adapter.is_active, adapter.last_sync_at || cacheLastSync, config.isWidgetOnly)}
                                  {adapter.property_name || 'Unnamed'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {adapter.environment}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {getConnectionSyncBadge(adapter.is_active, adapter.last_sync_at || cacheLastSync, config.isWidgetOnly)}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {config.isWidgetOnly 
                                  ? getWidgetLastActivity()
                                  : (() => {
                                      const effectiveSync = adapter.last_sync_at || cacheLastSync;
                                      return effectiveSync 
                                        ? formatDistanceToNow(new Date(effectiveSync), { addSuffix: true })
                                        : 'Never';
                                    })()
                                }
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!config.isWidgetOnly && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => triggerSync(adapter)}
                                      disabled={!adapter.is_active || syncing === adapter.id}
                                    >
                                      <Play className={`h-4 w-4 ${syncing === adapter.id ? 'animate-spin' : ''}`} />
                                    </Button>
                                  )}
                                  
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={toggling === adapter.id}
                                      >
                                        {adapter.is_active ? (
                                          <Power className="h-4 w-4 text-emerald-500" />
                                        ) : (
                                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          {adapter.is_active ? 'Disable' : 'Enable'} Adapter?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {adapter.is_active 
                                            ? 'This will stop all sync operations for this connection. Bookings will not be pushed until re-enabled.'
                                            : 'This will resume sync operations for this connection.'
                                          }
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => toggleAdapter(adapter)}>
                                          {adapter.is_active ? 'Disable' : 'Enable'}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                  {connections.length === 0 && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Circle className="h-3 w-3" />
                        {config.isWidgetOnly 
                          ? 'Widget-based integration (no API connections)' 
                          : 'No connections configured'}
                      </div>
                    </CardContent>
                  )}
                  {config.key === 'hyperguest' && (
                    <CardContent className="pt-0">
                      <HyperGuestDetails />
                    </CardContent>
                  )}
                  {DISTRIBUTION_CHANNELS.includes(config.key) && config.key !== 'hyperguest' && (
                    <CardContent className="pt-0">
                      <ChannelCredentialEditor channelName={config.key} />
                    </CardContent>
                  )}
                </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}