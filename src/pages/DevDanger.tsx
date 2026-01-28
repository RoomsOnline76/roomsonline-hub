import { useState, useEffect, useCallback } from "react";
import { 
  AlertTriangle, 
  Trash2,
  RefreshCw,
  Database,
  Shield,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SystemStatus {
  cacheCount: number;
  stuckSyncCount: number;
  pendingBookingSyncCount: number;
  loading: boolean;
}

interface DangerAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  confirmText: string;
  action: () => Promise<void>;
  getCount: () => number;
}

export default function DevDanger() {
  const { user, profile } = useAuth();
  const [confirmInput, setConfirmInput] = useState("");
  const [executing, setExecuting] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus>({
    cacheCount: 0,
    stuckSyncCount: 0,
    pendingBookingSyncCount: 0,
    loading: true,
  });

  const fetchSystemStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    
    const [cacheResult, syncResult, bookingSyncResult] = await Promise.all([
      supabase.from('pms_availability_cache').select('id', { count: 'exact', head: true }),
      supabase.from('pms_credentials').select('id', { count: 'exact', head: true }).or('sync_status.eq.error,sync_status.eq.failed'),
      supabase.from('booking_sync_status').select('id', { count: 'exact', head: true }),
    ]);

    setStatus({
      cacheCount: cacheResult.count || 0,
      stuckSyncCount: syncResult.count || 0,
      pendingBookingSyncCount: bookingSyncResult.count || 0,
      loading: false,
    });
  }, []);

  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  const logDangerAction = async (actionId: string, actionTitle: string) => {
    try {
      await supabase.functions.invoke('log-audit-event', {
        body: {
          table_name: 'system',
          record_id: actionId,
          action_type: 'delete',
          change_summary: `DANGER ZONE: ${actionTitle}`,
          user_id: user?.id,
          user_email: user?.email || 'unknown',
          user_role: 'dev',
          request_origin: 'web_app',
          is_sensitive: true,
          metadata: {
            danger_action: true,
            executed_by: profile?.full_name || user?.email,
            executed_at: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Failed to log danger action:', error);
    }
  };

  const dangerActions: DangerAction[] = [
    {
      id: 'clear-sync-cache',
      title: 'Clear Sync Cache',
      description: 'Removes all cached availability and rate data. This will force a full re-sync from all PMS sources on next fetch.',
      icon: RefreshCw,
      confirmText: 'CLEAR CACHE',
      getCount: () => status.cacheCount,
      action: async () => {
        const { error } = await supabase
          .from('pms_availability_cache')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) throw error;
        await logDangerAction('clear-sync-cache', 'Clear Sync Cache');
        toast.success('Sync cache cleared successfully');
        fetchSystemStatus();
      },
    },
    {
      id: 'reset-sync-status',
      title: 'Reset All Sync Status',
      description: 'Resets the sync status of all PMS credentials to "pending". Use when adapters are stuck in error state.',
      icon: Database,
      confirmText: 'RESET STATUS',
      getCount: () => status.stuckSyncCount,
      action: async () => {
        const { error } = await supabase
          .from('pms_credentials')
          .update({ sync_status: 'pending', last_sync_at: null })
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) throw error;
        await logDangerAction('reset-sync-status', 'Reset All Sync Status');
        toast.success('All sync statuses reset');
        fetchSystemStatus();
      },
    },
    {
      id: 'clear-booking-sync',
      title: 'Clear Booking Sync Records',
      description: 'Removes all booking sync status records. This will cause bookings to be re-pushed on next sync attempt.',
      icon: XCircle,
      confirmText: 'CLEAR BOOKING SYNC',
      getCount: () => status.pendingBookingSyncCount,
      action: async () => {
        const { error } = await supabase
          .from('booking_sync_status')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) throw error;
        await logDangerAction('clear-booking-sync', 'Clear Booking Sync Records');
        toast.success('Booking sync records cleared');
        fetchSystemStatus();
      },
    },
  ];

  const executeAction = async (action: DangerAction) => {
    if (confirmInput !== action.confirmText) {
      toast.error(`Please type "${action.confirmText}" to confirm`);
      return;
    }

    setExecuting(action.id);
    try {
      await action.action();
    } catch (error) {
      console.error(`Error executing ${action.id}:`, error);
      toast.error(`Failed to execute: ${(error as Error).message}`);
    } finally {
      setExecuting(null);
      setConfirmInput("");
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="System Operations"
        subtitle="Cache and sync management tools"
      />

      {/* Danger Actions */}
      <div className="grid gap-4">
        {dangerActions.map((action) => {
          const Icon = action.icon;
          const count = action.getCount();
          const hasIssues = count > 0;
          
          return (
            <Card key={action.id} className={hasIssues ? "border-amber-500/50" : "border-green-500/30"}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${hasIssues ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                      {hasIssues ? (
                        <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{action.title}</CardTitle>
                        {status.loading ? (
                          <Badge variant="outline" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            Checking...
                          </Badge>
                        ) : hasIssues ? (
                          <Badge variant="destructive" className="text-xs">
                            {count} record{count !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-500">
                            Clear
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        {action.description}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant={hasIssues ? "destructive" : "outline"} 
                        size="sm"
                        disabled={!hasIssues || status.loading}
                      >
                        {hasIssues ? (
                          <>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Execute
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            No Action Needed
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          Confirm Action
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-4">
                            <p>
                              You are about to execute: <strong>{action.title}</strong>
                            </p>
                            <p className="text-destructive font-medium">
                              This action cannot be undone.
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="confirm-input">
                                Type <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">{action.confirmText}</code> to confirm:
                              </Label>
                              <Input
                                id="confirm-input"
                                value={confirmInput}
                                onChange={(e) => setConfirmInput(e.target.value)}
                                placeholder={action.confirmText}
                                className="font-mono"
                              />
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmInput("")}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={() => executeAction(action)}
                          disabled={confirmInput !== action.confirmText || executing === action.id}
                        >
                          {executing === action.id ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Executing...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Execute Action
                            </>
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Audit Notice */}
      <Card className="mt-8 bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>
              All actions are logged with your identity ({profile?.full_name || user?.email}) 
              and timestamp for security audit purposes.
            </span>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
