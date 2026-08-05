import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type PmsSource,
  type FieldAuthority,
  type PropertyEditorialField,
  PMS_EDITORIAL_RULES,
  getEditorialFieldAuthority,
  getPmsEditorialNotes,
  ACTIONS,
} from "../_shared/adapter-contract.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Field group to DB column mapping
const fieldGroupMapping: Record<PropertyEditorialField, string[]> = {
  name: ['name'],
  description: ['description'],
  location: ['address', 'city', 'country'],
  geo: ['latitude', 'longitude'],
  images: ['images'],
  amenities: ['amenities'],
};

// Normalize PMS key to match PmsSource type
const normalizePMSKey = (pmsKey: string): PmsSource | null => {
  const normalized = pmsKey.toLowerCase().replace(/[_\s-]/g, '');
  
  const keyMap: Record<string, PmsSource> = {
    'benson': 'benson',
    'checkfront': 'checkfront',
    'hostfully': 'hostfully',
    'cloudbeds': 'cloudbeds',
    'littlehotelier': 'littlehotelier',
    'nightsbridge': 'nightsbridge',
    'siteminder': 'siteminder',
    'hotelbeds': 'hotelbeds',
    'roomsonline': 'roomsonline',
  };
  
  return keyMap[normalized] || null;
};

// Get field authority using contract
const getFieldAuthority = (pmsKey: string, fieldName: string): FieldAuthority => {
  const pms = normalizePMSKey(pmsKey);
  if (!pms) return 'not_available';
  
  // Direct lookup for editorial fields
  if (fieldName in fieldGroupMapping) {
    return getEditorialFieldAuthority(pms, fieldName as PropertyEditorialField);
  }
  
  // Check field groups for DB column names
  for (const [groupName, dbFields] of Object.entries(fieldGroupMapping)) {
    if (dbFields.includes(fieldName)) {
      return getEditorialFieldAuthority(pms, groupName as PropertyEditorialField);
    }
  }
  
  return 'not_available';
};

// Get PMS adapter function name
const getPMSAdapterFunction = (pmsKey: string): string | null => {
  const pms = normalizePMSKey(pmsKey);
  if (!pms) return null;
  
  const adapterMap: Record<PmsSource, string> = {
    'benson': 'benson-api',
    'checkfront': 'checkfront-api',
    'hostfully': 'hostfully-api',
    'cloudbeds': 'cloudbeds-api',
    'littlehotelier': 'little-hotelier-api',
    'nightsbridge': 'nightsbridge-api',
    'siteminder': 'siteminder-api',
    'hotelbeds': 'hotelbeds-api',
    'roomsonline': 'roomsonline-pms-api',
    'rentalsunited': 'rentalsunited-api',
  };
  
  return adapterMap[pms] || null;
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { property_id, pms_system } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'property_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-editorial] Starting sync for property ${property_id}, PMS: ${pms_system}`);

    // Get property details
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .single();

    if (propError || !property) {
      console.error('[sync-editorial] Property not found:', propError);
      return new Response(
        JSON.stringify({ success: false, error: 'Property not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine PMS system
    const pmsKey = pms_system || property.external_system;
    if (!pmsKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'No PMS system configured for this property' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPms = normalizePMSKey(pmsKey);
    if (!normalizedPms || !PMS_EDITORIAL_RULES[normalizedPms]) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `PMS "${pmsKey}" is not configured for editorial sync`,
          available_pms: Object.keys(PMS_EDITORIAL_RULES)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const pmsRule = PMS_EDITORIAL_RULES[normalizedPms];

    // Call PMS adapter to get property data
    const adapterFunction = getPMSAdapterFunction(pmsKey);
    if (!adapterFunction) {
      return new Response(
        JSON.stringify({ success: false, error: `No adapter found for PMS "${pmsKey}"` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-editorial] Calling adapter: ${adapterFunction}`);

    // Get auth token from request for forwarding
    const authHeader = req.headers.get('authorization');
    
    // Call the PMS adapter
    const { data: pmsData, error: pmsError } = await supabase.functions.invoke(adapterFunction, {
      body: {
        action: 'fetch_property_data',
        property_id: property_id,
      },
      headers: authHeader ? { authorization: authHeader } : undefined,
    });

    if (pmsError) {
      console.error('[sync-editorial] PMS adapter error:', pmsError);
      return new Response(
        JSON.stringify({ success: false, error: `PMS adapter error: ${pmsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for adapter-level error
    if (pmsData?.success === false) {
      console.error('[sync-editorial] PMS adapter returned error:', pmsData.error);
      return new Response(
        JSON.stringify({ success: false, error: pmsData.error?.message || 'PMS sync failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unwrap adapter response
    const adapterData = pmsData?.data || pmsData;
    console.log('[sync-editorial] Adapter data received:', JSON.stringify(adapterData).slice(0, 500));

    // Build update object based on field authorities
    const updates: Record<string, any> = {};
    const syncSummary: { field: string; action: string; authority: FieldAuthority }[] = [];

    // Process each field group
    for (const [fieldGroup, dbFields] of Object.entries(fieldGroupMapping)) {
      const authority = getFieldAuthority(pmsKey, fieldGroup);
      
      if (authority === 'not_available') {
        syncSummary.push({ field: fieldGroup, action: 'skipped (not available)', authority });
        continue;
      }

      for (const dbField of dbFields) {
        // Get value from adapter data (handle both snake_case and camelCase)
        const camelField = dbField.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const pmsValue = adapterData?.[dbField] ?? adapterData?.[camelField] ?? 
                         adapterData?.property?.[dbField] ?? adapterData?.property?.[camelField];

        if (pmsValue === undefined || pmsValue === null) {
          syncSummary.push({ field: dbField, action: 'skipped (no PMS value)', authority });
          continue;
        }

        const existingValue = property[dbField];

        switch (authority) {
          case 'authoritative':
            // Always overwrite
            updates[dbField] = pmsValue;
            syncSummary.push({ field: dbField, action: 'overwritten', authority });
            break;

          case 'seed_only':
            // Only set if empty
            if (!existingValue || existingValue === '' || 
                (Array.isArray(existingValue) && existingValue.length === 0)) {
              updates[dbField] = pmsValue;
              syncSummary.push({ field: dbField, action: 'seeded (was empty)', authority });
            } else {
              syncSummary.push({ field: dbField, action: 'skipped (has existing value)', authority });
            }
            break;

          case 'partial':
            // Merge arrays, don't remove existing
            if (Array.isArray(pmsValue) && Array.isArray(existingValue)) {
              const merged = [...new Set([...existingValue, ...pmsValue])];
              updates[dbField] = merged;
              syncSummary.push({ field: dbField, action: 'merged arrays', authority });
            } else if (typeof pmsValue === 'object' && typeof existingValue === 'object') {
              updates[dbField] = { ...existingValue, ...pmsValue };
              syncSummary.push({ field: dbField, action: 'merged objects', authority });
            } else {
              // For primitives with partial, only seed if empty
              if (!existingValue) {
                updates[dbField] = pmsValue;
                syncSummary.push({ field: dbField, action: 'seeded (partial, was empty)', authority });
              } else {
                syncSummary.push({ field: dbField, action: 'skipped (partial, has value)', authority });
              }
            }
            break;
        }
    }
    }

    // === OPERATIONAL DATA SYNC (room_types, rate_types) ===
    // These are always authoritative from PMS - calendar requires them to render
    const pmsRoomTypes = adapterData?.room_types || adapterData?.roomTypes;
    const pmsRateTypes = adapterData?.rate_types || adapterData?.rateTypes;

    if ((Array.isArray(pmsRoomTypes) && pmsRoomTypes.length > 0) || 
        (Array.isArray(pmsRateTypes) && pmsRateTypes.length > 0)) {
      
      // Get current amenities and merge operational data
      const currentAmenities = updates.amenities || property.amenities || {};
      
      updates.amenities = {
        ...currentAmenities,
        ...(pmsRoomTypes?.length > 0 && { room_types: pmsRoomTypes }),
        // Write to pms_rate_types (the key the UI reads from) for compatibility
        ...(pmsRateTypes?.length > 0 && { pms_rate_types: pmsRateTypes, rate_types: pmsRateTypes }),
      };

      if (pmsRoomTypes?.length > 0) {
        console.log(`[sync-editorial] Syncing ${pmsRoomTypes.length} room types`);
        syncSummary.push({ field: 'room_types', action: `synced ${pmsRoomTypes.length} types`, authority: 'authoritative' });
      }
      if (pmsRateTypes?.length > 0) {
        console.log(`[sync-editorial] Syncing ${pmsRateTypes.length} rate types`);
        syncSummary.push({ field: 'pms_rate_types', action: `synced ${pmsRateTypes.length} types`, authority: 'authoritative' });
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      console.log('[sync-editorial] Applying updates:', updates);
      
      const { error: updateError } = await supabase
        .from('properties')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', property_id);

      if (updateError) {
        console.error('[sync-editorial] Update error:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to update property: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[sync-editorial] Sync complete:', syncSummary);

    return new Response(
      JSON.stringify({
        success: true,
        pms: pmsKey,
        pms_notes: pmsRule.notes,
        fields_updated: Object.keys(updates),
        sync_summary: syncSummary,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-editorial] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
