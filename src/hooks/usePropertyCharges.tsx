import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchPropertyRoomTypes } from "@/hooks/usePropertyRoomTypes";
import type { PropertyCharge, ChargePreset } from "@/components/charges/ChargeCalculator";
import type { Json } from "@/integrations/supabase/types";
import { CHARGES_CHANGE_FIELD } from "@/lib/channelPushFields";
import { pushChangedChannelFields } from "@/lib/channelSavePush";

export function usePropertyCharges(propertyId: string | null) {
  const queryClient = useQueryClient();

  /**
   * A charge change alters the pushed listing (deposit / cleaning amounts), so it owes the
   * channel a static delta exactly like a property save does. Fire-and-forget: the channel
   * round-trip must never block the charges UI.
   */
  const pushChargesToChannel = () => {
    if (!propertyId) return;
    void pushChangedChannelFields(propertyId, [CHARGES_CHANGE_FIELD], ({ title, description, variant }) => {
      if (variant === "destructive") toast.error(title, { description });
      else toast.success(title, { description });
    });
  };

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
      pushChargesToChannel();
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
      pushChargesToChannel();
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
      pushChargesToChannel();
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
      pushChargesToChannel();
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
                const overrides = charge.room_charge_overrides as Record<string, Json> | null;
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
            // Revenue-stream classification must survive the copy, otherwise
            // F&B charges land as accommodation on the target property.
            revenue_stream: charge.revenue_stream ?? 'accommodation',
            is_included_in_rate: charge.is_included_in_rate ?? false,

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
// Falls back to hostfully_room_types charges when property_charges is empty
export function useChargesForBooking(propertyId: string | null) {
  return useQuery({
    queryKey: ['property-charges-booking', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];

      // 1. Try property_charges first (manually configured or synced)
      const { data: charges, error } = await supabase
        .from('property_charges')
        .select('*')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;

      if (charges && charges.length > 0) {
        // Hostfully compatibility: include both internal room IDs and external hostfully_room_id aliases
        const roomScopedCharges = charges.filter(c => !c.applies_to_all_rooms && (c.room_type_ids?.length || 0) > 0);

        if (roomScopedCharges.length === 0) {
          return charges as PropertyCharge[];
        }

        const { data: hfRooms } = await supabase
          .from('hostfully_room_types')
          .select('id, hostfully_room_id')
          .eq('property_id', propertyId)
          .eq('is_active', true);

        const internalToExternal = new Map<string, string>();
        const externalToInternal = new Map<string, string>();

        for (const room of hfRooms || []) {
          if (room.id && room.hostfully_room_id) {
            internalToExternal.set(room.id, String(room.hostfully_room_id));
            externalToInternal.set(String(room.hostfully_room_id), room.id);
          }
        }

        const normalized = charges.map((charge) => {
          if (charge.applies_to_all_rooms || !charge.room_type_ids?.length) {
            return charge;
          }

          const mergedRoomIds = new Set<string>(charge.room_type_ids);
          for (const roomId of charge.room_type_ids) {
            const externalId = internalToExternal.get(roomId);
            if (externalId) mergedRoomIds.add(externalId);

            const internalId = externalToInternal.get(roomId);
            if (internalId) mergedRoomIds.add(internalId);
          }

          const existingOverrides = (charge.room_charge_overrides || {}) as Record<string, number>;
          const normalizedOverrides: Record<string, number> = { ...existingOverrides };

          for (const [internalId, externalId] of internalToExternal.entries()) {
            if (existingOverrides[internalId] != null && normalizedOverrides[externalId] == null) {
              normalizedOverrides[externalId] = existingOverrides[internalId];
            }
            if (existingOverrides[externalId] != null && normalizedOverrides[internalId] == null) {
              normalizedOverrides[internalId] = existingOverrides[externalId];
            }
          }

          return {
            ...charge,
            room_type_ids: Array.from(mergedRoomIds),
            room_charge_overrides: Object.keys(normalizedOverrides).length > 0 ? normalizedOverrides : null,
          };
        });

        return normalized as PropertyCharge[];
      }

      // 2. Fallback: synthesize from hostfully_room_types if they have fee fields
      const { data: hfRooms } = await supabase
        .from('hostfully_room_types')
        .select('id, name, cleaning_fee, security_deposit, extra_guest_fee, tax_rate, currency')
        .eq('property_id', propertyId)
        .eq('is_active', true);

      if (!hfRooms || hfRooms.length === 0) return [];

      const synthesized: PropertyCharge[] = [];
      let order = 0;

      // Aggregate unique charges across all room types
      // For property-wide fees, use the first non-null value found
      const cleaningFee = hfRooms.find(r => r.cleaning_fee && r.cleaning_fee > 0)?.cleaning_fee;
      const securityDeposit = hfRooms.find(r => r.security_deposit && r.security_deposit > 0)?.security_deposit;
      const extraGuestFee = hfRooms.find(r => r.extra_guest_fee && r.extra_guest_fee > 0)?.extra_guest_fee;
      const taxRate = hfRooms.find(r => r.tax_rate && r.tax_rate > 0)?.tax_rate;
      const currency = hfRooms[0]?.currency || 'ZAR';

      // Build room-specific overrides for cleaning fee if they differ
      const cleaningOverrides: Record<string, number> = {};
      const depositOverrides: Record<string, number> = {};
      const extraGuestOverrides: Record<string, number> = {};
      for (const r of hfRooms) {
        if (r.cleaning_fee && r.cleaning_fee > 0) cleaningOverrides[r.id] = r.cleaning_fee;
        if (r.security_deposit && r.security_deposit > 0) depositOverrides[r.id] = r.security_deposit;
        if (r.extra_guest_fee && r.extra_guest_fee > 0) extraGuestOverrides[r.id] = r.extra_guest_fee;
      }

      if (cleaningFee) {
        synthesized.push({
          id: `hf-cleaning-${propertyId}`,
          property_id: propertyId,
          name: 'Cleaning Fee',
          internal_code: null,
          category: 'fee',
          revenue_stream: 'accommodation' as const,
          is_included_in_rate: false,
          calculation_method: 'flat_per_stay',
          amount: cleaningFee,
          currency,
          applies_to_all_rooms: true,
          room_type_ids: [],
          rate_type_ids: [],
          room_charge_overrides: Object.keys(cleaningOverrides).length > 1 ? cleaningOverrides : null,
          min_nights: 0,
          max_nights: 0,
          applies_to_adults: true,
          applies_to_children: true,
          applies_to_infants: false,
          is_refundable: false,
          display_order: order++,
          is_active: true,
        });
      }

      if (securityDeposit) {
        synthesized.push({
          id: `hf-deposit-${propertyId}`,
          property_id: propertyId,
          name: 'Security Deposit',
          internal_code: null,
          category: 'deposit',
          revenue_stream: 'accommodation' as const,
          is_included_in_rate: false,
          calculation_method: 'flat_per_stay',
          amount: securityDeposit,
          currency,
          applies_to_all_rooms: true,
          room_type_ids: [],
          rate_type_ids: [],
          room_charge_overrides: Object.keys(depositOverrides).length > 1 ? depositOverrides : null,
          min_nights: 0,
          max_nights: 0,
          applies_to_adults: true,
          applies_to_children: true,
          applies_to_infants: false,
          is_refundable: true,
          refund_timing: 'after_inspection',
          refund_type: 'full',
          display_order: order++,
          is_active: true,
        });
      }

      if (extraGuestFee) {
        synthesized.push({
          id: `hf-extraguest-${propertyId}`,
          property_id: propertyId,
          name: 'Extra Guest Fee',
          internal_code: null,
          category: 'fee',
          revenue_stream: 'accommodation' as const,
          is_included_in_rate: false,
          calculation_method: 'per_person_per_night',
          amount: extraGuestFee,
          currency,
          applies_to_all_rooms: true,
          room_type_ids: [],
          rate_type_ids: [],
          room_charge_overrides: Object.keys(extraGuestOverrides).length > 1 ? extraGuestOverrides : null,
          min_nights: 0,
          max_nights: 0,
          applies_to_adults: true,
          applies_to_children: true,
          applies_to_infants: false,
          is_refundable: false,
          display_order: order++,
          is_active: true,
        });
      }

      if (taxRate) {
        synthesized.push({
          id: `hf-tax-${propertyId}`,
          property_id: propertyId,
          name: 'Tax',
          internal_code: null,
          category: 'tax',
          revenue_stream: 'accommodation' as const,
          is_included_in_rate: false,
          calculation_method: 'percentage_of_accommodation',
          amount: taxRate,
          currency,
          applies_to_all_rooms: true,
          room_type_ids: [],
          rate_type_ids: [],
          min_nights: 0,
          max_nights: 0,
          applies_to_adults: true,
          applies_to_children: true,
          applies_to_infants: true,
          is_refundable: false,
          display_order: order++,
          is_active: true,
        });
      }

      if (synthesized.length > 0) {
        console.log('[useChargesForBooking] Synthesized', synthesized.length, 'charges from Hostfully room types');
      }

      return synthesized;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });
}
