import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExperienceSuggestion {
  title: string;
  description: string;
  category: 'nature' | 'culture' | 'food' | 'adventure' | 'relaxation' | 'wellness';
  duration_hours: number;
  price_indicator: 'free' | 'budget' | 'moderate' | 'luxury';
  why_locals_love_it: string;
  best_time: string;
  distance_km?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { property_id, property_name, city, country } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check existing experiences count
    const { count } = await supabase
      .from('local_experiences')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', property_id);

    if ((count || 0) >= 5) {
      return new Response(
        JSON.stringify({ 
          message: "Property already has 5+ experiences",
          count: count 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get property details if not provided
    let propName = property_name;
    let propCity = city;
    let propCountry = country;

    if (!propName || !propCity) {
      const { data: property } = await supabase
        .from('properties')
        .select('name, city, country, property_type, editorial_hook')
        .eq('id', property_id)
        .single();

      if (property) {
        propName = propName || property.name;
        propCity = propCity || property.city;
        propCountry = propCountry || property.country;
      }
    }

    if (!propName || !propCity) {
      return new Response(
        JSON.stringify({ error: "Could not determine property location" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate experiences using Lovable AI
    const prompt = `Generate 5 compelling local experiences for guests staying at "${propName}" in ${propCity}, ${propCountry || 'South Africa'}.

Include exactly:
- 1 nature/outdoor activity
- 1 cultural/historical visit
- 1 food/dining experience
- 1 adventure activity
- 1 relaxation or wellness option

For each experience, provide:
- title: A catchy, specific name (not generic)
- description: 2-3 sentences about what makes it special
- category: One of 'nature', 'culture', 'food', 'adventure', 'relaxation', 'wellness'
- duration_hours: Typical time needed (number)
- price_indicator: 'free', 'budget', 'moderate', or 'luxury'
- why_locals_love_it: One sentence from a local's perspective
- best_time: Best time of day or season to visit

Return as a JSON object with an "experiences" array containing these 5 objects.`;

    let experiences: ExperienceSuggestion[] = [];

    if (lovableApiKey) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { 
                role: "system", 
                content: "You are a local travel expert who knows hidden gems and authentic experiences. Always respond with valid JSON." 
              },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          
          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*"experiences"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            experiences = parsed.experiences || [];
          }
        } else {
          console.error("AI API error:", await aiResponse.text());
        }
      } catch (aiError) {
        console.error("AI generation error:", aiError);
      }
    }

    // Fallback to template-based experiences if AI fails
    if (experiences.length === 0) {
      experiences = [
        {
          title: `${propCity} Nature Walk`,
          description: `Explore the natural beauty surrounding ${propCity} with guided walking trails through local landscapes.`,
          category: 'nature',
          duration_hours: 3,
          price_indicator: 'budget',
          why_locals_love_it: 'The sunrise views are absolutely magical.',
          best_time: 'Early morning'
        },
        {
          title: `${propCity} Cultural Tour`,
          description: `Discover the rich heritage and history of ${propCity} through its museums, monuments, and local stories.`,
          category: 'culture',
          duration_hours: 2,
          price_indicator: 'moderate',
          why_locals_love_it: 'Every corner has a story waiting to be told.',
          best_time: 'Late morning'
        },
        {
          title: `Local Food Experience`,
          description: `Taste authentic ${propCountry || 'South African'} cuisine at local favorites known only to residents.`,
          category: 'food',
          duration_hours: 2,
          price_indicator: 'moderate',
          why_locals_love_it: 'The flavors here are unmatched anywhere else.',
          best_time: 'Lunch or dinner'
        },
        {
          title: `${propCity} Adventure Activity`,
          description: `Get your adrenaline pumping with exciting outdoor adventures in the ${propCity} area.`,
          category: 'adventure',
          duration_hours: 4,
          price_indicator: 'moderate',
          why_locals_love_it: 'The perfect way to experience the landscape.',
          best_time: 'Morning'
        },
        {
          title: `Wellness & Relaxation`,
          description: `Unwind and rejuvenate at local spas and wellness centers offering traditional treatments.`,
          category: 'wellness',
          duration_hours: 2,
          price_indicator: 'luxury',
          why_locals_love_it: 'The perfect escape from everyday stress.',
          best_time: 'Afternoon'
        }
      ];
    }

    // Insert experiences into database
    const experiencesToInsert = experiences.map((exp, index) => ({
      property_id,
      title: exp.title,
      description: exp.description,
      category: exp.category,
      duration_hours: exp.duration_hours,
      price_indicator: exp.price_indicator,
      why_locals_love_it: exp.why_locals_love_it,
      best_time: exp.best_time,
      distance_km: exp.distance_km || null,
      display_order: index,
      source: 'ai_generated',
      is_active: true
    }));

    const { error: insertError } = await supabase
      .from('local_experiences')
      .insert(experiencesToInsert);

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save experiences", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generated ${experiencesToInsert.length} experiences for property ${property_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: experiencesToInsert.length,
        experiences: experiencesToInsert.map(e => ({ title: e.title, category: e.category }))
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
