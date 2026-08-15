import { AI_MODELS, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PropertyData {
  id: string;
  name: string;
  city: string;
  country: string;
  property_type: string;
  description: string | null;
  navigation_tags: string[] | null;
  amenities: unknown;
  editorial_rating: string | null;
  why_we_chose_this_place: string | null;
  who_this_suits: string | null;
  what_its_really_like: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all active properties from Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const propertiesResponse = await fetch(
      `${supabaseUrl}/rest/v1/properties?is_active=eq.true&permanently_deleted_at=is.null&select=id,name,city,country,property_type,description,navigation_tags,amenities,editorial_rating,why_we_chose_this_place,who_this_suits,what_its_really_like`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!propertiesResponse.ok) {
      console.error('Failed to fetch properties:', await propertiesResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to fetch properties' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const properties: PropertyData[] = await propertiesResponse.json();
    console.log(`Fetched ${properties.length} properties for AI matching`);

    // Prepare property summaries for AI
    const propertySummaries = properties.map(p => ({
      id: p.id,
      name: p.name,
      location: `${p.city}, ${p.country}`,
      type: p.property_type,
      description: p.description?.substring(0, 300) || '',
      tags: p.navigation_tags || [],
      rating: p.editorial_rating,
      highlights: [p.why_we_chose_this_place, p.who_this_suits, p.what_its_really_like]
        .filter(Boolean)
        .join(' ')
        .substring(0, 200),
    }));

    const systemPrompt = `You are Carike, a warm and knowledgeable travel curator for RoomsOnline, a curated collection of hand-picked accommodations. You have personally visited every property and speak with genuine enthusiasm about your favorites.

Your task is to match guest requests to the best properties from our inventory. Consider:
- Location preferences (coastal, mountain, city, countryside)
- Experience type (romantic, family, adventure, relaxation, business)
- Amenities and features mentioned
- Atmosphere and vibe
- Property type preferences

When writing your best_match_reason, speak as Carike in first person. Be warm, personal, and enthusiastic. Share why YOU love this property and why it's perfect for THIS guest. Vary your opening phrases - sometimes mention a specific detail you love, sometimes share a memory, sometimes highlight what makes it unique. Keep it conversational and genuine, not salesy.

Return your response using the match_properties function.`;

    const userPrompt = `Guest request: "${query}"

Available properties:
${JSON.stringify(propertySummaries, null, 2)}

Find the best matching properties (1-5) and explain why the top match is perfect for this guest.`;

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await aiFetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODELS.property_search,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'match_properties',
              description: 'Return matched properties with explanation',
              parameters: {
                type: 'object',
                properties: {
                  matched_property_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of property IDs ranked by match quality (best first), max 5',
                  },
                  best_match_reason: {
                    type: 'string',
                    description: 'Carike\'s personal recommendation in 2-3 sentences. Speak in first person as Carike, sharing why you love this property and why it\'s perfect for this guest. Be warm, genuine, and conversational.',
                  },
                },
                required: ['matched_property_ids', 'best_match_reason'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'match_properties' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI service rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service credits exhausted.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('AI gateway error:', aiResponse.status, await aiResponse.text());
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response:', JSON.stringify(aiData, null, 2));

    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'match_properties') {
      console.error('Unexpected AI response format:', aiData);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matchResult = JSON.parse(toolCall.function.arguments);
    
    // Validate that returned IDs exist in our property list
    const validPropertyIds = new Set(properties.map(p => p.id));
    const validatedIds = matchResult.matched_property_ids.filter((id: string) => validPropertyIds.has(id));

    console.log(`Matched ${validatedIds.length} properties`);

    // Log the search query anonymously (no user identification)
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/ai_search_logs`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            query: query,
            matched_count: validatedIds.length,
          }),
        }
      );
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('Failed to log search query:', logError);
    }

    return new Response(
      JSON.stringify({
        matched_property_ids: validatedIds,
        best_match_reason: matchResult.best_match_reason,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-property-search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
