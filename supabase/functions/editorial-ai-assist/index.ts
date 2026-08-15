import { AI_MODELS, describeAiFailure, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

      const response = await aiFetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODELS.editorial,
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
        console.error("[tobi] meta gateway error", response.status, errorText.slice(0, 400));
        const { code, error } = describeAiFailure(response.status, errorText);
        return new Response(JSON.stringify({ code, error }), {
          status: [429, 402, 403].includes(response.status) ? response.status : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    // TOBI: long-form property description for the Facilities tab (min 800 characters)
    if (action === "generate_property_description") {
      const ctx = propertyContext || {};
      const minChars = Number(body.minChars) > 0 ? Number(body.minChars) : 800;
      const roomLines = ctx.rooms?.length
        ? ctx.rooms.map((r: { name: string; maxPeople?: number; bedConfiguration?: string }) =>
            `- ${r.name}${r.maxPeople ? ` (sleeps ${r.maxPeople})` : ""}${r.bedConfiguration ? `, ${r.bedConfiguration}` : ""}`).join("\n")
        : "Not specified";

      const descPrompt = `You are a luxury hospitality copywriter writing the main listing description for an accommodation.

PROPERTY: ${ctx.name || "Unknown"} (${ctx.property_type || "Accommodation"}${ctx.star_rating ? `, ${ctx.star_rating}-star` : ""})
LOCATION: ${[ctx.suburb, ctx.city, ctx.country].filter(Boolean).join(", ") || "Not specified"}
FACILITIES: ${ctx.facilities?.length ? ctx.facilities.join(", ") : "None listed"}
ROOMS / UNITS:
${roomLines}
SURROUNDINGS: dining — ${ctx.restaurants_cafes || "n/a"}; transport — ${ctx.public_transport || "n/a"}; airport — ${ctx.closest_airport || "n/a"}
EXISTING DRAFT (improve and expand, keep any true facts): ${ctx.description || "none"}

RULES
- Write ${minChars}-1400 characters of flowing prose in 3-4 paragraphs separated by blank lines.
- Warm, editorial, specific. No clichés ("hidden gem", "nestled", "best-kept secret"), no bullet lists, no headings, no emojis.
- Only use facts given above — never invent facilities, distances, awards or star ratings.
- Cover: the feel of the place, the accommodation itself, the facilities guests actually use, and the location.
- Return ONLY the description text.`;

      const descRes = await aiFetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODELS.property_description,
          temperature: 0.5,
          messages: [{ role: "user", content: descPrompt }],
        }),
      });

      if (!descRes.ok) {
        const detail = await descRes.text().catch(() => "");
        console.error("[tobi] property description gateway error", descRes.status, detail.slice(0, 400));
        const { code, error } = describeAiFailure(descRes.status, detail);
        return new Response(JSON.stringify({ code, error }), {
          status: [429, 402, 403].includes(descRes.status) ? descRes.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const descJson = await descRes.json();
      const description = (descJson?.choices?.[0]?.message?.content ?? "").trim();
      return new Response(JSON.stringify({ description, characters: description.length, min_characters: minChars }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TOBI: long-form room/unit description for the Rooms tab (min 700 characters)
    if (action === "generate_room_description") {
      const ctx = propertyContext || {};
      const minChars = Number(body.minChars) > 0 ? Number(body.minChars) : 700;

      const roomPrompt = `You are a luxury hospitality copywriter writing the description for a single room or unit type within an accommodation property.

ROOM / UNIT: ${ctx.name || "Room"}
PARENT PROPERTY: ${ctx.propertyName || "Unknown"} (${ctx.propertyType || "Accommodation"})
LOCATION: ${[ctx.city, ctx.country].filter(Boolean).join(", ") || "Not specified"}
SLEEPS: ${ctx.maxPeople ?? "Not specified"}
BED CONFIGURATION: ${ctx.bedConfiguration || "Not specified"}
ROOM SIZE: ${ctx.roomSize ? `${ctx.roomSize} m²` : "Not specified"}
FACILITIES: ${ctx.facilities?.length ? ctx.facilities.join(", ") : "None listed"}
AMENITIES: ${ctx.amenities?.length ? ctx.amenities.join(", ") : "None listed"}
EXISTING DRAFT (improve and expand, keep any true facts): ${ctx.description || "none"}

RULES
- Write ${minChars}-1100 characters of flowing prose in 2-3 paragraphs separated by blank lines.
- Warm, editorial, specific. No clichés ("hidden gem", "nestled", "best-kept secret"), no bullet lists, no headings, no emojis.
- Only use facts given above — never invent facilities, sizes, views or features that aren't listed.
- Cover: the space itself, the sleeping arrangement, the in-room facilities and amenities, and who it suits.
- Return ONLY the description text.`;

      const roomRes = await aiFetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODELS.property_description,
          temperature: 0.5,
          messages: [{ role: "user", content: roomPrompt }],
        }),
      });

      if (!roomRes.ok) {
        if (roomRes.status === 429) {
          return new Response(JSON.stringify({ error: "TOBI is busy right now — please try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (roomRes.status === 402) {
          return new Response(JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const detail = await roomRes.text();
        console.error("room description AI error:", roomRes.status, detail.slice(0, 400));
        return new Response(JSON.stringify({ error: "TOBI could not write the room description." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomJson = await roomRes.json();
      const roomDescription = (roomJson?.choices?.[0]?.message?.content ?? "").trim();
      return new Response(JSON.stringify({ description: roomDescription, characters: roomDescription.length, min_characters: minChars }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TOBI: arrival policy / how-to-arrive instructions for the Policies tab
    if (action === "generate_arrival_policy") {
      const ctx = propertyContext || {};
      const minChars = Number(body.minChars) > 0 ? Number(body.minChars) : 200;

      const arrivalPrompt = `You are a hospitality operations writer producing the arrival instructions a guest receives before they travel to an accommodation property.

PROPERTY: ${ctx.name || "Unknown"} (${ctx.property_type || "Accommodation"})
ADDRESS: ${[ctx.street_address, ctx.suburb, ctx.city, ctx.postal_code, ctx.country].filter(Boolean).join(", ") || "Not specified"}
CHECK-IN: ${ctx.check_in_time || "Not specified"}   CHECK-OUT: ${ctx.check_out_time || "Not specified"}
RECEPTION / CONTACT: ${ctx.contact_phone || "the property contact number on your confirmation"}
PARKING: ${ctx.parking || "Not specified"}
NEAREST AIRPORT: ${ctx.closest_airport || "Not specified"}
EXISTING DRAFT (improve and expand, keep any true facts): ${ctx.current || "none"}

RULES
- Write ${minChars}-800 characters of clear, practical prose in 2-3 short paragraphs separated by blank lines.
- Cover, in order: how to find the property and the final approach, gate or door access and key collection, who to contact on arrival, and what happens on a late or after-hours arrival.
- Practical and calm — not marketing copy. No clichés, no bullet lists, no headings, no emojis.
- Only use facts given above. Never invent gate codes, key-safe codes, lockbox numbers, unit numbers, road names or distances. Where a specific detail is unknown, tell the guest it will be sent with their confirmation or to contact the property.
- Return ONLY the arrival instructions text.`;

      const arrRes = await aiFetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODELS.property_description,
          temperature: 0.5,
          messages: [{ role: "user", content: arrivalPrompt }],
        }),
      });

      if (!arrRes.ok) {
        if (arrRes.status === 429) {
          return new Response(JSON.stringify({ error: "TOBI is busy right now — please try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (arrRes.status === 402) {
          return new Response(JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const detail = await arrRes.text();
        console.error("arrival policy AI error:", arrRes.status, detail.slice(0, 400));
        return new Response(JSON.stringify({ error: "TOBI could not write the arrival policy." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const arrJson = await arrRes.json();
      const arrival = (arrJson?.choices?.[0]?.message?.content ?? "").trim();
      return new Response(JSON.stringify({ description: arrival, characters: arrival.length, min_characters: minChars }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (action === "generate_marketing_summary" || action === "generate_unique_selling_points") {
      const ctx = propertyContext || {};
      const isSummary = action === "generate_marketing_summary";
      const extractChatText = (json: Record<string, unknown>): string => {
        const choice = (json?.choices as Array<Record<string, unknown>> | undefined)?.[0];
        const message = (choice?.message ?? {}) as Record<string, unknown>;
        if (typeof message.content === "string") return message.content.trim();
        if (Array.isArray(message.content)) {
          return message.content
            .map((part) => (typeof part === "string" ? part : String((part as { text?: string })?.text ?? "")))
            .join("")
            .trim();
        }
        return "";
      };
      const prompt = isSummary
        ? `You are a hospitality copywriter writing a marketing summary for search results.

PROPERTY: ${ctx.name || "Unknown"} (${ctx.property_type || "Accommodation"})
LOCATION: ${[ctx.city, ctx.country].filter(Boolean).join(", ") || "Not specified"}
EXISTING DRAFT: ${ctx.current || ctx.description || "none"}

RULES
- Write 140-280 characters, one or two sentences.
- Warm, specific, no clichés, no emojis.
- Prefer facts given. If a fact is missing, write a short honest listing line from the name and location only.
- Return ONLY the summary text.`
        : `You are a hospitality copywriter listing what makes this property special.

PROPERTY: ${ctx.name || "Unknown"} (${ctx.property_type || "Accommodation"})
LOCATION: ${[ctx.city, ctx.country].filter(Boolean).join(", ") || "Not specified"}
FACILITIES: ${Array.isArray(ctx.facilities) ? ctx.facilities.join(", ") : "Not specified"}
EXISTING DRAFT: ${ctx.current || ctx.description || "none"}

RULES
- Write 2-4 short sentences (220-500 characters) about genuine differentiators.
- No clichés ("hidden gem", "nestled"), no bullets, no emojis.
- Prefer facts given. If little is provided, write from the property name, type and location only.
- Return ONLY the text.`;

      const res = await aiFetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODELS.property_description,
          temperature: 0.5,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("TOBI listing copy error:", res.status, detail.slice(0, 400));
        const { code, error } = describeAiFailure(res.status, detail);
        return new Response(JSON.stringify({ code, error }), {
          status: [429, 402, 403].includes(res.status) ? res.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const json = await res.json();
      let text = extractChatText(json);
      if (!text) {
        const loc = [ctx.city, ctx.country].filter(Boolean).join(", ");
        text = isSummary
          ? `${ctx.name || "This property"} is a ${ctx.property_type || "stay"}${loc ? ` in ${loc}` : ""}, written for guests who want a clear, honest listing.`
          : `${ctx.name || "This property"} stands out as a ${ctx.property_type || "stay"}${loc ? ` in ${loc}` : ""}. Its character comes from the setting and the way the property is run — review the draft and add the details only you know.`;
      }
      return new Response(JSON.stringify({ text, enhanced: text, description: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "enhance_description") {
      body.action = "generate_property_description";
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

    const response = await aiFetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.editorial,
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
      const errorText = await response.text().catch(() => "");
      console.error("[tobi] editorial gateway error", response.status, errorText.slice(0, 400));
      const { code, error } = describeAiFailure(response.status, errorText);
      return new Response(JSON.stringify({ code, error }), {
        status: [429, 402, 403].includes(response.status) ? response.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
