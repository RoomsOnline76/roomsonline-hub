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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Collect every candidate key: env geocoding key, env maps key, then api_keys table.
    // A referrer-restricted key returns REQUEST_DENIED for server-side calls, so we try each.
    const candidateKeys: string[] = [];
    const pushKey = (k?: string | null) => {
      if (k && !candidateKeys.includes(k)) candidateKeys.push(k);
    };
    pushKey(Deno.env.get("GOOGLE_MAPS_GEOCODING_KEY"));
    pushKey(Deno.env.get("GOOGLE_MAPS_API_KEY"));

    const { data: apiKeyRows } = await supabase
      .from("api_keys")
      .select("key_name, key_value")
      .in("key_name", ["google_maps_api_key", "GOOGLE_MAPS_API_KEY", "google_maps_geocoding_key"]);
    for (const row of apiKeyRows ?? []) pushKey((row as { key_value?: string }).key_value);

    if (candidateKeys.length === 0) {
      throw new Error("Google Maps API key not configured");
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

    // Call Google Maps Geocoding API, trying each candidate key
    let geocodeData: any = null;
    let lastStatus = "UNKNOWN";
    let lastMessage = "";

    for (const key of candidateKeys) {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${key}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const data = await geocodeResponse.json();

      if (data.status === "OK" && data.results?.length) {
        geocodeData = data;
        break;
      }

      lastStatus = data.status ?? "UNKNOWN";
      lastMessage = data.error_message ?? "";
      console.error(`Geocoding attempt failed: ${lastStatus} ${lastMessage}`);

      // Only a key/permission problem is worth retrying with another key.
      if (lastStatus !== "REQUEST_DENIED") break;
    }

    // Fallback: keyless OpenStreetMap geocoder when Google refuses the request
    // (billing disabled, referrer-restricted key, API not enabled, quota).
    let provider = "google";
    let formattedAddress = geocodeData?.results?.[0]?.formatted_address ?? fullAddress;
    let latitude: number | null = geocodeData?.results?.[0]?.geometry?.location?.lat ?? null;
    let longitude: number | null = geocodeData?.results?.[0]?.geometry?.location?.lng ?? null;

    if (latitude === null || longitude === null) {
      console.warn(`Google geocoding unavailable (${lastStatus} ${lastMessage}); trying OpenStreetMap`);
      try {
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullAddress)}`;
        const osmRes = await fetch(osmUrl, {
          headers: { "User-Agent": "ROLOS-Geocoder/1.0 (support@roomsonline.co.za)" },
        });
        const osmData = await osmRes.json();
        if (Array.isArray(osmData) && osmData.length > 0) {
          latitude = Number(osmData[0].lat);
          longitude = Number(osmData[0].lon);
          formattedAddress = osmData[0].display_name ?? fullAddress;
          provider = "openstreetmap";
        }
      } catch (osmErr) {
        console.error("OpenStreetMap geocoding failed:", osmErr);
      }
    }

    if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      const hint =
        lastStatus === "REQUEST_DENIED"
          ? "Google rejected the key (billing not enabled on the project, or the key is referrer-restricted). The keyless fallback could not match this address either — check the street, city and country spelling."
          : "Neither Google nor the fallback geocoder could match this address. Check the street, city and country.";
      return new Response(
        JSON.stringify({
          success: false,
          error: `Geocoding failed: ${lastStatus}`,
          hint,
          address: fullAddress,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Geocoded via ${provider}: ${latitude}, ${longitude}`);

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
