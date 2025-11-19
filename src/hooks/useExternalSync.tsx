import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useExternalSync = () => {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const syncRatesAndAvailability = async (
    propertyId: string,
    externalSystem: string,
    startDate: string,
    endDate: string
  ) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-rates-availability', {
        body: {
          property_id: propertyId,
          external_system: externalSystem,
          start_date: startDate,
          end_date: endDate,
        },
      });

      if (error) throw error;

      toast({
        title: 'Sync successful',
        description: `Synced ${data.rates_synced} rates and ${data.availability_synced} availability records from ${externalSystem}`,
      });

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Sync failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  const pushBooking = async (bookingId: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-booking', {
        body: {
          booking_id: bookingId,
        },
      });

      if (error) throw error;

      const successfulSyncs = data.results.filter((r: any) => r.success);
      const failedSyncs = data.results.filter((r: any) => !r.success);

      if (successfulSyncs.length > 0) {
        toast({
          title: 'Booking synced',
          description: `Successfully pushed booking to ${successfulSyncs.map((s: any) => s.system).join(', ')}`,
        });
      }

      if (failedSyncs.length > 0) {
        toast({
          title: 'Partial sync failure',
          description: `Failed to sync with ${failedSyncs.map((f: any) => f.system).join(', ')}`,
          variant: 'destructive',
        });
      }

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Booking push failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  const getSyncStatus = async (bookingId: string) => {
    try {
      const { data, error } = await supabase
        .from('booking_sync_status')
        .select('*')
        .eq('booking_id', bookingId);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching sync status:', error);
      return [];
    }
  };

  const getSyncLogs = async (propertyId?: string, bookingId?: string, limit = 50) => {
    try {
      let query = supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      if (bookingId) {
        query = query.eq('booking_id', bookingId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching sync logs:', error);
      return [];
    }
  };

  return {
    syncing,
    syncRatesAndAvailability,
    pushBooking,
    getSyncStatus,
    getSyncLogs,
  };
};
