import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERIC_SYSTEM_PROMPT = `You are TOBI, the friendly guide built into Rooms Online (ROL) - a luxury accommodation booking platform.
Your personality is helpful, warm, and occasionally playful with subtle cat references. You are part of the system itself, not a separate tool.

Guidelines:
- Answer questions based on the help documentation provided below
- If you're unsure or the documentation doesn't cover a topic, suggest the user contact support@roomsonline.co.za
- Keep responses concise but complete (2-4 sentences unless more detail is needed)
- Suggest relevant help articles when appropriate using format: "📖 See: [Article Title]"
- Use a friendly, professional tone
- You can use emoji sparingly (1-2 per response max, cat-themed when appropriate 🐱)
- Never make up features or capabilities not in the documentation
- If asked about technical details you don't know, be honest and redirect to support
- Never refer to yourself as an AI, chatbot, or language model - you are simply TOBI, the ROL guide

Remember: You're the platform's built-in guide helping users navigate ROL efficiently!`;

const PMS_SYSTEM_PROMPT = `You are TOBI, the property-specific assistant embedded in the ROL'OS Property Management System.
You are currently helping manage a SPECIFIC PROPERTY. You have access to real data about this property below.

Your role:
- Help the user navigate the ROL'OS PMS interface efficiently
- Answer questions about THIS property's room types, rates, bookings, and configuration
- Guide users through common PMS tasks: managing rooms, setting rates, handling bookings, housekeeping
- Suggest where to navigate for specific tasks (always use the exact page names below)

NAVIGATION GUIDE (use these exact names):
- "Dashboard" (/pms) - Overview of occupancy, arrivals, departures, revenue
- "Rooms" (/pms/rooms) - Physical room inventory and status management
- "Room Types" (/pms/room-types) - Room categories synced with Property Overview
- "Rate Plans" (/pms/rate-plans) - Pricing plans and minimum stay rules
- "Guests" (/pms/guests) - Guest profiles and CRM
- "Housekeeping" (/pms/housekeeping) - Task board for cleaning and maintenance
- "Branding" (/pms/branding) - White-label identity settings
- "Integrations" (/pms/integrations) - Website widgets and booking links

COMMON TASKS:
- Add a room → "Go to Rooms and click 'Add Room'"
- Change room status → "In Rooms, use the status dropdown on any room card"
- Create rate plan → "Go to Rate Plans and click 'New Rate Plan'"
- View today's arrivals → "Check the Dashboard, arrivals are in the Today section"
- Update property branding → "Go to Branding to customize logo and colors"

Guidelines:
- Be specific to THIS property using the data provided below
- When referring to room types or rates, use the actual names from the property data
- Keep responses short and actionable (1-3 sentences)
- Include navigation hints like "Head to [Page Name] to do this"
- Use cat emoji sparingly 🐱
- Never make up data - only reference what's in the property context below
- You ARE the PMS assistant - speak as if you're part of the system`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userRole, pmsContext } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let contextContent = "";
    let systemPrompt = GENERIC_SYSTEM_PROMPT;

    // PMS MODE: Fetch property-specific data
    if (pmsContext?.propertyId) {
      systemPrompt = PMS_SYSTEM_PROMPT;
      
      const propertyId = pmsContext.propertyId;

      // Fetch property basics
      const { data: property } = await supabase
        .from("properties")
        .select("id, name, city, country, property_type, owner_email")
        .eq("id", propertyId)
        .single();

      // Fetch room types
      const { data: roomTypes } = await supabase
        .from("rolos_room_types")
        .select("id, name, max_occupancy, default_rate, is_active")
        .eq("property_id", propertyId)
        .eq("is_active", true);

      // Fetch physical rooms
      const { data: rooms } = await supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, status, floor")
        .eq("property_id", propertyId)
        .limit(50);

      // Fetch rate plans
      const { data: ratePlans } = await supabase
        .from("rolos_rate_plans")
        .select("id, name, code, min_stay, is_active")
        .eq("property_id", propertyId);

      // Fetch recent bookings (last 10)
      const { data: recentBookings } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in_date, check_out_date, status, total_price")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(10);

      // Fetch today's arrivals and departures
      const today = new Date().toISOString().split("T")[0];
      const { data: todayArrivals } = await supabase
        .from("bookings")
        .select("id, guest_name, status")
        .eq("property_id", propertyId)
        .eq("check_in_date", today)
        .in("status", ["confirmed", "pending"]);

      const { data: todayDepartures } = await supabase
        .from("bookings")
        .select("id, guest_name, status")
        .eq("property_id", propertyId)
        .eq("check_out_date", today)
        .in("status", ["confirmed", "checked_in"]);

      // Build property context
      contextContent = `\n\nPROPERTY DATA FOR: ${property?.name || 'Unknown Property'}\n`;
      contextContent += `Location: ${property?.city || ''}, ${property?.country || ''}\n`;
      contextContent += `Property Type: ${property?.property_type || 'Not specified'}\n\n`;

      if (roomTypes && roomTypes.length > 0) {
        contextContent += `ROOM TYPES (${roomTypes.length}):\n`;
        roomTypes.forEach((rt: any) => {
          contextContent += `- ${rt.name}: Max ${rt.max_occupancy} guests, Default rate R${rt.default_rate || 0}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "ROOM TYPES: None configured yet. Suggest going to Room Types or Property Overview.\n\n";
      }

      if (rooms && rooms.length > 0) {
        const statusCounts: Record<string, number> = {};
        rooms.forEach((r: any) => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        contextContent += `PHYSICAL ROOMS (${rooms.length} total):\n`;
        Object.entries(statusCounts).forEach(([status, count]) => {
          contextContent += `- ${status}: ${count} room${count !== 1 ? 's' : ''}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "PHYSICAL ROOMS: None configured yet. Suggest going to Rooms to add inventory.\n\n";
      }

      if (ratePlans && ratePlans.length > 0) {
        contextContent += `RATE PLANS (${ratePlans.length}):\n`;
        ratePlans.forEach((rp: any) => {
          contextContent += `- ${rp.name}${rp.code ? ` (${rp.code})` : ''}: Min stay ${rp.min_stay}n, ${rp.is_active ? 'Active' : 'Inactive'}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "RATE PLANS: None configured yet. Suggest going to Rate Plans to create one.\n\n";
      }

      contextContent += `TODAY (${today}):\n`;
      contextContent += `- Arrivals: ${todayArrivals?.length || 0}${todayArrivals && todayArrivals.length > 0 ? ` (${todayArrivals.map((a: any) => a.guest_name).join(', ')})` : ''}\n`;
      contextContent += `- Departures: ${todayDepartures?.length || 0}${todayDepartures && todayDepartures.length > 0 ? ` (${todayDepartures.map((d: any) => d.guest_name).join(', ')})` : ''}\n\n`;

      if (recentBookings && recentBookings.length > 0) {
        contextContent += `RECENT BOOKINGS (last ${recentBookings.length}):\n`;
        recentBookings.forEach((b: any) => {
          contextContent += `- ${b.guest_name}: ${b.check_in_date} to ${b.check_out_date}, ${b.status}, R${b.total_price}\n`;
        });
      }
    } else {
      // Generic mode: fetch help articles
      let query = supabase
        .from("help_articles")
        .select("title, section, content_markdown, slug")
        .eq("is_published", true)
        .order("section")
        .limit(50);

      if (userRole && !["admin", "dev"].includes(userRole)) {
        query = query.or(`role_target.cs.{${userRole}},role_target.cs.{all}`);
      }

      const { data: articles } = await query;

      contextContent = "\n\nHELP DOCUMENTATION:\n\n";
      if (articles && articles.length > 0) {
        for (const article of articles) {
          contextContent += `## ${article.title} (Section: ${article.section})\n`;
          contextContent += `${article.content_markdown.substring(0, 800)}...\n\n`;
        }
      } else {
        contextContent += "No help articles available.\n";
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: `${systemPrompt}${contextContent}` 
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm getting a lot of questions right now! 🐱 Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "TOBI needs a little rest. Please try again later or contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Something went wrong. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("help-assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
