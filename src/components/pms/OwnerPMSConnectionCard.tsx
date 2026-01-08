import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Link2, Unlink, RefreshCw, Building2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { PMSListingSelector, type PMSListing } from './PMSListingSelector';
import { DisconnectPMSDialog, type DisconnectAction } from './DisconnectPMSDialog';

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
  const [listingSelectorOpen, setListingSelectorOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const environment = 'production'; // Always production for owners
  const [validating, setValidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  const credential = existingCredential;
  const isConnected = credential?.is_active && credential?.sync_status === 'connected';
  const listingsCount = credential?.available_listings?.length || 0;

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setValidating(true);
    try {
      // Validate the API key
      const { data, error } = await supabase.functions.invoke('hostfully-api', {
        body: {
          action: 'validate_api_key',
          api_key: apiKey,
          environment,
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
    if (!credential?.id) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('hostfully-api', {
        body: {
          action: 'sync_owner_listings',
          owner_credential_id: credential.id,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error?.message || 'Sync failed');
        return;
      }

      toast.success(`Synced ${data.data.count} properties from Hostfully`);
      onCredentialChange?.();
    } catch (error: any) {
      console.error('Sync failed:', error);
      toast.error(error.message || 'Failed to sync listings');
    } finally {
      setSyncing(false);
    }
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

  const handleImportListings = async (
    listings: PMSListing[],
    importMode: 'create' | 'attach',
    targetPropertyId?: string
  ) => {
    if (!credential?.id) return;

    setImporting(true);
    try {
      for (const listing of listings) {
        // Get full details for each listing
        const { data: detailsData } = await supabase.functions.invoke('hostfully-api', {
          body: {
            action: 'get_listing_details',
            owner_credential_id: credential.id,
            propertyUid: listing.id,
          },
        });

        const details = detailsData?.data || {};

        // Create property
        const propertyData = {
          name: listing.name || details.name || 'Imported Property',
          address: details.address?.street || listing.address || 'Address from Hostfully',
          city: details.address?.city || listing.city || 'City',
          country: details.address?.country || listing.country || 'Country',
          property_type: (listing as any).property_type || details.property_type || 'property',
          max_guests: listing.max_guests || details.max_guests || 2,
          bedrooms: listing.bedrooms || details.bedrooms || 1,
          bathrooms: listing.bathrooms || details.bathrooms || 1,
          price_per_night: listing.base_price || details.pricing?.base_daily_rate || 0,
          description: details.description || null,
          images: details.images || [],
          latitude: details.location?.latitude || null,
          longitude: details.location?.longitude || null,
          // PMS linking
          external_system: 'hostfully',
          external_id: listing.id,
          hostfully_property_uid: listing.id,
          owner_pms_credential_id: credential.id,
          pms_managed_fields: ['name', 'description', 'images', 'max_guests', 'price_per_night'],
          pms_sync_status: 'synced',
          last_pms_sync_at: new Date().toISOString(),
          // Owner info
          owner_name: ownerName,
          owner_email: ownerEmail,
          is_active: true,
        };

        const { data: newProperty, error: insertError } = await supabase
          .from('properties')
          .insert(propertyData)
          .select()
          .single();

        if (insertError) {
          console.error('Failed to create property:', insertError);
          continue;
        }

        // Create room types in hostfully_room_types
        if (newProperty) {
          const { data: roomsData } = await supabase.functions.invoke('hostfully-api', {
            body: {
              action: 'get_property_rooms',
              owner_credential_id: credential.id,
              propertyUid: listing.id,
            },
          });

          const rooms = roomsData?.data?.rooms || [];
          for (const room of rooms) {
            await supabase.from('hostfully_room_types').insert({
              property_id: newProperty.id,
              hostfully_room_id: room.hostfully_room_id || room.id,
              name: room.name,
              description: room.description,
              max_guests: room.max_guests,
              bedrooms: room.bedrooms,
              bathrooms: room.bathrooms,
              beds: room.beds,
              daily_rate: room.daily_rate,
              currency: room.currency,
              images: room.images || [],
              amenities: room.amenities || [],
              raw_data: room,
              is_active: true,
            });
          }
        }
      }

      toast.success(`Imported ${listings.length} properties from Hostfully`);
      setListingSelectorOpen(false);
      onCredentialChange?.();
    } catch (error: any) {
      console.error('Import failed:', error);
      toast.error(error.message || 'Failed to import properties');
    } finally {
      setImporting(false);
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
            {isConnected && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
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
                  <span className="text-xs text-muted-foreground">Properties</span>
                  <span className="text-xs font-medium">{listingsCount} available</span>
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
                  onClick={() => setListingSelectorOpen(true)}
                  disabled={listingsCount === 0}
                >
                  <Building2 className="h-3.5 w-3.5" />
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

      {/* Listing Selector */}
      <PMSListingSelector
        open={listingSelectorOpen}
        onOpenChange={setListingSelectorOpen}
        systemType="hostfully"
        onImport={handleImportListings}
        existingProperties={[]} // Could pass existing properties for attach mode
      />

      {/* Disconnect Dialog */}
      <DisconnectPMSDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        systemName="Hostfully"
        affectedPropertyCount={listingsCount}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
