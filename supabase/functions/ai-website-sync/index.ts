import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fields we will extract - mapped from property-form-field-map.json
// NEVER TOUCH: finance, owner_email, owner_name, PMS IDs, ROL Spec fields
const EXTRACTABLE_FIELDS = [
  "telephone",
  "contact_email", 
  "address",
  "suburb",
  "city",
  "country",
  "postal_code",
  "description",
  "restaurants_cafes",
  "public_transport",
  "closest_airport",
];

// Fields that should never be extracted (sensitive/system fields)
const PROTECTED_FIELDS = [
  "owner_email",
  "owner_name", 
  "bank_name",
  "branch_code",
  "account_holder",
  "account_number",
  "account_type",
  "swift_code",
  "vat_number",
  "bitcoin_wallet_address",
  "bb_id",
  "venue_id",
  "channel_id",
  "account_id",
  "agent_id",
  "benson_property_code",
  "cloudbeds_property_id",
  "hostfully_property_uid",
  "littlehotelier_channel_code",
  "hotelbeds_hotel_code",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, property_url, existing_data } = await req.json();

    if (!property_url) {
      return new Response(
        JSON.stringify({ success: false, error: "Property URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!property_url.startsWith("http://") && !property_url.startsWith("https://")) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting: Check sync_logs for recent syncs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentSyncs, error: syncError } = await supabase
      .from("sync_logs")
      .select("id")
      .eq("property_id", property_id)
      .eq("sync_type", "website_ai_sync")
      .gte("created_at", oneHourAgo);

    if (syncError) {
      console.error("Error checking rate limit:", syncError);
    }

    if (recentSyncs && recentSyncs.length >= 5) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Rate limit exceeded. Maximum 5 syncs per hour per property." 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Scrape website using Firecrawl
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping URL:", property_url);

    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: property_url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error("Firecrawl error:", scrapeData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to scrape website: ${scrapeData.error || "Unknown error"}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const websiteContent = scrapeData.data?.markdown || scrapeData.markdown || "";
    
    if (!websiteContent || websiteContent.length < 50) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Could not extract meaningful content from the website" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraped content length:", websiteContent.length);

    // Step 2: Use AI to extract structured data
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractionTool = {
      type: "function",
      function: {
        name: "extract_property_data",
        description: "Extract property information from website content for a hotel/accommodation listing",
        parameters: {
          type: "object",
          properties: {
            telephone: { 
              type: "string", 
              description: "Property phone number (international format preferred)" 
            },
            contact_email: { 
              type: "string", 
              description: "Property contact email address" 
            },
            address: { 
              type: "string", 
              description: "Street address of the property" 
            },
            suburb: { 
              type: "string", 
              description: "Suburb or neighborhood name" 
            },
            city: { 
              type: "string", 
              description: "City name" 
            },
            country: { 
              type: "string", 
              description: "Country name" 
            },
            postal_code: { 
              type: "string", 
              description: "Postal/ZIP code" 
            },
            description: { 
              type: "string", 
              description: "Property description (2-4 paragraphs about the property)" 
            },
            restaurants_cafes: { 
              type: "string", 
              description: "Names of nearby restaurants or cafes mentioned" 
            },
            public_transport: { 
              type: "string", 
              description: "Public transport options mentioned" 
            },
            closest_airport: { 
              type: "string", 
              description: "Nearest airport name" 
            },
            facilities: {
              type: "array",
              items: { type: "string" },
              description: "List of facilities/amenities mentioned (pool, spa, wifi, parking, etc.)"
            }
          },
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `You are a data extraction assistant for a hotel/accommodation booking platform. 
Extract ONLY property information that is clearly stated on the website.
Be precise and conservative - only extract data you are confident about.
For phone numbers, use international format if possible.
For descriptions, create a clean summary without marketing fluff.
DO NOT make up information. Return null for any field you cannot find.`;

    const userPrompt = `Extract property information from this website content:

${websiteContent.substring(0, 15000)}

Extract contact details, location, description, and any facilities mentioned.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "extract_property_data" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "AI rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI request failed with status ${status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData, null, 2));

    // Parse the tool call response
    let extractedData: Record<string, unknown> = {};
    
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        extractedData = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Step 3: Build suggestions by comparing with existing data
    const suggestions: Array<{
      stateVariable: string;
      fieldLabel: string;
      current: unknown;
      suggested: unknown;
      confidence: number;
      source: string;
    }> = [];

    // Field mapping from extracted keys to form state variables
    const fieldMapping: Record<string, { stateVariable: string; label: string }> = {
      telephone: { stateVariable: "formData.telephone", label: "Telephone" },
      contact_email: { stateVariable: "formData.contact_email", label: "Contact Email" },
      address: { stateVariable: "formData.address", label: "Street Address" },
      suburb: { stateVariable: "formData.suburb", label: "Suburb" },
      city: { stateVariable: "formData.city", label: "City" },
      country: { stateVariable: "formData.country", label: "Country" },
      postal_code: { stateVariable: "formData.postal_code", label: "Postal Code" },
      description: { stateVariable: "formData.description", label: "Description" },
      restaurants_cafes: { stateVariable: "formData.restaurants_cafes", label: "Restaurants & Cafes" },
      public_transport: { stateVariable: "formData.public_transport", label: "Public Transport" },
      closest_airport: { stateVariable: "formData.closest_airport", label: "Closest Airport" },
    };

    for (const [key, value] of Object.entries(extractedData)) {
      if (!value || PROTECTED_FIELDS.includes(key)) continue;
      
      const mapping = fieldMapping[key];
      if (!mapping) continue;

      // Get current value from existing_data
      const currentValue = existing_data?.[key] || null;
      
      // Calculate confidence based on whether it's filling empty or overwriting
      const isEmpty = !currentValue || (typeof currentValue === "string" && currentValue.trim() === "");
      const confidence = isEmpty ? 0.95 : 0.75;

      suggestions.push({
        stateVariable: mapping.stateVariable,
        fieldLabel: mapping.label,
        current: currentValue,
        suggested: value,
        confidence,
        source: "website",
      });
    }

    // Handle facilities separately (it's an array)
    if (extractedData.facilities && Array.isArray(extractedData.facilities)) {
      const currentFacilities = existing_data?.facilities || [];
      const isEmpty = !currentFacilities || currentFacilities.length === 0;
      
      suggestions.push({
        stateVariable: "selectedFacilities",
        fieldLabel: "Facilities",
        current: currentFacilities,
        suggested: extractedData.facilities,
        confidence: isEmpty ? 0.85 : 0.65,
        source: "website",
      });
    }

    // Log the sync attempt
    await supabase.from("sync_logs").insert({
      property_id,
      external_system: "website_ai",
      sync_type: "website_ai_sync",
      status: "success",
      request_data: { url: property_url },
      response_data: {
        fields_suggested: suggestions.length,
        scraped_length: websiteContent.length,
      },
    });

    console.log(`Generated ${suggestions.length} suggestions`);

    return new Response(
      JSON.stringify({
        success: true,
        suggestions,
        scrapedUrl: property_url,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-website-sync:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
