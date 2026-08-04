import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Bell, RefreshCw, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  component_key: string | null;
  property_id: string | null;
  metadata: Record<string, unknown>;
  is_resolved: boolean;
  created_at: string;
}

interface SystemAlertsPanelProps {
  maxAlerts?: number;
  showHeader?: boolean;
  compact?: boolean;
}

export function SystemAlertsPanel({ 
  maxAlerts = 5, 
  showHeader = true,
  compact = false 
}: SystemAlertsPanelProps) {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, [maxAlerts]);

  const loadAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('severity', { ascending: true }) // critical first
        .order('created_at', { ascending: false })
        .limit(maxAlerts);

      if (error) throw error;
      setAlerts((data as SystemAlert[]) || []);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    setResolving(alertId);
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ 
          is_resolved: true, 
          resolved_at: new Date().toISOString() 
        })
        .eq('id', alertId);

      if (error) throw error;
      
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success('Alert resolved');
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast.error('Failed to resolve alert');
    } finally {
      setResolving(null);
    }
  };

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          icon: XCircle,
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-500/10',
          badge: 'destructive' as const,
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-500/10',
          badge: 'secondary' as const,
        };
      default:
        return {
          icon: Bell,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-500/10',
          badge: 'outline' as const,
        };
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      rate_drift: 'Rate',
      sync_failure: 'Sync',
      conversion_drop: 'Conversion',
      latency_spike: 'Latency',
      availability_issue: 'Availability',
      booking_anomaly: 'Booking',
      security: 'Security',
      custom: 'Alert',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        {showHeader && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              System Alerts
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No active alerts — all systems operating normally
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={alerts.some(a => a.severity === 'critical') 
      ? "border-red-500/50 bg-red-500/5" 
      : alerts.some(a => a.severity === 'warning')
        ? "border-amber-500/50 bg-amber-500/5"
        : ""
    }>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-base">System Alerts</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {alerts.length}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={loadAlerts}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <CardDescription>TOBI-detected anomalies requiring attention</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {alerts.map((alert) => {
          const config = getSeverityConfig(alert.severity);
          const Icon = config.icon;

          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">{alert.title}</span>
                  <Badge variant={config.badge} className="text-[10px] px-1.5 py-0">
                    {getAlertTypeLabel(alert.alert_type)}
                  </Badge>
                </div>
                {!compact && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {alert.message}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => resolveAlert(alert.id)}
                disabled={resolving === alert.id}
              >
                {resolving === alert.id ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          );
        })}
        
        {alerts.length >= maxAlerts && (
          <Button variant="link" size="sm" className="w-full text-xs">
            View all alerts <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
