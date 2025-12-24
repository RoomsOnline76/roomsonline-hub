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
    const { propertyName, propertyDescription, editorialRating, existingContent } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context about the property
    const ratingContext = editorialRating 
      ? `The property has been given an editorial rating of "${editorialRating.replace(/_/g, ' ')}".` 
      : "";

    const systemPrompt = `You are an expert travel and hospitality copywriter for RoomsOnline, a curated luxury and boutique accommodation platform. 
Your writing style is:
- Evocative but not flowery
- Honest and specific, not generic
- Speaks to discerning travelers
- Uses sensory details sparingly but effectively
- Avoids clichés like "hidden gem" or "best-kept secret" unless truly warranted

Write in second person ("you") when addressing the traveler.
Keep each response concise - 2-4 sentences maximum per field.`;

    const userPrompt = `Generate editorial content for the following property:

Property Name: ${propertyName}
${propertyDescription ? `Description: ${propertyDescription}` : ""}
${ratingContext}

Please generate content for these fields (only for fields that don't already have content):

${!existingContent?.why_we_chose_this_place ? "1. why_we_chose_this_place: Explain what made this property stand out to our editorial team." : ""}
${!existingContent?.who_this_suits ? "2. who_this_suits: Describe the ideal guest - their preferences, travel style, and what they're seeking." : ""}
${!existingContent?.what_its_really_like ? "3. what_its_really_like: Give an honest, grounded description of the actual experience." : ""}
${!existingContent?.why_this_place_matters ? "4. why_this_place_matters: Explain the significance - what makes it memorable or impactful." : ""}
${!existingContent?.who_its_not_for ? "5. who_its_not_for: Be honest about who might not enjoy this property." : ""}

Respond with a JSON object containing only the fields you generated, with the field name as the key and the content as the value.`;

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
              description: "Generate editorial content for property fields",
              parameters: {
                type: "object",
                properties: {
                  why_we_chose_this_place: { type: "string", description: "What made this property stand out" },
                  who_this_suits: { type: "string", description: "The ideal guest profile" },
                  what_its_really_like: { type: "string", description: "Honest description of the experience" },
                  why_this_place_matters: { type: "string", description: "Significance and impact" },
                  who_its_not_for: { type: "string", description: "Who might not enjoy this property" }
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
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
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
