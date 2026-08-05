const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PatternEntry {
  pattern: RegExp;
  tag: string;
  extractAfter?: boolean;
}

// Pattern categories for NLP parsing
const PATTERNS: Record<string, PatternEntry[]> = {
  // High priority - require staff attention
  HIGH_PRIORITY: [
    { pattern: /\b(allerg(y|ic|ies)|allergenic)\b/i, tag: "allergy", extractAfter: true },
    { pattern: /\b(wheelchair|mobility|disabled|handicap|accessible)\b/i, tag: "accessibility" },
    { pattern: /\b(ground\s*floor|first\s*floor|lower\s*floor|no\s*stairs)\b/i, tag: "accessibility_ground_floor" },
    { pattern: /\b(medical|health\s*condition|medication)\b/i, tag: "medical" },
    { pattern: /\b(blind|deaf|hearing\s*impair|visually\s*impair)\b/i, tag: "accessibility_sensory" },
  ],
  
  // Timing requests
  TIMING: [
    { pattern: /\b(early\s*check[\s-]*in|check[\s-]*in\s*early|arrive\s*early)\b/i, tag: "early_check_in" },
    { pattern: /\b(late\s*check[\s-]*out|check[\s-]*out\s*late|leave\s*late|extend\s*stay)\b/i, tag: "late_check_out" },
    { pattern: /\b(late\s*(arrival|check[\s-]*in)|arriv(e|ing)\s*late|after\s*(midnight|10\s*pm|11\s*pm))\b/i, tag: "late_arrival" },
    { pattern: /\b(early\s*departure|leav(e|ing)\s*early|depart\s*early)\b/i, tag: "early_departure" },
  ],
  
  // Celebrations
  CELEBRATION: [
    { pattern: /\b(anniversary|wedding\s*anniversary)\b/i, tag: "celebration_anniversary" },
    { pattern: /\b(honeymoon|just\s*married|newlywed)\b/i, tag: "celebration_honeymoon" },
    { pattern: /\b(birthday|birth\s*day)\b/i, tag: "celebration_birthday" },
    { pattern: /\b(proposal|propos(e|ing)|engagement)\b/i, tag: "celebration_proposal" },
    { pattern: /\b(romantic|special\s*occasion|celebration)\b/i, tag: "celebration_romantic" },
  ],
  
  // Dietary
  DIETARY: [
    { pattern: /\b(vegetarian|veggie)\b/i, tag: "dietary_vegetarian" },
    { pattern: /\b(vegan)\b/i, tag: "dietary_vegan" },
    { pattern: /\b(halal)\b/i, tag: "dietary_halal" },
    { pattern: /\b(kosher)\b/i, tag: "dietary_kosher" },
    { pattern: /\b(gluten[\s-]*free|celiac|coeliac)\b/i, tag: "dietary_gluten_free" },
    { pattern: /\b(lactose[\s-]*free|dairy[\s-]*free)\b/i, tag: "dietary_dairy_free" },
    { pattern: /\b(nut[\s-]*free|peanut\s*allergy|tree\s*nut)\b/i, tag: "dietary_nut_free" },
  ],
  
  // Pets
  PETS: [
    { pattern: /\b(pet|dog|cat|animal)\b/i, tag: "pets" },
    { pattern: /\b(service\s*(dog|animal)|guide\s*dog|assistance\s*animal)\b/i, tag: "service_animal" },
  ],
  
  // Room preferences
  ROOM: [
    { pattern: /\b(quiet\s*room|quiet\s*location|away\s*from\s*noise)\b/i, tag: "room_quiet" },
    { pattern: /\b(high\s*floor|upper\s*floor|top\s*floor)\b/i, tag: "room_high_floor" },
    { pattern: /\b(connecting\s*room|adjoining\s*room)\b/i, tag: "room_connecting" },
    { pattern: /\b(king\s*bed|queen\s*bed|double\s*bed)\b/i, tag: "room_bed_preference" },
    { pattern: /\b(twin\s*bed|separate\s*bed|two\s*bed)\b/i, tag: "room_twin_beds" },
    { pattern: /\b(cot|crib|baby\s*bed)\b/i, tag: "room_cot" },
    { pattern: /\b(view|ocean\s*view|mountain\s*view|garden\s*view|pool\s*view)\b/i, tag: "room_view" },
    { pattern: /\b(non[\s-]*smoking|smoke[\s-]*free)\b/i, tag: "room_non_smoking" },
    { pattern: /\b(smoking\s*room)\b/i, tag: "room_smoking" },
  ],
  
  // Transport
  TRANSPORT: [
    { pattern: /\b(airport\s*(transfer|pickup|shuttle)|pick\s*up\s*from\s*airport)\b/i, tag: "transport_airport" },
    { pattern: /\b(parking|car\s*park)\b/i, tag: "transport_parking" },
    { pattern: /\b(wheelchair\s*transport|accessible\s*transport)\b/i, tag: "transport_accessible" },
  ],
  
  // Guest composition
  GUESTS: [
    { pattern: /\b(elderly|senior|old\s*parent|grandparent)\b/i, tag: "guest_elderly" },
    { pattern: /\b(infant|baby|toddler|newborn)\b/i, tag: "guest_infant" },
    { pattern: /\b(child(ren)?|kid|young\s*(one|child))\b/i, tag: "guest_children" },
    { pattern: /\b(pregnant|expecting|pregnancy)\b/i, tag: "guest_pregnant" },
  ],
};

interface ParsedResult {
  tags: string[];
  priority: "high" | "normal";
  alerts: string[];
  rawMatches: Array<{ tag: string; matchedText: string }>;
}

function parseSpecialRequests(text: string): ParsedResult {
  if (!text || typeof text !== "string") {
    return { tags: [], priority: "normal", alerts: [], rawMatches: [] };
  }

  const normalizedText = text.toLowerCase().trim();
  const tags: Set<string> = new Set();
  const alerts: string[] = [];
  const rawMatches: Array<{ tag: string; matchedText: string }> = [];
  let isHighPriority = false;

  // Process each category
  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const { pattern, tag, extractAfter } of patterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        tags.add(tag);
        rawMatches.push({ tag, matchedText: match[0] });

        // High priority categories
        if (category === "HIGH_PRIORITY") {
          isHighPriority = true;
          
          // Extract context for allergies
          if (extractAfter && tag === "allergy") {
            // Try to extract what they're allergic to
            const allergyContext = normalizedText.match(
              /allerg(y|ic|ies)\s*(to|:)?\s*([^,.!?]+)/i
            );
            if (allergyContext && allergyContext[3]) {
              const allergen = allergyContext[3].trim();
              alerts.push(`Allergy: ${allergen}`);
            } else {
              alerts.push("Allergy mentioned - verify details with guest");
            }
          }
        }
      }
    }
  }

  // Detect other high-priority situations
  if (normalizedText.match(/\b(urgent|important|critical|must|essential)\b/i)) {
    isHighPriority = true;
  }

  return {
    tags: Array.from(tags),
    priority: isHighPriority ? "high" : "normal",
    alerts,
    rawMatches,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { special_requests, booking_id } = await req.json();

    if (!special_requests) {
      return new Response(
        JSON.stringify({
          success: true,
          parsed: { tags: [], priority: "normal", alerts: [], rawMatches: [] },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsing special requests for booking ${booking_id || "unknown"}`);
    console.log("Input text:", special_requests.substring(0, 200));

    const parsed = parseSpecialRequests(special_requests);

    console.log("Parsed result:", {
      tagsCount: parsed.tags.length,
      priority: parsed.priority,
      alertsCount: parsed.alerts.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        parsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
