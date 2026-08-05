import { AI_MODELS } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedRoomType {
  name: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
  bedConfiguration: { type: string; count: number }[];
  amenities: string[];
  description?: string;
  roomSize?: number;
  roomSizeUnit?: string;
  viewType?: string;
  confidence: number;
}

const BED_TYPE_MAPPINGS: Record<string, string> = {
  "king": "king",
  "queen": "queen",
  "double": "double",
  "twin": "twin",
  "single": "single",
  "bunk": "bunk",
  "sofa bed": "sofa_bed",
  "sofabed": "sofa_bed",
  "pull-out": "sofa_bed",
  "daybed": "daybed",
  "futon": "futon",
  "crib": "crib",
  "cot": "cot",
};

const AMENITY_KEYWORDS: Record<string, string[]> = {
  "balcony": ["balcony", "terrace", "patio", "deck"],
  "ocean_view": ["ocean view", "sea view", "oceanfront", "beachfront", "water view"],
  "mountain_view": ["mountain view", "mountain-facing"],
  "garden_view": ["garden view", "garden-facing", "courtyard view"],
  "city_view": ["city view", "urban view", "skyline"],
  "pool_access": ["pool", "swimming pool", "plunge pool", "private pool"],
  "kitchen": ["kitchen", "kitchenette", "cooking facilities"],
  "jacuzzi": ["jacuzzi", "hot tub", "spa bath", "whirlpool"],
  "fireplace": ["fireplace", "fire place", "wood burner"],
  "air_conditioning": ["air conditioning", "a/c", "ac", "climate control"],
  "wifi": ["wifi", "wi-fi", "internet"],
  "ensuite": ["ensuite", "en-suite", "private bathroom", "attached bathroom"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, property_context } = await req.json();

    if (!description || typeof description !== "string") {
      return new Response(
        JSON.stringify({ error: "description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const parsePrompt = `Parse this natural language room description into structured data.

Input: "${description}"

${property_context ? `Property context: ${property_context}` : ""}

Extract and return a JSON object with:
1. "name": A suitable room type name (e.g., "Ocean View Suite", "Deluxe King Room")
2. "maxGuests": Maximum number of guests (integer, infer from beds if not specified)
3. "bedrooms": Number of bedrooms if mentioned
4. "bathrooms": Number of bathrooms if mentioned
5. "bedConfiguration": Array of {type, count} where type is one of: king, queen, double, twin, single, bunk, sofa_bed, daybed
6. "amenities": Array of amenity codes from: balcony, ocean_view, mountain_view, garden_view, city_view, pool_access, kitchen, jacuzzi, fireplace, air_conditioning, wifi, ensuite
7. "description": A polished 1-2 sentence marketing description based on the input
8. "roomSize": Square meters if mentioned (number only)
9. "roomSizeUnit": "sqm" or "sqft"
10. "viewType": The primary view type if mentioned
11. "confidence": Your confidence score 0-1 in the parsing accuracy

Be conservative - only include what's clearly stated or strongly implied.

Respond ONLY with valid JSON, no markdown.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.room_parsing,
        messages: [
          { 
            role: "system", 
            content: "You are a hospitality room type parser. Convert natural language descriptions into structured room data. Be accurate and conservative." 
          },
          { role: "user", content: parsePrompt }
        ],
        max_tokens: 800,
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      // Fallback to regex-based parsing
      const fallbackResult = parseWithRegex(description);
      return new Response(
        JSON.stringify({ 
          roomType: fallbackResult,
          method: "fallback",
          message: "AI unavailable, used regex parsing"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let responseText = aiData.choices?.[0]?.message?.content || "";
    
    // Clean markdown
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: ParsedRoomType;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Fallback to regex parsing
      const fallbackResult = parseWithRegex(description);
      return new Response(
        JSON.stringify({ 
          roomType: fallbackResult,
          method: "fallback",
          message: "Failed to parse AI response, used regex"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and sanitize
    const sanitized: ParsedRoomType = {
      name: parsed.name || generateNameFromBeds(parsed.bedConfiguration || []),
      maxGuests: Math.max(1, Math.min(20, parsed.maxGuests || 2)),
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      bedConfiguration: (parsed.bedConfiguration || []).filter(
        (b: any) => b.type && b.count > 0
      ),
      amenities: (parsed.amenities || []).filter(
        (a: string) => Object.keys(AMENITY_KEYWORDS).includes(a)
      ),
      description: parsed.description,
      roomSize: parsed.roomSize,
      roomSizeUnit: parsed.roomSizeUnit,
      viewType: parsed.viewType,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
    };

    return new Response(
      JSON.stringify({ 
        roomType: sanitized,
        method: "ai",
        message: "Successfully parsed room description"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Smart room parser error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Parsing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseWithRegex(description: string): ParsedRoomType {
  const lower = description.toLowerCase();
  
  // Extract bed configuration
  const bedConfig: { type: string; count: number }[] = [];
  
  for (const [keyword, bedType] of Object.entries(BED_TYPE_MAPPINGS)) {
    const regex = new RegExp(`(\\d+)?\\s*${keyword}`, "gi");
    const match = lower.match(regex);
    if (match) {
      const countMatch = match[0].match(/(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 1;
      bedConfig.push({ type: bedType, count });
    }
  }

  // Extract amenities
  const amenities: string[] = [];
  for (const [amenityCode, keywords] of Object.entries(AMENITY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      amenities.push(amenityCode);
    }
  }

  // Extract guest count
  const guestMatch = lower.match(/sleeps?\s*(\d+)/i) || lower.match(/(\d+)\s*guests?/i);
  const maxGuests = guestMatch ? parseInt(guestMatch[1]) : 
    bedConfig.reduce((sum, b) => sum + (b.count * (b.type === "king" || b.type === "queen" ? 2 : 1)), 0) || 2;

  // Extract room size
  const sizeMatch = lower.match(/(\d+)\s*(sqm|sq\.?m|square\s*met|sqft|sq\.?ft|square\s*feet)/i);
  const roomSize = sizeMatch ? parseInt(sizeMatch[1]) : undefined;
  const roomSizeUnit = sizeMatch && sizeMatch[2].includes("ft") ? "sqft" : "sqm";

  return {
    name: generateNameFromBeds(bedConfig),
    maxGuests,
    bedConfiguration: bedConfig,
    amenities,
    roomSize,
    roomSizeUnit: roomSize ? roomSizeUnit : undefined,
    confidence: 0.5,
  };
}

function generateNameFromBeds(bedConfig: { type: string; count: number }[]): string {
  if (bedConfig.length === 0) return "Standard Room";
  
  const primary = bedConfig[0];
  const bedName = primary.type.charAt(0).toUpperCase() + primary.type.slice(1);
  
  if (bedConfig.length === 1 && primary.count === 1) {
    return `${bedName} Room`;
  }
  
  return `${bedName} Suite`;
}
