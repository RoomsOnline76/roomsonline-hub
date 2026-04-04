import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EDITORIAL_FIELDS = [
  "space_description",
  "neighbourhood_description",
  "getting_around",
  "things_to_know",
  "key_highlights",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, website_url, force_overwrite = false } = await req.json();

    if (!property_id || !website_url) {
      return new Response(
        JSON.stringify({ success: false, error: "property_id and website_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentSyncs } = await supabase
      .from("sync_logs")
      .select("id")
      .eq("property_id", property_id)
      .eq("sync_type", "content_enrichment")
      .gte("created_at", oneHourAgo);

    if (recentSyncs && recentSyncs.length >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit: max 3 enrichments per hour" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch property data + brand voice in parallel
    const [propertyResult, brandVoiceResult] = await Promise.all([
      supabase.from("properties").select("amenities").eq("id", property_id).single(),
      supabase.from("rolos_experience_configs")
        .select("config")
        .eq("property_id", property_id)
        .eq("experience_type", "brand_kit")
        .maybeSingle(),
    ]);

    if (propertyResult.error || !propertyResult.data) {
      return new Response(
        JSON.stringify({ success: false, error: "Property not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const property = propertyResult.data;
    const brandVoice = (brandVoiceResult.data?.config as any)?.brand_voice || null;

    // Scrape website
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Enriching property:", property_id, "from:", website_url, "brand_voice:", brandVoice ? "yes" : "no");

    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: website_url, formats: ["markdown"], onlyMainContent: false }),
    });

    const scrapeData = await scrapeResponse.json();
    if (!scrapeResponse.ok || !scrapeData.success) {
      return new Response(
        JSON.stringify({ success: false, error: `Scrape failed: ${scrapeData.error || "Unknown"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = scrapeData.data?.markdown || scrapeData.markdown || "";
    if (content.length < 100) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient content scraped" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build brand voice instruction
    const brandInstruction = brandVoice
      ? `\n\nBRAND VOICE & TONE:\n"${brandVoice}"\n\nWrite ALL descriptions in this voice. The space_description should feel like evocative marketing copy — not a dry extraction. Weave highlights naturally into the prose. Make a guest feel the experience before they arrive.`
      : `\n\nWrite in a warm, inviting, editorial tone — like a luxury travel magazine. The space_description should be evocative marketing prose, not a dry list of features.`;

    const extractionPrompt = `You are a luxury travel copywriter creating editorial content for a premium accommodation listing.

From the website content below, produce these fields as JSON:

1. "space_description" — Craft 2-4 evocative paragraphs about the space/apartment/room. Don't just extract — REWRITE with personality and warmth. Paint a picture of the experience. Separate paragraphs with \\n\\n. If insufficient source material, return null.

2. "neighbourhood_description" — A vivid 2-3 paragraph guide to the neighbourhood/area. Mention specific places, distances, vibes. Make the reader feel the location. If not found, return null.

3. "getting_around" — Practical but warm transport info (car, uber, walking, public transit). If not found, return null.

4. "things_to_know" — Important practical details: WiFi, power/load shedding, check-in quirks, safety tips, digital nomad amenities. One item per line. If not found, return null.

5. "key_highlights" — Array of 4-8 punchy highlight phrases like "Fibre WiFi", "Rooftop Pool", "100m to Beach", "Mountain Views", "Self Check-in". The most compelling, bookable features. If not found, return empty array.
${brandInstruction}

Return ONLY valid JSON with these 5 keys. No markdown formatting, no code blocks.

WEBSITE CONTENT:
${content.substring(0, 8000)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI extraction failed:", aiResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: "AI extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices?.[0]?.message?.content || aiData.content || "";

    let extracted: Record<string, any>;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    } catch (e) {
      console.error("Failed to parse AI response:", aiText.substring(0, 500));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse extracted content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge — always overwrite when force_overwrite or when triggered manually (force_overwrite defaults false but UI sends true)
    const currentAmenities = (property.amenities as Record<string, any>) || {};
    const updates: Record<string, any> = {};
    const fieldsUpdated: string[] = [];

    for (const field of EDITORIAL_FIELDS) {
      const value = extracted[field];
      if (!value || (Array.isArray(value) && value.length === 0)) continue;

      const existing = currentAmenities[field];
      const hasExisting = existing && (typeof existing === 'string' ? existing.trim().length > 0 : Array.isArray(existing) && existing.length > 0);

      if (!hasExisting || force_overwrite) {
        updates[field] = value;
        fieldsUpdated.push(field);
      }
    }

    if (fieldsUpdated.length === 0) {
      await supabase.from("sync_logs").insert({
        property_id,
        sync_type: "content_enrichment",
        status: "completed",
        details: { message: "No new fields to update", extracted_fields: Object.keys(extracted).filter(k => extracted[k]) },
      });

      return new Response(
        JSON.stringify({ success: true, message: "No new content to add — all fields already populated", fields_found: Object.keys(extracted).filter(k => extracted[k]) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mergedAmenities = { ...currentAmenities, ...updates };
    const { error: updateError } = await supabase
      .from("properties")
      .update({ amenities: mergedAmenities })
      .eq("id", property_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save enriched content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("sync_logs").insert({
      property_id,
      sync_type: "content_enrichment",
      status: "completed",
      details: { fields_updated: fieldsUpdated, source_url: website_url, brand_voice_used: !!brandVoice },
    });

    console.log("Enrichment complete:", fieldsUpdated.join(", "), "brand_voice:", !!brandVoice);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Enriched ${fieldsUpdated.length} fields`,
        fields_updated: fieldsUpdated,
        brand_voice_used: !!brandVoice,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enrichment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
