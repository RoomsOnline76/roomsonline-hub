import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_MODELS } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PropertyData {
  id: string;
  slug: string;
  name: string;
  property_type: string;
  description: string | null;
  city: string;
  country: string;
  address: string;
  amenities: any;
  editorial_rating: string | null;
  why_we_chose_this_place: string | null;
  who_this_suits: string | null;
  what_its_really_like: string | null;
  why_this_place_matters: string | null;
  who_its_not_for: string | null;
}

async function generateEditorialContent(
  property: PropertyData,
  apiKey: string
): Promise<{ [key: string]: string } | null> {
  // Build property context
  const amenities = property.amenities || {};
  
  const propertyContext = `
Property Name: ${property.name}
Type: ${property.property_type}
Location: ${property.city}, ${property.country}
Address: ${property.address}

Description: ${property.description || "No description available"}

Facilities & Amenities:
${amenities.dining ? `- Dining: ${JSON.stringify(amenities.dining)}` : ""}
${amenities.wellness ? `- Wellness: ${JSON.stringify(amenities.wellness)}` : ""}
${amenities.activities ? `- Activities: ${JSON.stringify(amenities.activities)}` : ""}
${amenities.general ? `- General: ${JSON.stringify(amenities.general)}` : ""}
${amenities.connectivity ? `- Connectivity: ${JSON.stringify(amenities.connectivity)}` : ""}
${amenities.accessibility ? `- Accessibility: ${JSON.stringify(amenities.accessibility)}` : ""}
${amenities.petPolicy ? `- Pet Policy: ${JSON.stringify(amenities.petPolicy)}` : ""}
${amenities.childPolicy ? `- Child Policy: ${JSON.stringify(amenities.childPolicy)}` : ""}

Rooms:
${amenities.rooms ? JSON.stringify(amenities.rooms, null, 2) : "No room data"}
`;

  const systemPrompt = `You are a senior travel editor at a discerning publication. Your writing is:
- Evocative but never flowery or clichéd
- Honest and specific, avoiding generic hospitality language
- Speaks to sophisticated travelers who appreciate nuance
- Uses sensory details sparingly but effectively
- Confidently opinionated—you know what makes a place special

Write in complete sentences. Be concise—1-2 sentences per field maximum.`;

  const userPrompt = `Based on this property information, generate editorial content for each field.

${propertyContext}

Generate content for these 5 fields:
1. why_we_chose_this_place - What made our team select this property for the collection? Focus on the unique quality or experience.
2. who_this_suits - Describe the ideal guest in specific, evocative terms (not generic like "couples and families").
3. what_its_really_like - Give an honest, sensory snapshot of staying here. What's the actual experience?
4. why_this_place_matters - What makes this property memorable or significant? What will guests remember?
5. who_its_not_for - Be honest about who might not enjoy it (helps set expectations).

IMPORTANT: Each response should be 1-2 sentences only. Be specific to THIS property, not generic.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.editorial,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_editorial_content",
              description: "Save the generated editorial content for the property",
              parameters: {
                type: "object",
                properties: {
                  why_we_chose_this_place: {
                    type: "string",
                    description: "1-2 sentences on why this property was selected",
                  },
                  who_this_suits: {
                    type: "string",
                    description: "1-2 sentences describing the ideal guest",
                  },
                  what_its_really_like: {
                    type: "string",
                    description: "1-2 sentences giving an honest snapshot of the experience",
                  },
                  why_this_place_matters: {
                    type: "string",
                    description: "1-2 sentences on what makes it memorable",
                  },
                  who_its_not_for: {
                    type: "string",
                    description: "1-2 sentences on who might not enjoy it",
                  },
                },
                required: [
                  "why_we_chose_this_place",
                  "who_this_suits",
                  "what_its_really_like",
                  "why_this_place_matters",
                  "who_its_not_for",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_editorial_content" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI Gateway error for ${property.slug}:`, response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    // Extract from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        return JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error(`Failed to parse tool call arguments for ${property.slug}:`, e);
      }
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log(`Attempting to parse content for ${property.slug}`);
      // Try to extract JSON from content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error(`Failed to parse content JSON for ${property.slug}:`, e);
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error generating content for ${property.slug}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional scope: run for specific properties (single-property run from the ROL Spec tab)
    let requestBody: Record<string, unknown> = {};
    try {
      requestBody = (await req.json()) ?? {};
    } catch {
      requestBody = {};
    }
    const scopedIds: string[] = Array.isArray(requestBody.property_ids)
      ? (requestBody.property_ids as string[]).filter((id) => typeof id === "string")
      : typeof requestBody.property_id === "string"
        ? [requestBody.property_id as string]
        : [];
    const overwrite = requestBody.overwrite === true;

    // Fetch properties needing editorial content
    let query = supabase
      .from("properties")
      .select("id, slug, name, property_type, description, city, country, address, amenities, editorial_rating, why_we_chose_this_place, who_this_suits, what_its_really_like, why_this_place_matters, who_its_not_for");

    if (scopedIds.length > 0) {
      query = query.in("id", scopedIds);
    } else {
      query = query.eq("is_active", true).is("why_we_chose_this_place", null);
    }

    const { data: properties, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch properties: ${fetchError.message}`);
    }

    if (!properties || properties.length === 0) {
      throw new Error("No properties found");
    }

    console.log(`Found ${properties.length} properties to process`);

    const results: {
      slug: string;
      success: boolean;
      error?: string;
      content?: Record<string, string>;
    }[] = [];

    // Process each property sequentially to avoid rate limits
    for (const property of properties) {
      console.log(`Processing: ${property.slug}`);
      
      // Check if content already exists
      if (!overwrite && property.why_we_chose_this_place && property.who_this_suits) {
        console.log(`Skipping ${property.slug} - already has content`);
        results.push({ slug: property.slug, success: true, error: "Already has content" });
        continue;
      }

      // Generate content
      const content = await generateEditorialContent(property, LOVABLE_API_KEY);
      
      if (!content) {
        results.push({ slug: property.slug, success: false, error: "Failed to generate content" });
        continue;
      }

      // Update the property
      const { error: updateError } = await supabase
        .from("properties")
        .update({
          why_we_chose_this_place: content.why_we_chose_this_place,
          who_this_suits: content.who_this_suits,
          what_its_really_like: content.what_its_really_like,
          why_this_place_matters: content.why_this_place_matters,
          who_its_not_for: content.who_its_not_for,
          updated_at: new Date().toISOString(),
        })
        .eq("id", property.id);

      if (updateError) {
        console.error(`Failed to update ${property.slug}:`, updateError);
        results.push({ slug: property.slug, success: false, error: updateError.message });
      } else {
        console.log(`Successfully updated ${property.slug}`);
        results.push({ slug: property.slug, success: true, content });
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successCount = results.filter(r => r.success && !r.error?.includes("Already")).length;
    const skippedCount = results.filter(r => r.error?.includes("Already")).length;
    const failedCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Processed ${properties.length} properties`,
        summary: {
          generated: successCount,
          skipped: skippedCount,
          failed: failedCount,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Bulk editorial generate error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
