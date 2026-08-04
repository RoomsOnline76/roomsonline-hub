import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_MODELS, AI_GATEWAY_URL } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Types
type DiningTier = 'fine_dining' | 'casual_elegant' | 'rustic_local' | 'relaxed_casual';

interface PropertyContext {
  id: string;
  name: string;
  property_type: string | null;
  editorial_rating: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Experience {
  title: string;
  description: string;
  category: string;
  distance_km: number | null;
  duration_hours: number | null;
  price_indicator: string;
  why_locals_love_it: string;
  best_time: string;
  source: string;
  venue_type?: string;
  cuisine_type?: string;
  reservation_required?: boolean;
  dress_code?: string;
}

// Determine dining tier based on property characteristics
function determineDiningTier(property: PropertyContext): DiningTier {
  const { property_type, editorial_rating } = property;
  const type = property_type?.toLowerCase() || '';
  
  // Editorial rating hierarchy
  const luxuryRatings = ['truly_special', 'exceptionally_considered'];
  const upscaleRatings = ['standout_character', 'quietly_excellent'];
  
  // Luxury properties → Fine dining
  if (editorial_rating && luxuryRatings.includes(editorial_rating)) {
    return 'fine_dining';
  }
  
  // Lodge/Farm/Country properties → Rustic local
  if (type.includes('lodge') || type.includes('farm') || type.includes('country') || type.includes('safari')) {
    return 'rustic_local';
  }
  
  // Upscale hotels/villas → Casual elegant
  if ((editorial_rating && upscaleRatings.includes(editorial_rating)) || 
      type.includes('hotel') || type.includes('villa') || type.includes('boutique')) {
    return 'casual_elegant';
  }
  
  // Guest houses, apartments, BnBs → Relaxed casual
  return 'relaxed_casual';
}

// Get tier-specific dining prompt for xAI
function getDiningPrompt(property: PropertyContext, diningTier: DiningTier): string {
  const location = `${property.city || 'the area'}${property.country ? `, ${property.country}` : ''}`;
  
  // Add coordinate constraint if available to prevent AI hallucinating distant locations
  const coordinateConstraint = property.latitude && property.longitude
    ? `\n\nCRITICAL LOCATION CONSTRAINT: The property is located at coordinates ${property.latitude}, ${property.longitude} in ${property.city || 'the area'}.
       ONLY recommend restaurants that are WITHIN 15km of these coordinates.
       Do NOT recommend establishments from other towns or cities.
       If ${property.city} is a small town, stick to venues actually IN or very near ${property.city}.
       The distance_km you provide MUST be accurate and less than 20km.`
    : '';
  
  const tierPrompts: Record<DiningTier, string> = {
    fine_dining: `Find the highest-rated fine dining restaurant near ${location}. 
      Look for: tasting menus, wine pairing, award recognition, chef's table experiences.
      The clientele at ${property.name} (a ${property.property_type || 'luxury property'}) expects world-class cuisine.
      Include the ACTUAL restaurant name - be specific, not generic.${coordinateConstraint}`,
      
    casual_elegant: `Find an upscale but relaxed restaurant near ${location}.
      Look for: farm-to-table, contemporary cuisine, good wine list, stylish atmosphere.
      Perfect for guests at ${property.name} who appreciate quality without excessive formality.
      Include the ACTUAL restaurant name - be specific, not generic.${coordinateConstraint}`,
      
    rustic_local: `Find an authentic local dining spot near ${location}.
      Look for: regional cuisine, family-run establishments, wine farms with restaurants, historic pubs, farmhouse cooking.
      Guests at ${property.name} (a ${property.property_type || 'countryside property'}) seek genuine local experiences.
      Include the ACTUAL restaurant name - be specific, not generic.${coordinateConstraint}`,
      
    relaxed_casual: `Find a cozy local eatery, cafe, or takeaway near ${location}.
      Look for: comfort food, friendly service, local favorites, hidden gems, good value.
      Perfect for ${property.property_type || 'guest house'} guests wanting easy, quality meals.
      Include the ACTUAL restaurant name - be specific, not generic.${coordinateConstraint}`
  };
  
  return tierPrompts[diningTier];
}

// Generate dining recommendation using xAI (Grok)
async function generateDiningWithXAI(
  property: PropertyContext, 
  diningTier: DiningTier
): Promise<Experience | null> {
  const xaiApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!xaiApiKey) {
    console.log("LOVABLE_API_KEY not configured, skipping xAI dining generation");
    return null;
  }
  
  const prompt = getDiningPrompt(property, diningTier);
  
  try {
    console.log(`Calling xAI Grok for ${diningTier} dining recommendation...`);
    
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${xaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.experience_curation,
        messages: [
          {
            role: "system",
            content: `You are a local food critic and dining expert for ${property.country || 'South Africa'}. 
              You know the best restaurants that match specific guest profiles.
              Provide real, specific restaurant recommendations - not generic descriptions.
              Always include the actual restaurant name if you know it.
              Be concise but informative.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "recommend_dining",
            description: "Recommend a dining establishment with detailed information",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Restaurant/venue name (actual name, not generic)" },
                description: { type: "string", description: "2-3 sentences about what makes it special" },
                venue_type: { 
                  type: "string", 
                  enum: ["restaurant", "cafe", "pub", "wine_bar", "farm_table", "takeaway"],
                  description: "Type of dining venue"
                },
                cuisine_type: { type: "string", description: "Type of cuisine (e.g., French, Farm-to-table, Cape Malay)" },
                price_indicator: { 
                  type: "string", 
                  enum: ["budget", "moderate", "luxury"],
                  description: "Price level"
                },
                why_locals_love_it: { type: "string", description: "One sentence insider tip" },
                best_time: { type: "string", description: "Best time to visit" },
                reservation_required: { type: "boolean", description: "Whether booking is needed" },
                dress_code: { type: "string", description: "Dress code if any (null if casual)" },
                distance_km: { type: "number", description: "Approximate distance from property in km" }
              },
              required: ["title", "description", "venue_type", "cuisine_type", "price_indicator", "why_locals_love_it", "best_time", "reservation_required"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "recommend_dining" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`xAI API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call response from xAI");
      return null;
    }

    const dining = JSON.parse(toolCall.function.arguments);
    
    console.log(`xAI recommended: ${dining.title}`);
    
    return {
      title: dining.title,
      description: dining.description,
      category: 'dining',
      distance_km: dining.distance_km || null,
      duration_hours: 2, // Typical dining duration
      price_indicator: dining.price_indicator,
      why_locals_love_it: dining.why_locals_love_it,
      best_time: dining.best_time,
      source: 'ai_generated',
      venue_type: dining.venue_type,
      cuisine_type: dining.cuisine_type,
      reservation_required: dining.reservation_required,
      dress_code: dining.dress_code || null
    };
  } catch (error) {
    console.error("Error calling xAI:", error);
    return null;
  }
}

// Generate general experiences using Lovable AI
async function generateExperiencesWithLovableAI(
  property: PropertyContext,
  count: number
): Promise<Experience[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    console.error("LOVABLE_API_KEY not configured");
    return [];
  }

  const location = `${property.city || 'the area'}${property.country ? `, ${property.country}` : ''}`;
  
  // Add coordinate constraint if available
  const coordinateInfo = property.latitude && property.longitude
    ? `\n\nIMPORTANT: The property is at coordinates ${property.latitude}, ${property.longitude}.
Only recommend experiences WITHIN 30km of this location. Provide accurate distance_km values.
Do NOT recommend attractions in other towns unless they are genuinely nearby.`
    : '';
  
  const prompt = `Generate ${count} compelling local experiences near ${property.name} in ${location}.
Property type: ${property.property_type || 'hotel'}
Property vibe: ${property.description?.slice(0, 200) || 'comfortable accommodation'}

Create a diverse mix:
- 1 nature/outdoor activity
- 1 cultural/historical visit  
- 1 adventure activity
- 1 relaxation/wellness option

For each experience, provide specific, real recommendations (not generic descriptions).
Include actual place names when possible.${coordinateInfo}`;

  try {
    console.log("Calling Lovable AI for general experiences...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.experience_curation,
        messages: [
          {
            role: "system",
            content: `You are a local travel expert who knows the best experiences around ${property.country || 'South Africa'}.
              Provide specific, real recommendations - not generic descriptions.
              Focus on quality over quantity.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_experiences",
            description: "Return local experience recommendations",
            parameters: {
              type: "object",
              properties: {
                experiences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Experience name (specific, not generic)" },
                      description: { type: "string", description: "2-3 sentences description" },
                      category: { 
                        type: "string", 
                        enum: ["nature", "culture", "food", "adventure", "relaxation", "wellness"]
                      },
                      duration_hours: { type: "number", description: "Typical duration in hours" },
                      distance_km: { type: "number", description: "Distance from property in km" },
                      price_indicator: { 
                        type: "string", 
                        enum: ["free", "budget", "moderate", "luxury"]
                      },
                      why_locals_love_it: { type: "string", description: "Insider tip" },
                      best_time: { type: "string", description: "Best time to visit" }
                    },
                    required: ["title", "description", "category", "price_indicator", "why_locals_love_it", "best_time"]
                  }
                }
              },
              required: ["experiences"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "suggest_experiences" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Lovable AI error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call response from Lovable AI");
      return [];
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const experiences = parsed.experiences || [];
    
    console.log(`Lovable AI generated ${experiences.length} experiences`);
    
    return experiences.map((exp: any) => ({
      title: exp.title,
      description: exp.description,
      category: exp.category,
      distance_km: exp.distance_km || null,
      duration_hours: exp.duration_hours || null,
      price_indicator: exp.price_indicator,
      why_locals_love_it: exp.why_locals_love_it,
      best_time: exp.best_time,
      source: 'ai_generated'
    }));
  } catch (error) {
    console.error("Error calling Lovable AI:", error);
    return [];
  }
}

// Fallback: Generate dining with Lovable AI if xAI fails
async function generateDiningWithLovableAI(
  property: PropertyContext,
  diningTier: DiningTier
): Promise<Experience | null> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    return null;
  }

  const prompt = getDiningPrompt(property, diningTier);
  
  try {
    console.log("Falling back to Lovable AI for dining recommendation...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.experience_curation,
        messages: [
          {
            role: "system",
            content: `You are a local dining expert for ${property.country || 'South Africa'}.
              Recommend specific, real restaurants - not generic descriptions.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "recommend_dining",
            description: "Recommend a dining establishment",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                venue_type: { type: "string", enum: ["restaurant", "cafe", "pub", "wine_bar", "farm_table", "takeaway"] },
                cuisine_type: { type: "string" },
                price_indicator: { type: "string", enum: ["budget", "moderate", "luxury"] },
                why_locals_love_it: { type: "string" },
                best_time: { type: "string" },
                reservation_required: { type: "boolean" }
              },
              required: ["title", "description", "venue_type", "cuisine_type", "price_indicator", "why_locals_love_it", "best_time", "reservation_required"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "recommend_dining" } }
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      return null;
    }

    const dining = JSON.parse(toolCall.function.arguments);
    
    return {
      title: dining.title,
      description: dining.description,
      category: 'dining',
      distance_km: null,
      duration_hours: 2,
      price_indicator: dining.price_indicator,
      why_locals_love_it: dining.why_locals_love_it,
      best_time: dining.best_time,
      source: 'ai_generated',
      venue_type: dining.venue_type,
      cuisine_type: dining.cuisine_type,
      reservation_required: dining.reservation_required,
      dress_code: undefined
    };
  } catch (error) {
    console.error("Error with Lovable AI dining fallback:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { property_id, property_name, city, country } = await req.json();
    
    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch property details including coordinates for location-aware recommendations
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, name, property_type, editorial_rating, city, country, description, latitude, longitude")
      .eq("id", property_id)
      .single();

    if (propertyError || !property) {
      // Use passed-in data if property not found
      console.log("Property not found in DB, using provided data");
    }

    const propertyContext: PropertyContext = {
      id: property_id,
      name: property?.name || property_name || "Property",
      property_type: property?.property_type || null,
      editorial_rating: property?.editorial_rating || null,
      city: property?.city || city || null,
      country: property?.country || country || "South Africa",
      description: property?.description || null,
      latitude: property?.latitude || null,
      longitude: property?.longitude || null
    };
    
    if (propertyContext.latitude && propertyContext.longitude) {
      console.log(`Property coordinates: ${propertyContext.latitude}, ${propertyContext.longitude}`);
    } else {
      console.log("Warning: Property has no coordinates - dining recommendations may be less accurate");
    }

    console.log(`Enriching experiences for: ${propertyContext.name} (${propertyContext.city})`);

    // Determine dining tier
    const diningTier = determineDiningTier(propertyContext);
    console.log(`Dining tier: ${diningTier}`);

    // Generate experiences in parallel
    const [generalExperiences, diningFromXAI] = await Promise.all([
      generateExperiencesWithLovableAI(propertyContext, 4),
      generateDiningWithXAI(propertyContext, diningTier)
    ]);

    // Fallback to Lovable AI for dining if xAI failed
    let diningExperience = diningFromXAI;
    if (!diningExperience) {
      diningExperience = await generateDiningWithLovableAI(propertyContext, diningTier);
    }
    
    // Validate dining distance - reject if too far (likely AI hallucination)
    if (diningExperience && diningExperience.distance_km && diningExperience.distance_km > 25) {
      console.warn(`Dining recommendation "${diningExperience.title}" rejected: distance ${diningExperience.distance_km}km exceeds 25km limit`);
      diningExperience = null; // Skip this dining recommendation
    }

    // Combine all experiences
    const allExperiences: Experience[] = [...generalExperiences];
    if (diningExperience) {
      allExperiences.push(diningExperience);
    }

    if (allExperiences.length === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to generate experiences", count: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clear existing AI-generated experiences for this property
    await supabase
      .from("local_experiences")
      .delete()
      .eq("property_id", property_id)
      .eq("source", "ai_generated");

    // Insert new experiences
    const experiencesToInsert = allExperiences.map((exp, index) => ({
      property_id,
      title: exp.title,
      description: exp.description,
      category: exp.category,
      distance_km: exp.distance_km ?? null,
      duration_hours: exp.duration_hours ?? null,
      price_indicator: exp.price_indicator,
      why_locals_love_it: exp.why_locals_love_it,
      best_time: exp.best_time,
      source: exp.source,
      venue_type: exp.venue_type ?? null,
      cuisine_type: exp.cuisine_type ?? null,
      reservation_required: exp.reservation_required ?? false,
      dress_code: exp.dress_code ?? null,
      display_order: index,
      is_active: true
    }));

    const { error: insertError } = await supabase
      .from("local_experiences")
      .insert(experiencesToInsert);

    if (insertError) {
      console.error("Error inserting experiences:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save experiences", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully generated ${allExperiences.length} experiences`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: allExperiences.length,
        dining_tier: diningTier,
        dining_source: diningFromXAI ? 'xai_grok' : (diningExperience ? 'lovable_ai' : 'none'),
        experiences: allExperiences.map(e => ({ title: e.title, category: e.category }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in enrich-property-experiences:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
