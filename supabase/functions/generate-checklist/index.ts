import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Master checklist template - single source of truth
const CHECKLIST_ITEMS = [
  // Contract phase
  { phase: 'contract', key: 'contract_signed', label: 'Contract signed', required_for: ['all'], auto_verify: true },
  
  // Onboarding phase - common to all
  { phase: 'onboarding', key: 'property_name', label: 'Property name set', required_for: ['all'], field: 'name' },
  { phase: 'onboarding', key: 'property_address', label: 'Address configured', required_for: ['all'], field: 'address' },
  { phase: 'onboarding', key: 'property_description', label: 'Description added', required_for: ['all'], field: 'description' },
  { phase: 'onboarding', key: 'contact_details', label: 'Contact details complete', required_for: ['all'], field: 'amenities.contact' },
  { phase: 'onboarding', key: 'location_configured', label: 'Location/map configured', required_for: ['all'], field: 'latitude' },
  { phase: 'onboarding', key: 'images_uploaded', label: 'Images uploaded (min 3)', required_for: ['all'], field: 'images', min_count: 3 },
  { phase: 'onboarding', key: 'facilities_set', label: 'Facilities configured', required_for: ['all'], field: 'amenities.facilities' },
  
  // Accommodation-specific
  { phase: 'onboarding', key: 'rooms_configured', label: 'Room types added', required_for: ['accommodation', 'hybrid'], min_count: 1 },
  { phase: 'onboarding', key: 'pricing_set', label: 'Pricing configured', required_for: ['accommodation', 'hybrid'], field: 'price_per_night' },
  { phase: 'onboarding', key: 'check_in_time', label: 'Check-in time set', required_for: ['accommodation', 'hybrid'], field: 'amenities.check_in_time' },
  { phase: 'onboarding', key: 'check_out_time', label: 'Check-out time set', required_for: ['accommodation', 'hybrid'], field: 'amenities.check_out_time' },
  { phase: 'onboarding', key: 'cancellation_policy', label: 'Cancellation policy defined', required_for: ['accommodation', 'hybrid'], field: 'amenities.cancellation_policy' },
  
  // Venue-specific
  { phase: 'onboarding', key: 'venue_capacity', label: 'Venue capacity set', required_for: ['venue', 'hybrid'], field: 'amenities.venue_capacity' },
  { phase: 'onboarding', key: 'event_types', label: 'Event types defined', required_for: ['venue', 'hybrid'], field: 'amenities.event_types' },
  { phase: 'onboarding', key: 'venue_layout', label: 'Layout options configured', required_for: ['venue', 'hybrid'], field: 'amenities.venue_layouts' },
  
  // Experience-specific
  { phase: 'onboarding', key: 'experience_details', label: 'Experience details complete', required_for: ['experience'], field: 'amenities.experience_details' },
  { phase: 'onboarding', key: 'experience_duration', label: 'Duration set', required_for: ['experience'], field: 'amenities.experience_duration' },
  { phase: 'onboarding', key: 'max_participants', label: 'Max participants set', required_for: ['experience'], field: 'amenities.max_participants' },
  { phase: 'onboarding', key: 'logistics', label: 'Logistics configured', required_for: ['experience'], field: 'amenities.logistics' },
  
  // Commercial phase
  { phase: 'commercial', key: 'bank_details', label: 'Bank details provided', required_for: ['all'], field: 'amenities.banking' },
  { phase: 'commercial', key: 'commission_agreed', label: 'Commission rate confirmed', required_for: ['all'] },
  
  // Activation phase
  { phase: 'activation', key: 'admin_review', label: 'Admin review complete', required_for: ['all'] },
  { phase: 'activation', key: 'quality_gate_passed', label: 'Quality gate passed', required_for: ['all'] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { property_id, listing_intent, reset } = await req.json();

    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If reset is true, delete existing checklist items first
    if (reset) {
      await supabase
        .from('property_checklist')
        .delete()
        .eq('property_id', property_id);
    }

    // Get property to determine listing intent if not provided
    let resolvedIntent = listing_intent;
    if (!resolvedIntent) {
      const { data: property, error: propError } = await supabase
        .from('properties')
        .select('listing_intent')
        .eq('id', property_id)
        .single();
      
      if (propError) {
        return new Response(JSON.stringify({ error: "Property not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      resolvedIntent = property.listing_intent || 'accommodation';
    }

    // Filter checklist items based on listing intent
    const applicableItems = CHECKLIST_ITEMS.filter(item => 
      item.required_for.includes('all') || item.required_for.includes(resolvedIntent)
    );

    // Create checklist records
    const checklistRecords = applicableItems.map(item => ({
      property_id,
      phase: item.phase,
      item_key: item.key,
      item_label: item.label,
      required_for: item.required_for,
      completed: false,
      auto_verified: item.auto_verify || false,
      verification_data: item.field ? { field: item.field, min_count: item.min_count } : null,
    }));

    // Upsert checklist items
    const { data, error } = await supabase
      .from('property_checklist')
      .upsert(checklistRecords, { 
        onConflict: 'property_id,phase,item_key',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error("Error creating checklist:", error);
      return new Response(JSON.stringify({ error: "Failed to create checklist" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created ${data?.length || 0} checklist items for property ${property_id} (intent: ${resolvedIntent})`);

    return new Response(JSON.stringify({ 
      success: true,
      items_created: data?.length || 0,
      listing_intent: resolvedIntent,
      items: data,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in generate-checklist:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
