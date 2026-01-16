import { useState } from "react";
import { 
  AlertTriangle, 
  Trash2,
  RefreshCw,
  Database,
  Shield,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface DangerAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  confirmText: string;
  action: () => Promise<void>;
}

export default function DevDanger() {
  const { user, profile } = useAuth();
  const [confirmInput, setConfirmInput] = useState("");
  const [executing, setExecuting] = useState<string | null>(null);

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
      action: async () => {
        const { error } = await supabase
          .from('pms_availability_cache')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (error) throw error;
        await logDangerAction('clear-sync-cache', 'Clear Sync Cache');
        toast.success('Sync cache cleared successfully');
      },
    },
    {
      id: 'reset-sync-status',
      title: 'Reset All Sync Status',
      description: 'Resets the sync status of all PMS credentials to "pending". Use when adapters are stuck in error state.',
      icon: Database,
      confirmText: 'RESET STATUS',
      action: async () => {
        const { error } = await supabase
          .from('pms_credentials')
          .update({ sync_status: 'pending', last_sync_at: null })
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) throw error;
        await logDangerAction('reset-sync-status', 'Reset All Sync Status');
        toast.success('All sync statuses reset');
      },
    },
    {
      id: 'clear-booking-sync',
      title: 'Clear Booking Sync Records',
      description: 'Removes all booking sync status records. This will cause bookings to be re-pushed on next sync attempt.',
      icon: XCircle,
      confirmText: 'CLEAR BOOKING SYNC',
      action: async () => {
        const { error } = await supabase
          .from('booking_sync_status')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) throw error;
        await logDangerAction('clear-booking-sync', 'Clear Booking Sync Records');
        toast.success('Booking sync records cleared');
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
        title="Danger Zone"
        subtitle="Destructive operations with system-wide impact"
      />

      {/* Warning Banner */}
      <Card className="mb-8 border-destructive/50 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-destructive">Extreme Caution Required</CardTitle>
              <CardDescription className="text-destructive/80">
                Actions on this page cannot be undone. They affect the entire platform and all users.
                All actions are logged to the audit trail.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Danger Actions */}
      <div className="grid gap-4">
        {dangerActions.map((action) => {
          const Icon = action.icon;
          
          return (
            <Card key={action.id} className="border-destructive/30">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <Icon className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{action.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {action.description}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Execute
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="h-5 w-5" />
                          Confirm Destructive Action
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
              All danger zone actions are logged with your identity ({profile?.full_name || user?.email}) 
              and timestamp for security audit purposes.
            </span>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
