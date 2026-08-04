import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Amenities we can detect from images
const DETECTABLE_AMENITIES = [
  'pool', 'swimming_pool', 'infinity_pool',
  'spa', 'sauna', 'hot_tub',
  'gym', 'fitness_center',
  'restaurant', 'bar', 'dining',
  'beach', 'ocean_view', 'sea_view', 'beachfront',
  'mountain_view', 'garden_view', 'city_view',
  'fireplace', 'jacuzzi',
  'balcony', 'terrace', 'patio',
  'parking', 'garage',
  'wheelchair_accessible', 'elevator',
  'tennis_court', 'golf',
  'pet_friendly',
  'kids_play_area', 'playground',
];

interface DetectedFeature {
  feature: string;
  confidence: number;
  source: 'image_analysis';
}

interface ValidationResult {
  detected_features: DetectedFeature[];
  mismatches: Array<{
    feature: string;
    detected: boolean;
    listed: boolean;
    suggestion: string;
  }>;
  suggestions: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, image_urls, current_amenities = [] } = await req.json();

    if (!property_id || !image_urls || !Array.isArray(image_urls)) {
      return new Response(
        JSON.stringify({ error: "property_id and image_urls array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "TOBI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze up to 5 images
    const imagesToAnalyze = image_urls.slice(0, 5);
    const allDetectedFeatures: DetectedFeature[] = [];

    for (const imageUrl of imagesToAnalyze) {
      try {
        // Use Gemini Vision for image analysis
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              {
                role: "system",
                content: `You are an expert at analyzing hotel and property images to detect amenities and features. 
                
Analyze the image and identify any of these features if visible:
${DETECTABLE_AMENITIES.join(', ')}

Respond with ONLY a JSON object (no markdown) in this format:
{
  "features": [
    {"feature": "pool", "confidence": 0.95},
    {"feature": "ocean_view", "confidence": 0.85}
  ]
}

Only include features you can clearly see in the image with confidence >= 0.7.`
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: imageUrl }
                  },
                  {
                    type: "text",
                    text: "Analyze this property image and identify visible amenities and features."
                  }
                ]
              }
            ],
            max_tokens: 500,
          }),
        });

        if (!response.ok) {
          console.error(`Image analysis failed for ${imageUrl}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Parse JSON response
        try {
          // Clean potential markdown wrapping
          const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
          const parsed = JSON.parse(cleanContent);
          
          if (parsed.features && Array.isArray(parsed.features)) {
            parsed.features.forEach((f: any) => {
              if (f.feature && f.confidence >= 0.7) {
                allDetectedFeatures.push({
                  feature: f.feature.toLowerCase().replace(/\s+/g, '_'),
                  confidence: f.confidence,
                  source: 'image_analysis',
                });
              }
            });
          }
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError, content);
        }
      } catch (imageError) {
        console.error(`Error analyzing image ${imageUrl}:`, imageError);
      }
    }

    // Deduplicate and get highest confidence for each feature
    const featureMap = new Map<string, DetectedFeature>();
    allDetectedFeatures.forEach(f => {
      const existing = featureMap.get(f.feature);
      if (!existing || existing.confidence < f.confidence) {
        featureMap.set(f.feature, f);
      }
    });

    const detected_features = Array.from(featureMap.values());

    // Compare detected features against listed amenities
    const listedAmenities = new Set(
      current_amenities.map((a: string) => a.toLowerCase().replace(/\s+/g, '_'))
    );

    const mismatches: ValidationResult['mismatches'] = [];
    const suggestions: string[] = [];

    // Features detected but not listed
    detected_features.forEach(f => {
      if (!listedAmenities.has(f.feature) && f.confidence >= 0.8) {
        mismatches.push({
          feature: f.feature,
          detected: true,
          listed: false,
          suggestion: `Image suggests "${f.feature.replace(/_/g, ' ')}" – enable this filter?`,
        });
        suggestions.push(`Add "${f.feature.replace(/_/g, ' ')}" to amenities`);
      }
    });

    // Key features listed but not detected (potential data inconsistency)
    const keyFeatures = ['pool', 'spa', 'gym', 'beach', 'restaurant'];
    keyFeatures.forEach(feature => {
      if (listedAmenities.has(feature) && !featureMap.has(feature)) {
        // Only flag if we analyzed multiple images
        if (imagesToAnalyze.length >= 3) {
          mismatches.push({
            feature,
            detected: false,
            listed: true,
            suggestion: `"${feature}" is listed but not visible in images – verify accuracy`,
          });
        }
      }
    });

    const result: ValidationResult = {
      detected_features,
      mismatches,
      suggestions,
    };

    // Store validation results in property metadata
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update ai_confidence_metadata with image validation results
    const { error: updateError } = await supabase
      .from("properties")
      .update({
        ai_confidence_metadata: {
          image_validation: {
            detected_features,
            analyzed_at: new Date().toISOString(),
            images_analyzed: imagesToAnalyze.length,
          },
        },
      })
      .eq("id", property_id);

    if (updateError) {
      console.error("Failed to update property metadata:", updateError);
    }

    console.log(`Validated ${imagesToAnalyze.length} images, detected ${detected_features.length} features`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Image validation error:", error);
    const message = error instanceof Error ? error.message : "Failed to validate images";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
