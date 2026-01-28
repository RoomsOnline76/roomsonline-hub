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
} from "lucide-react";
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
import { ALL_PMS_SYSTEMS, PMSSystemConfig, getIntegrationStatusInfo, IntegrationStatus } from "@/lib/pmsSystemsConfig";

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
}

export default function DevPMS() {
  const [adapters, setAdapters] = useState<PMSAdapter[]>([]);
  const [trackerStatuses, setTrackerStatuses] = useState<TrackerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch both pms_credentials and pms_tracker_status in parallel
      const [credentialsResult, trackerResult] = await Promise.all([
        supabase
          .from('pms_credentials')
          .select('*')
          .order('system_type'),
        supabase
          .from('pms_tracker_status')
          .select('system_type, integration_status, is_production')
          .order('system_type'),
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
    toast.info(`Triggering sync for ${adapter.property_name || adapter.system_type}...`);
    // In production, this would call the sync edge function
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('Sync triggered successfully');
  };

  const getStatusIcon = (status: string | null, isActive: boolean, lastSyncAt: string | null) => {
    if (!isActive) return <PowerOff className="h-4 w-4 text-muted-foreground" />;
    
    switch (status) {
      case 'healthy':
      case 'synced':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'syncing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error':
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        // If never synced, show clock; otherwise show pending
        return lastSyncAt ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSyncStatusBadge = (status: string | null, isActive: boolean, lastSyncAt: string | null) => {
    if (!isActive) return <Badge variant="outline">Disabled</Badge>;
    
    switch (status) {
      case 'healthy':
      case 'synced':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Synced</Badge>;
      case 'syncing':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Syncing</Badge>;
      case 'error':
      case 'failed':
        return <Badge variant="destructive">Error</Badge>;
      case 'pending':
      default:
        // Distinguish between "never synced" and "awaiting sync"
        if (!lastSyncAt) {
          return <Badge variant="outline" className="text-muted-foreground">Never Synced</Badge>;
        }
        return <Badge variant="secondary">Awaiting Sync</Badge>;
    }
  };

  // Build systems list from centralized config with their connections and tracker status
  const systemsWithConnections: SystemWithConnections[] = ALL_PMS_SYSTEMS.map(config => ({
    config,
    connections: adapters.filter(a => a.system_type === config.key),
    trackerStatus: trackerStatuses.find(t => t.system_type === config.key) || null,
  }));

  // Get the latest sync across all connections for a system
  const getLatestSync = (connections: PMSAdapter[]): string | null => {
    const syncs = connections
      .map(c => c.last_sync_at)
      .filter((s): s is string => s !== null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return syncs[0] || null;
  };

  // Stats
  const totalConnections = adapters.length;
  const activeConnections = adapters.filter(a => a.is_active).length;
  const errorConnections = adapters.filter(a => a.sync_status === 'error').length;
  const deployedSystems = trackerStatuses.filter(t => t.integration_status === 'deployed').length;

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
            <div className="text-2xl font-bold">{ALL_PMS_SYSTEMS.length}</div>
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
              {deployedSystems} / {ALL_PMS_SYSTEMS.length}
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
        <div className="space-y-6">
          {systemsWithConnections.map(({ config, connections, trackerStatus }) => {
            const integrationStatus = trackerStatus?.integration_status || 'coming_soon';
            const statusInfo = getIntegrationStatusInfo(integrationStatus);
            const latestSync = getLatestSync(connections);
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
                        • Last sync: {format(new Date(latestSync), 'MMM d, HH:mm')}
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
                        <TableHead>Sync Status</TableHead>
                        <TableHead>Last Sync</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {connections.map((adapter) => (
                        <TableRow key={adapter.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(adapter.sync_status, adapter.is_active, adapter.last_sync_at)}
                              {adapter.property_name || 'Unnamed'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {adapter.environment}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getSyncStatusBadge(adapter.sync_status, adapter.is_active, adapter.last_sync_at)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {adapter.last_sync_at 
                              ? format(new Date(adapter.last_sync_at), 'MMM d, HH:mm')
                              : 'Never'
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => triggerSync(adapter)}
                                disabled={!adapter.is_active}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              
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
            </Card>
          );
        })}
        </div>
      )}
    </AppLayout>
  );
}