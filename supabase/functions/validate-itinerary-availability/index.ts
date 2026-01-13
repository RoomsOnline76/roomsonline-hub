import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ItineraryStay {
  id: string;
  property_id: string;
  property_name: string;
  external_system: string;
  dates: { check_in: string; check_out: string };
  rooms: { room_type_id: string; quantity: number }[];
  guests: { adults: number; children: number; infants: number };
}

interface ValidationResult {
  stay_id: string;
  property_id: string;
  is_available: boolean;
  price_changed: boolean;
  new_price?: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, stays, itinerary_id } = await req.json();

    let staysToValidate: ItineraryStay[] = stays || [];

    // If itinerary_id provided, load stays from database
    if (itinerary_id && !stays) {
      const { data: itinerary, error } = await supabase
        .from("itineraries")
        .select("stays")
        .eq("id", itinerary_id)
        .single();

      if (error || !itinerary) {
        return new Response(
          JSON.stringify({ success: false, error: "Itinerary not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      staysToValidate = itinerary.stays as ItineraryStay[];
    }

    if (!staysToValidate || staysToValidate.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No stays to validate" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group stays by external_system for efficient batch processing
    const staysBySystem: Record<string, ItineraryStay[]> = {};
    for (const stay of staysToValidate) {
      const system = stay.external_system || "native";
      if (!staysBySystem[system]) {
        staysBySystem[system] = [];
      }
      staysBySystem[system].push(stay);
    }

    const results: ValidationResult[] = [];

    // Process each system's stays
    for (const [system, systemStays] of Object.entries(staysBySystem)) {
      for (const stay of systemStays) {
        try {
          // For now, check against cached availability
          // In production, this would call the actual PMS APIs
          const { data: cached, error: cacheError } = await supabase
            .from("pms_availability_cache")
            .select("available_units, rates")
            .eq("property_id", stay.property_id)
            .gte("date", stay.dates.check_in)
            .lt("date", stay.dates.check_out);

          if (cacheError) {
            console.error(`Cache error for property ${stay.property_id}:`, cacheError);
            // If no cache, assume available (will be verified at booking time)
            results.push({
              stay_id: stay.id,
              property_id: stay.property_id,
              is_available: true,
              price_changed: false,
            });
            continue;
          }

          // Check if all dates have availability
          const isAvailable = !cached || cached.length === 0 || 
            cached.every(day => (day.available_units ?? 1) > 0);

          results.push({
            stay_id: stay.id,
            property_id: stay.property_id,
            is_available: isAvailable,
            price_changed: false, // TODO: Compare with stored price
          });

        } catch (stayError) {
          console.error(`Error validating stay ${stay.id}:`, stayError);
          results.push({
            stay_id: stay.id,
            property_id: stay.property_id,
            is_available: false,
            price_changed: false,
            error: stayError instanceof Error ? stayError.message : "Validation failed",
          });
        }
      }
    }

    // Calculate overall status
    const allAvailable = results.every(r => r.is_available);
    const anyPriceChanged = results.some(r => r.price_changed);

    return new Response(
      JSON.stringify({
        success: true,
        all_available: allAvailable,
        any_price_changed: anyPriceChanged,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Validation error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Validation failed" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
