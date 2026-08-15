import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_MODELS, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReviewTheme {
  score: number;
  mentions: number;
  sentiment: "positive" | "neutral" | "negative";
}

interface SentimentAnalysis {
  overall_score: number;
  themes: Record<string, ReviewTheme>;
  top_quotes: string[];
  analyzed_at: string;
  review_count: number;
}

const THEME_CATEGORIES = [
  "cleanliness",
  "service",
  "location",
  "value",
  "rooms",
  "food",
  "amenities",
  "atmosphere",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, tripadvisor_id, force_refresh } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we have recent analysis (less than 24 hours old)
    if (!force_refresh) {
      const { data: property } = await supabase
        .from("properties")
        .select("review_sentiment")
        .eq("id", property_id)
        .single();

      if (property?.review_sentiment?.analyzed_at) {
        const analyzedAt = new Date(property.review_sentiment.analyzed_at);
        const hoursSince = (Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursSince < 24) {
          return new Response(
            JSON.stringify({ 
              sentiment: property.review_sentiment,
              cached: true,
              message: "Using cached analysis from within last 24 hours"
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fetch reviews from TripAdvisor API edge function
    let reviews: any[] = [];
    
    if (tripadvisor_id) {
      const { data: taData, error: taError } = await supabase.functions.invoke("tripadvisor-api", {
        body: { 
          action: "get_reviews", 
          location_id: tripadvisor_id,
          limit: 50
        }
      });

      if (!taError && taData?.reviews) {
        reviews = taData.reviews;
      }
    }

    // If no TripAdvisor reviews, check for cached/manual reviews
    if (reviews.length === 0) {
      const { data: cachedReviews } = await supabase
        .from("property_reviews")
        .select("*")
        .eq("property_id", property_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cachedReviews) {
        reviews = cachedReviews;
      }
    }

    // If still no reviews, return empty analysis
    if (reviews.length === 0) {
      const emptyAnalysis: SentimentAnalysis = {
        overall_score: 0,
        themes: {},
        top_quotes: [],
        analyzed_at: new Date().toISOString(),
        review_count: 0,
      };

      await supabase
        .from("properties")
        .update({ review_sentiment: emptyAnalysis })
        .eq("id", property_id);

      return new Response(
        JSON.stringify({ sentiment: emptyAnalysis, message: "No reviews found to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to analyze reviews
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Prepare review texts for analysis
    const reviewTexts = reviews
      .slice(0, 30) // Limit to 30 reviews for context window
      .map((r: any) => r.text || r.content || r.review_text || "")
      .filter((t: string) => t.length > 20);

    const analysisPrompt = `Analyze these hotel/property reviews and extract sentiment insights.

Reviews:
${reviewTexts.map((r: string, i: number) => `[${i + 1}] "${r}"`).join("\n\n")}

Analyze and return a JSON object with:
1. "overall_score": A score from 0-5 (one decimal) representing overall guest satisfaction
2. "themes": An object with these categories as keys: ${THEME_CATEGORIES.join(", ")}
   Each theme should have:
   - "score": 0-5 rating for that aspect
   - "mentions": approximate count of reviews mentioning this theme
   - "sentiment": "positive", "neutral", or "negative"
3. "top_quotes": An array of 3-5 standout positive quotes from the reviews (verbatim, 20-100 characters each)

Only include themes that have at least 2 mentions. Be accurate and conservative with scoring.

Respond ONLY with valid JSON, no markdown or explanation.`;

    const aiResponse = await aiFetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.review_sentiment,
        messages: [
          { role: "system", content: "You are a hospitality review analyst. Extract sentiment insights from guest reviews. Always respond with valid JSON only." },
          { role: "user", content: analysisPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI analysis failed:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let analysisText = aiData.choices?.[0]?.message?.content || "";
    
    // Clean up potential markdown formatting
    analysisText = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let analysisResult;
    try {
      analysisResult = JSON.parse(analysisText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", analysisText);
      throw new Error("Failed to parse sentiment analysis");
    }

    // Construct final sentiment object
    const sentiment: SentimentAnalysis = {
      overall_score: Math.min(5, Math.max(0, analysisResult.overall_score || 0)),
      themes: analysisResult.themes || {},
      top_quotes: (analysisResult.top_quotes || []).slice(0, 5),
      analyzed_at: new Date().toISOString(),
      review_count: reviews.length,
    };

    // Update property with sentiment analysis
    const { error: updateError } = await supabase
      .from("properties")
      .update({ review_sentiment: sentiment })
      .eq("id", property_id);

    if (updateError) {
      console.error("Failed to update property sentiment:", updateError);
    }

    return new Response(
      JSON.stringify({ 
        sentiment, 
        cached: false,
        message: `Analyzed ${reviews.length} reviews successfully`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Review analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
