import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link2, Unlink, Building2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { DisconnectPMSDialog, type DisconnectAction } from './DisconnectPMSDialog';
import { HostfullyBuildingImportDialog } from './HostfullyBuildingImportDialog';
import { parseHostfullyProperties, type ParsedBuilding } from '@/lib/hostfullyBuildingParser';

interface OwnerPMSCredential {
  id: string;
  owner_id: string;
  system_type: string;
  api_key: string | null;
  environment: string;
  external_account_id: string | null;
  external_account_name: string | null;
  available_listings: any[] | null;
  last_sync_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
  is_active: boolean;
}

interface OwnerPMSConnectionCardProps {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  existingCredential?: OwnerPMSCredential | null;
  onCredentialChange?: () => void;
}

export function OwnerPMSConnectionCard({
  ownerId,
  ownerName,
  ownerEmail,
  existingCredential,
  onCredentialChange,
}: OwnerPMSConnectionCardProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [buildingImportDialogOpen, setBuildingImportDialogOpen] = useState(false);
  const [parsedBuildings, setParsedBuildings] = useState<ParsedBuilding[]>([]);
  const [fetchingBuildings, setFetchingBuildings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [trackerEnvironment, setTrackerEnvironment] = useState<'sandbox' | 'production'>('sandbox');

  // Fetch tracker environment on mount - this is the source of truth for API calls
  useEffect(() => {
    const fetchTrackerEnv = async () => {
      const { data } = await supabase
        .from('pms_tracker_status')
        .select('active_environment')
        .eq('system_type', 'hostfully')
        .maybeSingle();
      
      if (data?.active_environment) {
        setTrackerEnvironment(data.active_environment as 'sandbox' | 'production');
      }
    };
    fetchTrackerEnv();
  }, []);

  // Use tracker environment as the source of truth for ALL API calls
  const environment = trackerEnvironment;
  const [syncing, setSyncing] = useState(false);
  const [buildingsData, setBuildingsData] = useState<{ total: number; imported: number }>({ total: 0, imported: 0 });

  const credential = existingCredential;
  const isConnected = credential?.is_active && credential?.sync_status === 'connected';

  // Parse available_listings into buildings to get total count
  useEffect(() => {
    if (credential?.available_listings && Array.isArray(credential.available_listings)) {
      const buildings = parseHostfullyProperties(credential.available_listings);
      setBuildingsData(prev => ({ ...prev, total: buildings.length }));
    } else {
      setBuildingsData(prev => ({ ...prev, total: 0 }));
    }
  }, [credential?.available_listings]);

  // Query imported property count for this credential (only active properties)
  const refreshImportedCount = async () => {
    if (!credential?.id) return;
    const { count } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('owner_pms_credential_id', credential.id)
      .eq('is_active', true)
      .is('permanently_deleted_at', null);
    setBuildingsData(prev => ({ ...prev, imported: count || 0 }));
  };

  useEffect(() => {
    refreshImportedCount();
  }, [credential?.id]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setValidating(true);
    try {
      // Validate the API key
      // Don't send environment - edge function will fetch current tracker environment
      const { data, error } = await supabase.functions.invoke('hostfully-api', {
        body: {
          action: 'validate_api_key',
          api_key: apiKey,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error?.message || 'Invalid API key');
        return;
      }

      // Create or update owner_pms_credentials
      const credentialData = {
        owner_id: ownerId,
        system_type: 'hostfully',
        api_key: apiKey,
        environment,
        external_account_id: data.data.agency_uid,
        external_account_name: data.data.agency_name,
        sync_status: 'connected',
        is_active: true,
      };

      if (credential?.id) {
        const { error: updateError } = await supabase
          .from('owner_pms_credentials')
          .update(credentialData)
          .eq('id', credential.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('owner_pms_credentials')
          .insert(credentialData);

        if (insertError) throw insertError;
      }

      toast.success(`Connected to Hostfully (${data.data.property_count} properties)`);
      setConnectDialogOpen(false);
      setApiKey('');
      onCredentialChange?.();

      // Auto-sync listings after connecting
      handleSyncListings();
    } catch (error: any) {
      console.error('Failed to connect:', error);
      toast.error(error.message || 'Failed to connect to Hostfully');
    } finally {
      setValidating(false);
    }
  };

  const handleSyncListings = async () => {
    // Sync now triggers the building import dialog
    await handleOpenBuildingImporter();
  };

  const handleDisconnect = async (action: DisconnectAction) => {
    if (!credential?.id) return;

    try {
      // Handle properties based on action
      if (action === 'delete') {
        // Delete properties linked to this credential
        await supabase
          .from('properties')
          .delete()
          .eq('owner_pms_credential_id', credential.id);
      } else if (action === 'convert_native') {
        // Convert to native ROL properties
        await supabase
          .from('properties')
          .update({
            owner_pms_credential_id: null,
            external_system: null,
            hostfully_property_uid: null,
            pms_managed_fields: [],
            pms_sync_status: null,
          })
          .eq('owner_pms_credential_id', credential.id);
      } else {
        // Keep as inactive
        await supabase
          .from('properties')
          .update({ is_active: false })
          .eq('owner_pms_credential_id', credential.id);
      }

      // Delete the credential
      const { error } = await supabase
        .from('owner_pms_credentials')
        .delete()
        .eq('id', credential.id);

      if (error) throw error;

      toast.success('Disconnected from Hostfully');
      setDisconnectDialogOpen(false);
      onCredentialChange?.();
    } catch (error: any) {
      console.error('Disconnect failed:', error);
      toast.error(error.message || 'Failed to disconnect');
    }
  };

  const handleOpenBuildingImporter = async () => {
    if (!credential?.id) return;

    setFetchingBuildings(true);
    try {
      // Fetch all properties using list_all_properties
      const { data, error } = await supabase.functions.invoke('hostfully-api', {
        body: {
          action: 'list_all_properties',
          owner_credential_id: credential.id,
        },
      });

      if (error) throw error;

      if (!data?.success || !data?.data?.properties) {
        toast.error(data?.error?.message || 'Failed to fetch properties');
        return;
      }

      // Parse into buildings using the building parser
      const buildings = parseHostfullyProperties(data.data.properties);
      
      if (buildings.length === 0) {
        toast.error('No buildings found in Hostfully account');
        return;
      }

      setParsedBuildings(buildings);
      setBuildingImportDialogOpen(true);
    } catch (error: any) {
      console.error('Failed to fetch buildings:', error);
      toast.error(error.message || 'Failed to fetch properties from Hostfully');
    } finally {
      setFetchingBuildings(false);
    }
  };

  const getSyncStatus = (): 'idle' | 'syncing' | 'success' | 'error' => {
    if (syncing) return 'syncing';
    if (credential?.sync_status === 'error') return 'error';
    if (credential?.sync_status === 'connected') return 'success';
    return 'idle';
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-medium">Hostfully</CardTitle>
                <CardDescription className="text-xs">
                  Property management integration
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {environment === 'sandbox' && (
                <Badge variant="outline" className="text-xs bg-warning-surface text-warning border-warning-border">
                  Sandbox
                </Badge>
              )}
              {isConnected && (
                <Badge variant="outline" className="text-xs bg-success-surface text-success border-success-border">
                  <Check className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isConnected ? (
            <div className="space-y-4">
              {/* Connection Info */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Agency</span>
                  <span className="text-xs font-medium">
                    {credential?.external_account_name || credential?.external_account_id || 'Connected'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Buildings</span>
                  <span className="text-xs font-medium">
                    {buildingsData.imported > 0
                      ? buildingsData.total > 0
                        ? `${buildingsData.imported}/${buildingsData.total} imported`
                        : `${buildingsData.imported} imported`
                      : buildingsData.total > 0
                        ? `${buildingsData.total} available`
                        : 'Sync to fetch'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Environment</span>
                  <Badge variant="secondary" className="text-[10px] py-0">
                    {credential?.environment || 'production'}
                  </Badge>
                </div>
              </div>

              {/* Sync Status */}
              <SyncStatusIndicator
                status={getSyncStatus()}
                lastSyncAt={credential?.last_sync_at || undefined}
                onSync={handleSyncListings}
                showButton
              />

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleOpenBuildingImporter}
                  disabled={fetchingBuildings}
                >
                  {fetchingBuildings ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5" />
                  )}
                  Import Properties
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDisconnectDialogOpen(true)}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              </div>

              {credential?.sync_error && (
                <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{credential.sync_error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Connect {ownerName}'s Hostfully account to import and sync properties.
              </p>
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => setConnectDialogOpen(true)}
              >
                <Link2 className="h-3.5 w-3.5" />
                Connect Hostfully
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Hostfully</DialogTitle>
            <DialogDescription>
              Enter the Hostfully API key for {ownerName}'s account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter Hostfully API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in Hostfully under Settings → API Keys
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={validating || !apiKey.trim()}>
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Building Import Dialog */}
      <HostfullyBuildingImportDialog
        open={buildingImportDialogOpen}
        onOpenChange={setBuildingImportDialogOpen}
        buildings={parsedBuildings}
        ownerCredentialId={credential?.id || ''}
        ownerName={ownerName}
        ownerEmail={ownerEmail}
        onImportComplete={() => {
          refreshImportedCount();
          onCredentialChange?.();
        }}
      />

      {/* Disconnect Dialog */}
      <DisconnectPMSDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        systemName="Hostfully"
        affectedPropertyCount={buildingsData.imported}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
