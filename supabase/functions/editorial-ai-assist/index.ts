import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, propertyContext, editorialRating, existingContent, title, content: journalContent } = body;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Handle journal meta generation
    if (action === "generate_journal_meta") {
      const systemPrompt = `You are an expert SEO copywriter. Generate compelling meta title and description for a journal article.`;
      
      const userPrompt = `Generate SEO-optimized meta title and description for this journal:
      
Title: ${title}
Content excerpt: ${journalContent?.substring(0, 1000) || "No content"}

Requirements:
- Meta title: 50-60 characters, compelling and includes main keyword
- Meta description: 150-160 characters, summarizes content and encourages clicks`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_meta",
                description: "Generate SEO meta title and description",
                parameters: {
                  type: "object",
                  properties: {
                    meta_title: { type: "string", description: "SEO meta title, 50-60 characters" },
                    meta_description: { type: "string", description: "SEO meta description, 150-160 characters" }
                  },
                  required: ["meta_title", "meta_description"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "generate_meta" } }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
      
      if (toolCall?.function?.arguments) {
        const result = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ meta_title: "", meta_description: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Original property editorial content generation

    // Build comprehensive property context
    const { 
      name, property_type, property_url, star_rating, description,
      country, city, suburb, restaurants_cafes, public_transport, closest_airport,
      pets_allowed, children_allowed, smoking_allowed, check_in_from, check_out_to,
      facilities, rooms 
    } = propertyContext || {};

    // Build rating context
    const ratingContext = editorialRating 
      ? `Editorial Rating: "${editorialRating.replace(/_/g, ' ')}"` 
      : "";

    // Build rooms summary
    const roomsSummary = rooms?.length 
      ? rooms.map((r: { name: string; maxPeople: number; bedConfiguration?: string }) => 
          `- ${r.name} (sleeps ${r.maxPeople}${r.bedConfiguration ? `, ${r.bedConfiguration}` : ''})`
        ).join('\n')
      : "No rooms configured";

    // Build policies summary
    const policies = [
      pets_allowed ? "Pets allowed" : "No pets",
      children_allowed ? "Children welcome" : "Adults only",
      smoking_allowed ? "Smoking permitted" : "No smoking"
    ].join(", ");

    const systemPrompt = `You are an expert travel and hospitality copywriter for RoomsOnline, a curated luxury and boutique accommodation platform. 

Your writing style is:
- Evocative but not flowery
- Honest and specific, not generic
- Speaks to discerning travelers
- Uses sensory details sparingly but effectively
- Avoids clichés like "hidden gem" or "best-kept secret"

CRITICAL RULES:
- Each field MUST be exactly 1-2 sentences. Never more than 2 sentences.
- Each response must directly address the specific intent of that field.
- Write in second person ("you") when addressing the traveler.
- Be specific to THIS property - reference actual facilities, location, or room types when relevant.`;

    const userPrompt = `Generate editorial content for this property:

PROPERTY: ${name || "Unknown"} (${property_type || "Accommodation"}, ${star_rating || 0}-star)
${ratingContext}
${property_url ? `Website: ${property_url}` : ""}

LOCATION: ${[city, suburb, country].filter(Boolean).join(", ") || "Not specified"}

DESCRIPTION: ${description || "No description provided"}

SURROUNDINGS:
- Dining: ${restaurants_cafes || "Not specified"}
- Transport: ${public_transport || "Not specified"}
- Airport: ${closest_airport || "Not specified"}

FACILITIES: ${facilities?.length ? facilities.join(", ") : "None listed"}

ROOM TYPES:
${roomsSummary}

POLICIES: ${policies}
Check-in: ${check_in_from || "Flexible"} | Check-out: ${check_out_to || "Flexible"}

---

Generate 1-2 sentences for each empty field, directly addressing its specific intent:

${!existingContent?.why_we_chose_this_place ? "1. why_we_chose_this_place: What specific quality made our editorial team select this property?" : ""}
${!existingContent?.who_this_suits ? "2. who_this_suits: Who is the ideal guest for this specific property?" : ""}
${!existingContent?.what_its_really_like ? "3. what_its_really_like: What is the honest, grounded experience of staying here?" : ""}
${!existingContent?.why_this_place_matters ? "4. why_this_place_matters: What makes this property memorable or significant?" : ""}
${!existingContent?.who_its_not_for ? "5. who_its_not_for: Who should consider other options instead?" : ""}`;

    console.log("Generating editorial content for:", name);
    console.log("Fields to generate:", Object.entries(existingContent || {}).filter(([_, v]) => !v).map(([k]) => k));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_editorial_content",
              description: "Generate editorial content for property fields (1-2 sentences each)",
              parameters: {
                type: "object",
                properties: {
                  why_we_chose_this_place: { 
                    type: "string", 
                    description: "1-2 sentences: The specific quality that made this property stand out" 
                  },
                  who_this_suits: { 
                    type: "string", 
                    description: "1-2 sentences: The ideal guest profile for this property" 
                  },
                  what_its_really_like: { 
                    type: "string", 
                    description: "1-2 sentences: Honest description of the actual experience" 
                  },
                  why_this_place_matters: { 
                    type: "string", 
                    description: "1-2 sentences: What makes it memorable or significant" 
                  },
                  who_its_not_for: { 
                    type: "string", 
                    description: "1-2 sentences: Who might not enjoy this property" 
                  }
                },
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_editorial_content" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    
    // Extract tool call response
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const suggestions = JSON.parse(toolCall.function.arguments);
      console.log("Generated suggestions:", Object.keys(suggestions));
      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to parse content directly
    const content = aiResponse.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return new Response(JSON.stringify({ suggestions: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("Failed to parse AI response:", content);
      }
    }

    return new Response(JSON.stringify({ suggestions: {} }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Editorial AI assist error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
