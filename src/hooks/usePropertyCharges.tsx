import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchPropertyRoomTypes } from "@/hooks/usePropertyRoomTypes";
import type { PropertyCharge, ChargePreset } from "@/components/charges/ChargeCalculator";
import type { Json } from "@/integrations/supabase/types";

export function usePropertyCharges(propertyId: string | null) {
  const queryClient = useQueryClient();

  // Fetch property charges
  const chargesQuery = useQuery({
    queryKey: ['property-charges', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('property_charges')
        .select('*')
        .eq('property_id', propertyId)
        .order('display_order');
      if (error) throw error;
      return data as PropertyCharge[];
    },
    enabled: !!propertyId,
  });

  // Fetch charge presets
  const presetsQuery = useQuery({
    queryKey: ['charge-presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charge_presets')
        .select('*')
        .eq('is_common', true)
        .order('display_order');
      if (error) throw error;
      return data as ChargePreset[];
    },
  });

  // Create charge mutation
  const createCharge = useMutation({
    mutationFn: async (charge: Omit<PropertyCharge, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('property_charges')
        .insert(charge)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-charges', propertyId] });
      toast.success("Charge created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create charge: " + error.message);
    },
  });

  // Update charge mutation
  const updateCharge = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PropertyCharge> & { id: string }) => {
      const { data, error } = await supabase
        .from('property_charges')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-charges', propertyId] });
      toast.success("Charge updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update charge: " + error.message);
    },
  });

  // Delete charge mutation
  const deleteCharge = useMutation({
    mutationFn: async (chargeId: string) => {
      const { error } = await supabase
        .from('property_charges')
        .delete()
        .eq('id', chargeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-charges', propertyId] });
      toast.success("Charge deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete charge: " + error.message);
    },
  });

  // Toggle charge active status
  const toggleChargeActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('property_charges')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-charges', propertyId] });
    },
    onError: (error) => {
      toast.error("Failed to toggle charge: " + error.message);
    },
  });

  // Reorder charges mutation
  const reorderCharges = useMutation({
    mutationFn: async (chargeOrders: { id: string; display_order: number }[]) => {
      const updates = chargeOrders.map(({ id, display_order }) =>
        supabase
          .from('property_charges')
          .update({ display_order })
          .eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-charges', propertyId] });
    },
    onError: (error) => {
      toast.error("Failed to reorder charges: " + error.message);
    },
  });

  // Copy charges to other properties with smart room name matching
  const copyCharges = useMutation({
    mutationFn: async ({ 
      sourceCharges, 
      targetPropertyIds, 
      mode 
    }: { 
      sourceCharges: PropertyCharge[]; 
      targetPropertyIds: string[]; 
      mode: 'replace' | 'merge';
    }) => {
      // Fetch source room types once for name mapping
      const sourceRoomTypes = propertyId ? await fetchPropertyRoomTypes(propertyId) : [];
      const sourceRoomNameById: Record<string, string> = {};
      sourceRoomTypes.forEach(rt => { sourceRoomNameById[rt.id] = rt.name; });

      let unmatchedWarnings = 0;

      for (const targetPropertyId of targetPropertyIds) {
        if (mode === 'replace') {
          await supabase
            .from('property_charges')
            .delete()
            .eq('property_id', targetPropertyId);
        }

        // Fetch target room types for name-based matching
        const targetRoomTypes = await fetchPropertyRoomTypes(targetPropertyId);
        const targetRoomByName: Record<string, string> = {};
        targetRoomTypes.forEach(rt => { targetRoomByName[rt.name.toLowerCase()] = rt.id; });

        const chargesToInsert = sourceCharges.map(charge => {
          let mappedRoomTypeIds: string[] = [];
          let mappedOverrides: Record<string, Json> = {};
          let appliesToAllRooms = charge.applies_to_all_rooms;

          if (!charge.applies_to_all_rooms && charge.room_type_ids?.length) {
            for (const srcId of charge.room_type_ids) {
              const srcName = sourceRoomNameById[srcId];
              if (!srcName) continue;
              const targetId = targetRoomByName[srcName.toLowerCase()];
              if (targetId) {
                mappedRoomTypeIds.push(targetId);
                // Remap overrides
                const overrides = charge.room_charge_overrides as Record<string, unknown> | null;
                if (overrides?.[srcId]) {
                  mappedOverrides[targetId] = overrides[srcId];
                }
              }
            }
            if (mappedRoomTypeIds.length === 0) {
              // No matches — fall back to all rooms
              appliesToAllRooms = true;
              unmatchedWarnings++;
            }
          }

          return {
            property_id: targetPropertyId,
            name: charge.name,
            internal_code: charge.internal_code,
            category: charge.category,
            calculation_method: charge.calculation_method,
            amount: charge.amount,
            currency: charge.currency,
            percentage_apply_to: charge.percentage_apply_to,
            min_cap: charge.min_cap,
            max_cap: charge.max_cap,
            applies_to_all_rooms: appliesToAllRooms,
            room_type_ids: appliesToAllRooms ? [] : mappedRoomTypeIds,
            rate_type_ids: charge.rate_type_ids,
            room_charge_overrides: appliesToAllRooms ? {} : mappedOverrides,
            min_nights: charge.min_nights,
            max_nights: charge.max_nights,
            applies_to_adults: charge.applies_to_adults,
            applies_to_children: charge.applies_to_children,
            applies_to_infants: charge.applies_to_infants,
            is_refundable: charge.is_refundable,
            refund_timing: charge.refund_timing,
            refund_type: charge.refund_type,
            partial_refund_percentage: charge.partial_refund_percentage,
            description: charge.description,
            display_order: charge.display_order,
            is_active: charge.is_active,
          };
        });

        if (mode === 'merge') {
          const { data: existingCharges } = await supabase
            .from('property_charges')
            .select('internal_code')
            .eq('property_id', targetPropertyId);

          const existingCodes = new Set(existingCharges?.map(c => c.internal_code) || []);
          const newCharges = chargesToInsert.filter(c => !existingCodes.has(c.internal_code));
          
          if (newCharges.length > 0) {
            await supabase.from('property_charges').insert(newCharges);
          }
        } else {
          await supabase.from('property_charges').insert(chargesToInsert);
        }
      }

      return { unmatchedWarnings };
    },
    onSuccess: (result, { targetPropertyIds }) => {
      toast.success(`Charges copied to ${targetPropertyIds.length} properties`);
      if (result.unmatchedWarnings > 0) {
        toast.warning(`${result.unmatchedWarnings} charge(s) had no matching rooms and were set to "All Rooms"`);
      }
    },
    onError: (error) => {
      toast.error("Failed to copy charges: " + error.message);
    },
  });

  return {
    charges: chargesQuery.data || [],
    presets: presetsQuery.data || [],
    isLoading: chargesQuery.isLoading,
    isPresetsLoading: presetsQuery.isLoading,
    createCharge,
    updateCharge,
    deleteCharge,
    toggleChargeActive,
    reorderCharges,
    copyCharges,
    refetch: chargesQuery.refetch,
  };
}

// Hook to fetch charges for booking calculations (public facing)
export function useChargesForBooking(propertyId: string | null) {
  return useQuery({
    queryKey: ['property-charges-booking', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('property_charges')
        .select('*')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as PropertyCharge[];
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
