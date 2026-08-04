import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_MODELS } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { property_id, integration_type } = body;

    if (!property_id || !integration_type) {
      return new Response(JSON.stringify({ error: "property_id and integration_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch property details
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: property, error: propError } = await adminClient
      .from("properties")
      .select("id, name, slug, brand_primary_color, brand_logo_url, location, description")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = "https://book.sleepinafrica.roomsonline.co.za";
    const embedBase = `${baseUrl}/embed/property/${property.slug}`;
    const primaryColor = property.brand_primary_color || "#e91e63";

    // Generate snippet based on type
    let snippet = "";
    let previewUrl = "";

    switch (integration_type) {
      case "direct": {
        const url = `${baseUrl}/property/${property.slug}?source=website&integration=direct&property_id=${property.id}`;
        snippet = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:${primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Book Now</a>`;
        previewUrl = url;
        break;
      }
      case "widget": {
        const url = `${embedBase}?integration=widget&property_id=${property.id}`;
        snippet = `<div id="rolos-booking-widget" style="width:100%;max-width:480px;"><iframe src="${url}" style="width:100%;height:520px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);" title="Book ${property.name}" loading="lazy" allow="payment"></iframe></div>`;
        previewUrl = url;
        break;
      }
      case "booking_bar": {
        const bookingBarUrl = `${baseUrl}/booking/${property.slug}?source=website&integration=booking_bar&property_id=${property.id}&brand_color=${encodeURIComponent(primaryColor)}`;
        snippet = `<!-- RoomsOnline Floating Booking Bar -->
<div id="rolos-booking-bar" style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:${primaryColor};box-shadow:0 -2px 12px rgba(0,0,0,0.15);padding:12px 20px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;font-family:system-ui,-apple-system,sans-serif;">
  <label style="color:#fff;font-size:14px;font-weight:500;">Check-in<input type="date" id="rolos-checkin" style="margin-left:6px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" /></label>
  <label style="color:#fff;font-size:14px;font-weight:500;">Check-out<input type="date" id="rolos-checkout" style="margin-left:6px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" /></label>
  <button onclick="(function(){var ci=document.getElementById('rolos-checkin').value;var co=document.getElementById('rolos-checkout').value;var url='${bookingBarUrl}';if(ci)url+='&checkin='+ci;if(co)url+='&checkout='+co;window.open(url,'_blank');})()" style="background:#fff;color:${primaryColor};border:none;padding:10px 24px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Book Now</button>
</div>
<script>(function(){var t=new Date().toISOString().split('T')[0];document.getElementById('rolos-checkin').setAttribute('min',t);document.getElementById('rolos-checkout').setAttribute('min',t);})()</script>`;
        previewUrl = bookingBarUrl;
        break;
      }
      case "full_embed": {
        const url = `${embedBase}?integration=full_embed&property_id=${property.id}&mode=full`;
        snippet = `<iframe src="${url}" style="width:100%;min-height:800px;border:none;border-radius:8px;" title="${property.name} Booking Engine" loading="lazy" allow="payment"></iframe>`;
        previewUrl = url;
        break;
      }
      case "wordpress": {
        snippet = `[rolos_booking property="${property.slug}" property_id="${property.id}"]`;
        previewUrl = `${embedBase}?integration=wordpress&property_id=${property.id}`;
        break;
      }
      default:
        snippet = `${baseUrl}/property/${property.slug}?source=website&integration=${integration_type}&property_id=${property.id}`;
        previewUrl = snippet;
    }

    // Generate AI-powered instructions
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
                content: "You are a helpful web developer assistant. Write clear, concise installation instructions for property owners who may not be technical. Use numbered steps. Keep it under 150 words. Do not use markdown headers.",
              },
              {
                role: "user",
                content: `Write installation instructions for a "${integration_type}" booking integration for the property "${property.name}". The embed code is: ${snippet}. The property is located at ${property.location || "their location"}. Make the instructions friendly and specific to their property name.`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          instructions = aiData.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("AI instruction generation failed:", e);
      }
    }

    // Fallback instructions if AI fails
    if (!instructions) {
      const fallbackInstructions: Record<string, string> = {
        direct: `1. Copy the booking URL above.\n2. Add it to any "Book Now" button on your website.\n3. Guests clicking the link will be taken directly to ${property.name}'s booking page.\n4. All bookings are automatically tracked.`,
        widget: `1. Copy the iframe code above.\n2. Paste it into your website where you want the booking widget to appear.\n3. The widget will display with ${property.name}'s branding.\n4. Guests can check availability without leaving your site.`,
        booking_bar: `1. Copy the code snippet.\n2. Paste it just before </body> in your website's HTML.\n3. A booking bar will appear fixed at the bottom of every page.\n4. Guests can quickly start their booking from any page.`,
        full_embed: `1. Create a dedicated "Book" or "Reservations" page on your website.\n2. Paste the iframe code into the page body.\n3. The complete ${property.name} booking engine will appear inline.\n4. Adjust the min-height to fit your layout.`,
        wordpress: `1. Save the plugin code as rolos-booking.php.\n2. Upload to wp-content/plugins/rolos-booking/ on your WordPress site.\n3. Activate the plugin under Plugins in WordPress admin.\n4. Add the shortcode to any page or post.`,
      };
      instructions = fallbackInstructions[integration_type] || "Copy the code snippet and paste it into your website.";
    }

    return new Response(JSON.stringify({
      snippet,
      instructions,
      preview_url: previewUrl,
      property: { name: property.name, slug: property.slug },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-integration-assets error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
