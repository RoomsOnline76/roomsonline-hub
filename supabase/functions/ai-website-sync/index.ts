import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fields we will extract - mapped from property-form-field-map.json
// NEVER TOUCH: finance, owner_email, owner_name, PMS IDs, ROL Spec fields
const EXTRACTABLE_FIELDS = [
  // Contact & Location
  "telephone",
  "contact_email", 
  "address",
  "suburb",
  "city",
  "country",
  "postal_code",
  "description",
  // POI
  "restaurants_cafes",
  "public_transport",
  "closest_airport",
  "restaurants_cafes_distance",
  "public_transport_distance",
  "closest_airport_distance",
  // Property Details
  "check_in_from",
  "check_out_from",
  "bedrooms",
  "star_rating",
  "property_type",
  "name",
  // Arrays
  "facilities",
  "activities",
  "images",
  // Editorial enrichment fields
  "space_description",
  "neighbourhood_description",
  "getting_around",
  "things_to_know",
  "key_highlights",
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

// Known activities to match against
const KNOWN_ACTIVITIES = [
  "Game Drives (Morning)",
  "Game Drives (Evening)",
  "Bird Watching",
  "Bush Walks",
  "Cultural Tours",
  "Hiking",
  "Fishing",
  "Cycling",
  "Walking Tours",
  "Whale Watching",
  "Wine Tasting",
  "Spa Treatments",
  "Stargazing",
  "Photography Tours",
  "Horse Riding",
  "Water Sports",
  "Golf",
  "Tennis",
  "Swimming",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, property_url, existing_data, tripadvisor_id, additional_urls, google_place_id } = await req.json();

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
        formats: ["markdown", "links"],
        onlyMainContent: false, // Get full page to find images
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

    // Step 1b: Scrape TripAdvisor page if ID is provided
    let tripadvisorContent = "";
    if (tripadvisor_id && tripadvisor_id.trim()) {
      const taUrl = `https://www.tripadvisor.com/Hotel_Review-d${tripadvisor_id.trim()}`;
      console.log("Scraping TripAdvisor:", taUrl);

      try {
        const taScrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: taUrl,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });

        const taScrapeData = await taScrapeResponse.json();

        if (taScrapeResponse.ok && taScrapeData.success) {
          tripadvisorContent = taScrapeData.data?.markdown || taScrapeData.markdown || "";
          console.log("TripAdvisor content length:", tripadvisorContent.length);
        } else {
          console.warn("TripAdvisor scrape failed, continuing without it:", taScrapeData.error);
        }
      } catch (taErr) {
        console.warn("TripAdvisor scrape error, continuing without it:", taErr);
      }
    }

    // Step 1c: Scrape additional URLs if provided
    let additionalContent = "";
    if (additional_urls && Array.isArray(additional_urls)) {
      for (const extraUrl of additional_urls) {
        if (!extraUrl || typeof extraUrl !== "string" || !extraUrl.startsWith("http")) continue;
        console.log("Scraping additional URL:", extraUrl);
        try {
          const extraResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: extraUrl,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          });
          const extraData = await extraResponse.json();
          if (extraResponse.ok && extraData.success) {
            const content = extraData.data?.markdown || extraData.markdown || "";
            if (content.length > 50) {
              additionalContent += `\n\n=== CONTENT FROM ${extraUrl} ===\n${content.substring(0, 8000)}`;
              console.log("Additional URL content length:", content.length);
            }
          } else {
            console.warn("Additional URL scrape failed:", extraUrl, extraData.error);
          }
        } catch (err) {
          console.warn("Additional URL scrape error:", extraUrl, err);
        }
      }
    }

    // Step 1d: Fetch Google Places details if google_place_id is provided
    let googlePlacesContent = "";
    if (google_place_id && typeof google_place_id === "string" && google_place_id.trim()) {
      const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
      if (googleApiKey) {
        console.log("Fetching Google Places details for:", google_place_id);
        try {
          const fields = "displayName,formattedAddress,rating,userRatingCount,types,websiteUri,nationalPhoneNumber,editorialSummary,reviews";
          const gpResponse = await fetch(
            `https://places.googleapis.com/v1/places/${google_place_id.trim()}?fields=${fields}&languageCode=en`,
            {
              headers: {
                "X-Goog-Api-Key": googleApiKey,
                "Content-Type": "application/json",
              },
            }
          );
          if (gpResponse.ok) {
            const gpData = await gpResponse.json();
            const parts: string[] = [];
            if (gpData.displayName?.text) parts.push(`Name: ${gpData.displayName.text}`);
            if (gpData.formattedAddress) parts.push(`Address: ${gpData.formattedAddress}`);
            if (gpData.rating) parts.push(`Google Rating: ${gpData.rating}/5`);
            if (gpData.userRatingCount) parts.push(`Google Review Count: ${gpData.userRatingCount}`);
            if (gpData.nationalPhoneNumber) parts.push(`Phone: ${gpData.nationalPhoneNumber}`);
            if (gpData.editorialSummary?.text) parts.push(`Summary: ${gpData.editorialSummary.text}`);
            if (gpData.types) parts.push(`Types: ${gpData.types.join(", ")}`);
            if (gpData.reviews && Array.isArray(gpData.reviews)) {
              const reviewTexts = gpData.reviews.slice(0, 5).map((r: any) => r.text?.text).filter(Boolean);
              if (reviewTexts.length > 0) parts.push(`Top Reviews:\n${reviewTexts.join("\n---\n")}`);
            }
            googlePlacesContent = parts.join("\n");
            console.log("Google Places content length:", googlePlacesContent.length);
          } else {
            console.warn("Google Places API error:", gpResponse.status);
          }
        } catch (gpErr) {
          console.warn("Google Places fetch error:", gpErr);
        }
      } else {
        console.warn("GOOGLE_PLACES_API_KEY not configured, skipping Google Places lookup");
      }
    }

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
            // Contact
            telephone: { 
              type: "string", 
              description: "Property phone number (international format preferred)" 
            },
            contact_email: { 
              type: "string", 
              description: "Property contact email address" 
            },
            // Location
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
            // Content
            property_name: {
              type: "string",
              description: "Name of the property/hotel"
            },
            description: { 
              type: "string", 
              description: "Property description (2-4 paragraphs about the property)" 
            },
            // Property Details
            check_in_time: { 
              type: "string", 
              description: "Check-in time in 24-hour format (e.g., '14:00'). Convert from 12-hour format if needed." 
            },
            check_out_time: { 
              type: "string", 
              description: "Check-out time in 24-hour format (e.g., '10:00'). Convert from 12-hour format if needed." 
            },
            total_rooms: { 
              type: "integer", 
              description: "Total number of rooms/units at the property" 
            },
            star_rating: { 
              type: "integer", 
              description: "Star rating (1-5) if explicitly mentioned" 
            },
            property_type: { 
              type: "string", 
              description: "Type of property: Hotel, Guesthouse, Lodge, B&B, Villa, Boutique Hotel, Safari Lodge, Game Lodge, etc." 
            },
            // POI
            restaurants_cafes: { 
              type: "string", 
              description: "Names of nearby restaurants or cafes mentioned" 
            },
            restaurants_cafes_distance: { 
              type: "string", 
              description: "Distance to restaurants (e.g., '500m', '5 min walk', 'on-site')" 
            },
            public_transport: { 
              type: "string", 
              description: "Public transport options mentioned" 
            },
            public_transport_distance: { 
              type: "string", 
              description: "Distance to public transport" 
            },
            closest_airport: { 
              type: "string", 
              description: "Nearest airport name" 
            },
            closest_airport_distance: { 
              type: "string", 
              description: "Distance to nearest airport (e.g., '25 km', '30 min drive')" 
            },
            // Arrays
            facilities: {
              type: "array",
              items: { type: "string" },
              description: "List of facilities/amenities: pool, spa, wifi, parking, restaurant, bar, gym, room service, laundry, etc."
            },
            activities: {
              type: "array",
              items: { type: "string" },
              description: "Activities offered: Game Drives, Bird Watching, Hiking, Cultural Tours, Fishing, Cycling, Walking Tours, Wine Tasting, Spa Treatments, etc."
            },
            images: {
              type: "array",
              items: { type: "string" },
              description: "URLs of property photos (only https URLs ending in .jpg, .jpeg, .png, .webp). Look for hero images, gallery images, room photos."
            },
            // TripAdvisor-sourced fields
            tripadvisor_rating: {
              type: "number",
              description: "TripAdvisor overall rating (1-5 scale, e.g. 4.5). Only extract from TripAdvisor content."
            },
            tripadvisor_review_count: {
              type: "integer",
              description: "Total number of TripAdvisor reviews. Only extract from TripAdvisor content."
            },
            tripadvisor_ranking: {
              type: "string",
              description: "TripAdvisor ranking text (e.g. '#3 of 25 hotels in Cape Town'). Only extract from TripAdvisor content."
            },
            tripadvisor_highlights: {
              type: "array",
              items: { type: "string" },
              description: "Key themes/highlights from TripAdvisor reviews (e.g. 'Excellent breakfast', 'Stunning views', 'Friendly staff'). Max 6 items. Only extract from TripAdvisor content."
            },
            // Google Places fields
            google_rating: {
              type: "number",
              description: "Google Places rating (1-5 scale). Only extract from Google Places content."
            },
            google_review_count: {
              type: "integer",
              description: "Total number of Google reviews. Only extract from Google Places content."
            },
          },
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `You are a data extraction assistant for a hotel/accommodation booking platform. 
Extract ONLY property information that is clearly stated on the website.
Be precise and conservative - only extract data you are confident about.

Guidelines:
- Phone numbers: use international format if possible
- Check-in/out times: convert to 24-hour format (e.g., "2 PM" → "14:00")
- Star ratings: only extract if explicitly stated (1-5 stars)
- Descriptions: create a clean summary without marketing fluff
- Images: only extract absolute HTTPS URLs ending in .jpg, .jpeg, .png, .webp
- Activities: match against common hospitality activities
- TripAdvisor fields: only extract from the TripAdvisor section if provided
- Google fields: only extract from the Google Places section if provided

DO NOT make up information. Return null for any field you cannot find.`;

    let userPrompt = `Extract property information from this website content:

${websiteContent.substring(0, 15000)}`;

    if (additionalContent) {
      userPrompt += `\n${additionalContent}`;
    }

    if (tripadvisorContent) {
      userPrompt += `

=== TRIPADVISOR PAGE CONTENT ===
${tripadvisorContent.substring(0, 8000)}

Also extract TripAdvisor-specific data: rating, review count, ranking, and review highlights/themes.`;
    }

    if (googlePlacesContent) {
      userPrompt += `

=== GOOGLE PLACES DATA ===
${googlePlacesContent}

Extract Google rating and review count from the above.`;
    }

    const extraSources = [
      tripadvisorContent ? 'TripAdvisor rating, review count, ranking, and review highlights' : '',
      googlePlacesContent ? 'Google rating and review count' : '',
    ].filter(Boolean).join('. Also extract ');

    userPrompt += `

Extract: contact details, location, description, check-in/out times, star rating, property type, facilities, activities offered, and image URLs.${extraSources ? ` Also extract ${extraSources}.` : ''}`;

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
    const fieldMapping: Record<string, { stateVariable: string; label: string; existingKey?: string }> = {
      telephone: { stateVariable: "formData.telephone", label: "Telephone" },
      contact_email: { stateVariable: "formData.contact_email", label: "Contact Email" },
      address: { stateVariable: "formData.address", label: "Street Address" },
      suburb: { stateVariable: "formData.suburb", label: "Suburb" },
      city: { stateVariable: "formData.city", label: "City" },
      country: { stateVariable: "formData.country", label: "Country" },
      postal_code: { stateVariable: "formData.postal_code", label: "Postal Code" },
      property_name: { stateVariable: "formData.name", label: "Property Name", existingKey: "name" },
      description: { stateVariable: "formData.description", label: "Description" },
      check_in_time: { stateVariable: "formData.check_in_from", label: "Check-in Time", existingKey: "check_in_from" },
      check_out_time: { stateVariable: "formData.check_out_from", label: "Check-out Time", existingKey: "check_out_from" },
      total_rooms: { stateVariable: "bedrooms", label: "Total Rooms", existingKey: "bedrooms" },
      star_rating: { stateVariable: "starRating", label: "Star Rating", existingKey: "star_rating" },
      property_type: { stateVariable: "formData.property_type", label: "Property Type" },
      restaurants_cafes: { stateVariable: "formData.restaurants_cafes", label: "Restaurants & Cafes" },
      restaurants_cafes_distance: { stateVariable: "formData.restaurants_cafes_distance", label: "Restaurants Distance" },
      public_transport: { stateVariable: "formData.public_transport", label: "Public Transport" },
      public_transport_distance: { stateVariable: "formData.public_transport_distance", label: "Public Transport Distance" },
      closest_airport: { stateVariable: "formData.closest_airport", label: "Closest Airport" },
      closest_airport_distance: { stateVariable: "formData.closest_airport_distance", label: "Airport Distance" },
      // TripAdvisor fields
      tripadvisor_rating: { stateVariable: "tripadvisor_rating", label: "TripAdvisor Rating" },
      tripadvisor_review_count: { stateVariable: "tripadvisor_review_count", label: "TripAdvisor Review Count" },
      tripadvisor_ranking: { stateVariable: "tripadvisor_ranking", label: "TripAdvisor Ranking" },
    };

    for (const [key, value] of Object.entries(extractedData)) {
      if (!value || PROTECTED_FIELDS.includes(key)) continue;
      
      const mapping = fieldMapping[key];
      if (!mapping) continue;

      // Get current value from existing_data
      const existingKey = mapping.existingKey || key;
      const currentValue = existing_data?.[existingKey] || null;
      
      // Calculate confidence based on whether it's filling empty or overwriting
      const isEmpty = !currentValue || (typeof currentValue === "string" && currentValue.trim() === "");
      const isTripAdvisorField = key.startsWith("tripadvisor_");
      const confidence = isEmpty ? 0.95 : 0.75;

      suggestions.push({
        stateVariable: mapping.stateVariable,
        fieldLabel: mapping.label,
        current: currentValue,
        suggested: value,
        confidence,
        source: isTripAdvisorField ? "tripadvisor" : "website",
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

    // Handle activities - normalize to known activities
    if (extractedData.activities && Array.isArray(extractedData.activities)) {
      const normalizedActivities: string[] = [];
      for (const activity of extractedData.activities as string[]) {
        const lowerActivity = activity.toLowerCase();
        const matched = KNOWN_ACTIVITIES.find(known => 
          lowerActivity.includes(known.toLowerCase().split(" ")[0]) ||
          known.toLowerCase().includes(lowerActivity.split(" ")[0])
        );
        if (matched && !normalizedActivities.includes(matched)) {
          normalizedActivities.push(matched);
        }
      }
      
      if (normalizedActivities.length > 0) {
        const currentActivities = existing_data?.activities || [];
        const isEmpty = !currentActivities || currentActivities.length === 0;
        
        suggestions.push({
          stateVariable: "selectedActivities",
          fieldLabel: "Activities",
          current: currentActivities,
          suggested: normalizedActivities,
          confidence: isEmpty ? 0.85 : 0.65,
          source: "website",
        });
      }
    }

    // Handle TripAdvisor highlights as array
    if (extractedData.tripadvisor_highlights && Array.isArray(extractedData.tripadvisor_highlights)) {
      const highlights = (extractedData.tripadvisor_highlights as string[]).slice(0, 6);
      if (highlights.length > 0) {
        suggestions.push({
          stateVariable: "tripadvisor_highlights",
          fieldLabel: "TripAdvisor Review Highlights",
          current: null,
          suggested: highlights,
          confidence: 0.85,
          source: "tripadvisor",
        });
      }
    }

    // Handle images - validate and filter
    if (extractedData.images && Array.isArray(extractedData.images)) {
      const validImages: string[] = [];
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
      
      for (const img of extractedData.images as string[]) {
        if (typeof img !== "string") continue;
        const url = img.trim();
        
        // Must be HTTPS and end with valid image extension
        if (url.startsWith("https://")) {
          const lowerUrl = url.toLowerCase();
          if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
            validImages.push(url);
          }
        }
        
        // Limit to 10 images
        if (validImages.length >= 10) break;
      }
      
      if (validImages.length > 0) {
        const currentImages = existing_data?.uploadedImages || [];
        const isEmpty = !currentImages || currentImages.length === 0;
        
        suggestions.push({
          stateVariable: "uploadedImages",
          fieldLabel: "Property Images",
          current: currentImages,
          suggested: validImages,
          confidence: isEmpty ? 0.80 : 0.60,
          source: "website",
        });
      }
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
