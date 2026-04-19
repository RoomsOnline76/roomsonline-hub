import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeocodeRequest {
  property_id: string;
  address?: string;
  city?: string;
  country?: string;
  suburb?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Prefer server-side unrestricted geocoding key; fall back to api_keys table
    let googleMapsApiKey = Deno.env.get("GOOGLE_MAPS_GEOCODING_KEY") ?? "";

    if (!googleMapsApiKey) {
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from("api_keys")
        .select("key_value")
        .eq("key_name", "google_maps_api_key")
        .maybeSingle();

      if (apiKeyError || !apiKeyData?.key_value) {
        throw new Error("Google Maps API key not configured");
      }
      googleMapsApiKey = apiKeyData.key_value;
    }

    const body: GeocodeRequest = await req.json();
    const { property_id, address, city, country, suburb } = body;

    if (!property_id) {
      throw new Error("property_id is required");
    }

    // If address components not provided, fetch from database
    let addressToGeocode = address;
    let cityToGeocode = city;
    let countryToGeocode = country;
    let suburbToGeocode = suburb;

    if (!addressToGeocode || !cityToGeocode || !countryToGeocode) {
      const { data: property, error: fetchError } = await supabase
        .from("properties")
        .select("address, city, country, amenities")
        .eq("id", property_id)
        .single();

      if (fetchError || !property) {
        throw new Error(`Property not found: ${property_id}`);
      }

      addressToGeocode = addressToGeocode || property.address;
      cityToGeocode = cityToGeocode || property.city;
      countryToGeocode = countryToGeocode || property.country;
      
      // Try to get suburb from amenities.address_details
      if (!suburbToGeocode && property.amenities) {
        const amenities = property.amenities as any;
        suburbToGeocode = amenities?.address_details?.suburb;
      }
    }

    if (!addressToGeocode || !cityToGeocode || !countryToGeocode) {
      throw new Error("Incomplete address: address, city, and country are required");
    }

    // Build full address string
    const addressParts = [addressToGeocode];
    if (suburbToGeocode) addressParts.push(suburbToGeocode);
    addressParts.push(cityToGeocode, countryToGeocode);
    const fullAddress = addressParts.join(", ");

    console.log(`Geocoding address: ${fullAddress}`);

    // Call Google Maps Geocoding API
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${googleMapsApiKey}`;
    
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status !== "OK" || !geocodeData.results?.length) {
      console.error("Geocoding failed:", geocodeData.status, geocodeData.error_message);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Geocoding failed: ${geocodeData.status}`,
          address: fullAddress,
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const location = geocodeData.results[0].geometry.location;
    const latitude = location.lat;
    const longitude = location.lng;

    console.log(`Geocoded to: ${latitude}, ${longitude}`);

    // Update property with new coordinates
    const { error: updateError } = await supabase
      .from("properties")
      .update({ 
        latitude, 
        longitude,
        updated_at: new Date().toISOString()
      })
      .eq("id", property_id);

    if (updateError) {
      throw new Error(`Failed to update property: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        property_id,
        address: fullAddress,
        latitude,
        longitude,
        formatted_address: geocodeData.results[0].formatted_address,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Geocode error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
