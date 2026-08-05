import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_MODELS } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TOBI install-instruction writer.
 *
 * This function no longer builds embed snippets or preview URLs — the integration
 * tabs (Smart Book Button, Direct Link, Widget, Booking Bar, Full Embed, WordPress,
 * Elementor, Portfolio) generate those client-side with the correct white-label host
 * and portfolio target. The caller passes the snippet it is showing the owner and
 * gets back plain-language install steps for it.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claims?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const propertyId: string | undefined = body?.property_id;
    const integrationType: string | undefined = body?.integration_type;
    const snippet: string | undefined = body?.snippet;

    if (!propertyId || !integrationType || !snippet) {
      return json({ error: "property_id, integration_type and snippet are required" }, 400);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: property, error: propError } = await adminClient
      .from("properties")
      .select("id, name, city, country, address")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      console.error("generate-integration-assets property lookup failed", propError);
      return json(
        {
          error: propError?.message
            ? `Could not load property: ${propError.message}`
            : "Property not found",
        },
        propError ? 500 : 404,
      );
    }

    // `properties` has no single `location` column — compose one from what exists.
    const propertyLocation =
      [property.city, property.country].filter((part) => Boolean(part)).join(", ") ||
      property.address ||
      "";

    let instructions = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_MODELS.integration_assets,
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful web developer assistant. Write clear, concise installation instructions for property owners who may not be technical. Use numbered steps. Keep it under 150 words. Do not use markdown headers.",
              },
              {
                role: "user",
                content: `Write installation instructions for a "${integrationType}" booking integration for the property "${property.name}". The embed code is: ${snippet}. The property is located at ${propertyLocation || "their location"}. Make the instructions friendly and specific to their property name.`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          instructions = aiData.choices?.[0]?.message?.content || "";
        } else {
          console.error("AI instruction generation returned", aiResponse.status, await aiResponse.text());
        }
      } catch (e) {
        console.error("AI instruction generation failed:", e);
      }
    }

    if (!instructions) {
      const fallbackInstructions: Record<string, string> = {
        direct: `1. Copy the booking link above.\n2. Add it to any "Book Now" button on your website.\n3. Guests clicking the link go straight to ${property.name}'s booking page.\n4. All bookings are automatically tracked.`,
        widget: `1. Copy the code above.\n2. Paste it into your website where you want the booking widget to appear.\n3. The widget displays with ${property.name}'s branding.\n4. Guests can check availability without leaving your site.`,
        booking_bar: `1. Copy the code snippet.\n2. Paste it just before </body> in your website's HTML.\n3. A booking bar appears fixed at the bottom of every page.\n4. Guests can start a booking from any page.`,
        full_embed: `1. Create a dedicated "Book" or "Reservations" page on your website.\n2. Paste the iframe code into the page body.\n3. The complete ${property.name} booking engine appears inline.\n4. Adjust the min-height to fit your layout.`,
        wordpress: `1. Install and activate the ROL'OS WordPress plugin.\n2. Edit the page where bookings should appear.\n3. Paste the shortcode above into the content.\n4. Publish and test the booking flow.`,
        elementor: `1. Edit your page in Elementor.\n2. Drag in a Shortcode widget.\n3. Paste the shortcode above into it.\n4. Update the page and test the booking flow.`,
        portfolio: `1. Copy the code above.\n2. Paste it into the page that should list your portfolio.\n3. Guests can browse every property and book from one place.\n4. Publish and test the booking flow.`,
      };
      instructions =
        fallbackInstructions[integrationType] ||
        "Copy the code snippet above and paste it into your website where the booking option should appear.";
    }

    return json({ instructions, integration_type: integrationType, property_id: property.id });
  } catch (error) {
    console.error("generate-integration-assets error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
