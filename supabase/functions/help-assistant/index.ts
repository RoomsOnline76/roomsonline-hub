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
- Answer questions about THIS property's rooms, rates, bookings, guests, channels, groups, events, finances, and staff
- Guide users through common PMS tasks with step-by-step instructions
- Provide operational insights based on the real-time data below
- Suggest where to navigate for specific tasks (always use the exact page names below)

NAVIGATION GUIDE — OPERATIONS:
- "Dashboard" (/pms) — Overview of occupancy, arrivals, departures, revenue, and the interactive 30-day calendar with restriction markers
- "Rooms" (/pms/rooms) — Physical room inventory: add/edit rooms, set status (available, occupied, maintenance, blocked), assign room types, manage floor plans
- "Guests" (/pms/guests) — Guest CRM: profiles with stay history, contact info, preferences, VIP flags, loyalty tiers, and communication log
- "Housekeeping" (/pms/housekeeping) — Task board for cleaning assignments, maintenance requests, room inspection checklists, and staff assignment

NAVIGATION GUIDE — REVENUE:
- "Rate Plans" (/pms/rate-plans) — Pricing strategies: base rates, seasonal pricing with day-of-week multipliers, minimum/maximum stay rules, and rate codes
- "Revenue Mgmt" (/pms/revenue) — Revenue management with 14-day demand forecasting and historical performance analysis (GBV, ADR, channel mix) for 30/60/90 day periods
- "Channels" (/pms/channels) — OTA Channel Manager: connect/disconnect Booking.com, Airbnb, Expedia, Google Hotels, etc. Manage rate parity, availability sync, and commission tracking
- "Groups" (/pms/groups) — Group & block bookings: create group reservations, manage rooming lists, track group billing, and handle allotments with cutoff dates
- "Events" (/pms/events) — Function spaces & event booking: manage venues/spaces, create event bookings with catering and setup requirements, track event revenue

NAVIGATION GUIDE — MANAGEMENT:
- "Portfolio" (/pms/portfolio) — Multi-property portfolio overview with aggregated KPIs across all managed properties
- "Night Audit" (/pms/night-audit) — Nightly audit controls: roll housekeeping, finalize occupancy, calculate ADR/RevPAR metrics, close folios. Runs automatically at 02:00 SAST
- "Messaging" (/pms/messaging) — Guest messaging: 7 auto-seeded email templates (booking confirmation, pre-arrival, check-in, check-out, payment request, cancellation, manual), message queue with scheduling, delivery log via Resend. Supports placeholders like {{guest_name}}, {{property_name}}, {{check_in}}
- "Reports" (/pms/reports) — Analytics: ADR, RevPAR, occupancy rates, revenue breakdown, channel performance, guest demographics, and financial summaries
- "Staff" (/pms/staff) — Staff management: invite team members, assign roles (General Manager, Front Desk, Housekeeping, Maintenance, Accountant, Auditor), manage shifts and schedules. Staff must change password on first login
- "Branding" (/pms/branding) — White-label identity: customize logo, primary/secondary/font colors, business stationery (VAT, tagline, favicon). Bidirectionally synced with Property Overview
- "Integrations" (/pms/integrations) — Website widgets, booking engine embeds, direct booking links, and third-party connections

COMMON TASKS:
- Add a room → "Go to **Rooms** and click 'Add Room'. Assign a room number, name, floor, and link it to a room type."
- Change room status → "In **Rooms**, use the status dropdown on any room card to toggle between available, occupied, maintenance, or blocked."
- Create rate plan → "Go to **Rate Plans** and click 'New Rate Plan'. Set a name, code, base multiplier, and minimum stay."
- Add seasonal pricing → "In **Rate Plans**, open a plan and add rate seasons with date ranges and day-of-week multipliers."
- View today's arrivals → "Check the **Dashboard** — today's arrivals and departures are shown at the top with guest names."
- Connect an OTA → "Go to **Channels**, find the OTA card, and click 'Connect'. Enter your property ID and credentials."
- Create a group booking → "Go to **Groups** and click 'New Group'. Set group name, dates, allotted rooms, and cutoff date."
- Book an event space → "Go to **Events**, select a function space, and create a booking with date, setup style, and catering requirements."
- Invite a staff member → "Go to **Staff** and click 'Invite'. Enter their email and select a role — they'll get access based on their role permissions."
- Check financial reports → "Go to **Reports** for ADR, RevPAR, occupancy, and channel revenue breakdowns."
- Check revenue forecasts → "Go to **Revenue Mgmt** for 14-day demand forecasting and historical performance data."
- Update branding → "Go to **Branding** to set your logo, primary color, secondary color, and font color. Changes sync to the Property Overview automatically."
- Manage housekeeping → "Go to **Housekeeping** to view the task board, assign rooms to staff, and track cleaning status."
- Send a guest message → "Go to **Messaging** to manage email templates, queue messages, or send a manual message. Templates support placeholders like {{guest_name}}."
- Run night audit → "Go to **Night Audit** to manually trigger the nightly audit or view past audit logs. It runs automatically at 02:00 SAST."
- Record a payment → "Payments are tracked per folio. Each guest's charges and payments flow through the folio system."
- Check guest history → "Go to **Guests** and search by name or email. Their profile shows all past stays, preferences, and total spend."

ROLE-BASED ACCESS (for context when users ask about permissions):
- Property Owner / General Manager: Full access to all modules
- Front Desk: Operations + read-only rooms/housekeeping + guests. No access to rates, reports, branding, integrations, or staff
- Housekeeping: Housekeeping board + read-only rooms. No other access
- Maintenance: Read-only housekeeping only
- Accountant: Reports + read-only guests and groups. No operational access
- Auditor: Read-only access to all modules except integrations and staff

FINANCIAL CONCEPTS:
- Folios track all charges and payments per guest stay
- Rate seasons allow date-range pricing with day-of-week multipliers (Mon-Sun)
- Commission tracking per OTA channel (percentage-based)
- Group billing can be master-folio (one bill) or individual (per room)

Guidelines:
- Be specific to THIS property using the data provided below
- When referring to room types, rates, or rooms, use the actual names from the property data
- Keep responses short and actionable (1-3 sentences for simple questions, more for walkthroughs)
- Include navigation hints like "Head to **[Page Name]** to do this"
- If asked "what's happening today", summarize arrivals, departures, and occupancy from the data
- If asked about revenue, reference rate plans and recent booking totals
- Use cat emoji sparingly 🐱
- Never make up data — only reference what's in the property context below
- You ARE the PMS assistant — speak as if you're part of the system`;

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
      const today = new Date().toISOString().split("T")[0];

      // Parallel fetch all property data
      const [
        propertyRes,
        roomTypesRes,
        roomsRes,
        ratePlansRes,
        recentBookingsRes,
        todayArrivalsRes,
        todayDeparturesRes,
        guestCountRes,
        channelsRes,
        groupsRes,
        eventsRes,
        staffRes,
        housekeepingRes,
      ] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, city, country, property_type, owner_email")
          .eq("id", propertyId)
          .single(),
        supabase
          .from("rolos_room_types")
          .select("id, name, max_occupancy, default_rate, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true),
        supabase
          .from("rolos_rooms")
          .select("id, room_number, room_name, status, floor")
          .eq("property_id", propertyId)
          .limit(100),
        supabase
          .from("rolos_rate_plans")
          .select("id, name, code, min_stay, is_active")
          .eq("property_id", propertyId),
        supabase
          .from("bookings")
          .select("id, guest_name, check_in_date, check_out_date, status, total_price")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("bookings")
          .select("id, guest_name, status")
          .eq("property_id", propertyId)
          .eq("check_in_date", today)
          .in("status", ["confirmed", "pending"]),
        supabase
          .from("bookings")
          .select("id, guest_name, status")
          .eq("property_id", propertyId)
          .eq("check_out_date", today)
          .in("status", ["confirmed", "checked_in"]),
        supabase
          .from("rolos_guest_profiles")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId),
        supabase
          .from("rolos_channel_connections")
          .select("id, channel_name, is_active, last_sync_at")
          .eq("property_id", propertyId),
        supabase
          .from("rolos_groups")
          .select("id, name, status, arrival_date, departure_date, total_rooms")
          .eq("property_id", propertyId)
          .in("status", ["tentative", "confirmed"])
          .order("arrival_date", { ascending: true })
          .limit(5),
        supabase
          .from("rolos_events")
          .select("id, name, status, event_date, event_type")
          .eq("property_id", propertyId)
          .gte("event_date", today)
          .order("event_date", { ascending: true })
          .limit(5),
        supabase
          .from("rolos_pms_staff")
          .select("id, display_name, role, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true),
        supabase
          .from("rolos_housekeeping_tasks")
          .select("id, status, priority")
          .eq("property_id", propertyId)
          .eq("task_date", today),
      ]);

      const property = propertyRes.data;
      const roomTypes = roomTypesRes.data;
      const rooms = roomsRes.data;
      const ratePlans = ratePlansRes.data;
      const recentBookings = recentBookingsRes.data;
      const todayArrivals = todayArrivalsRes.data;
      const todayDepartures = todayDeparturesRes.data;
      const guestCount = guestCountRes.count || 0;
      const channels = channelsRes.data;
      const groups = groupsRes.data;
      const events = eventsRes.data;
      const staff = staffRes.data;
      const housekeepingTasks = housekeepingRes.data;

      // Build property context
      contextContent = `\n\n--- PROPERTY DATA: ${property?.name || 'Unknown Property'} ---\n`;
      contextContent += `Location: ${property?.city || ''}, ${property?.country || ''}\n`;
      contextContent += `Type: ${property?.property_type || 'Not specified'}\n\n`;

      // Room types
      if (roomTypes && roomTypes.length > 0) {
        contextContent += `ROOM TYPES (${roomTypes.length}):\n`;
        roomTypes.forEach((rt: any) => {
          contextContent += `- ${rt.name}: Max ${rt.max_occupancy} guests, Default rate R${rt.default_rate || 0}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "ROOM TYPES: None configured yet. Suggest going to Rooms to set up inventory.\n\n";
      }

      // Physical rooms
      if (rooms && rooms.length > 0) {
        const statusCounts: Record<string, number> = {};
        rooms.forEach((r: any) => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        contextContent += `PHYSICAL ROOMS (${rooms.length} total):\n`;
        Object.entries(statusCounts).forEach(([status, count]) => {
          contextContent += `- ${status}: ${count} room${count !== 1 ? 's' : ''}\n`;
        });
        const availableRooms = statusCounts["available"] || 0;
        const occupiedRooms = statusCounts["occupied"] || 0;
        const totalRooms = rooms.length;
        if (totalRooms > 0) {
          contextContent += `- Occupancy: ${Math.round((occupiedRooms / totalRooms) * 100)}% (${occupiedRooms}/${totalRooms})\n`;
        }
        contextContent += "\n";
      } else {
        contextContent += "PHYSICAL ROOMS: None configured yet. Suggest going to Rooms to add inventory.\n\n";
      }

      // Rate plans
      if (ratePlans && ratePlans.length > 0) {
        contextContent += `RATE PLANS (${ratePlans.length}):\n`;
        ratePlans.forEach((rp: any) => {
          contextContent += `- ${rp.name}${rp.code ? ` (${rp.code})` : ''}: Min stay ${rp.min_stay}n, ${rp.is_active ? 'Active' : 'Inactive'}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "RATE PLANS: None configured. Suggest going to Rate Plans to create pricing.\n\n";
      }

      // Today's operations
      contextContent += `TODAY (${today}):\n`;
      contextContent += `- Arrivals: ${todayArrivals?.length || 0}${todayArrivals && todayArrivals.length > 0 ? ` (${todayArrivals.map((a: any) => a.guest_name).join(', ')})` : ''}\n`;
      contextContent += `- Departures: ${todayDepartures?.length || 0}${todayDepartures && todayDepartures.length > 0 ? ` (${todayDepartures.map((d: any) => d.guest_name).join(', ')})` : ''}\n`;

      // Housekeeping
      if (housekeepingTasks && housekeepingTasks.length > 0) {
        const hkStatus: Record<string, number> = {};
        housekeepingTasks.forEach((t: any) => {
          hkStatus[t.status] = (hkStatus[t.status] || 0) + 1;
        });
        contextContent += `- Housekeeping tasks: ${housekeepingTasks.length} total (${Object.entries(hkStatus).map(([s, c]) => `${c} ${s}`).join(', ')})\n`;
      }
      contextContent += "\n";

      // Guest CRM
      contextContent += `GUEST DATABASE: ${guestCount} profiles on file\n\n`;

      // Channels
      if (channels && channels.length > 0) {
        contextContent += `CHANNEL CONNECTIONS (${channels.length}):\n`;
        channels.forEach((ch: any) => {
          contextContent += `- ${ch.channel_name}: ${ch.is_active ? 'Active' : 'Inactive'}${ch.last_sync_at ? `, last synced ${ch.last_sync_at}` : ''}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "CHANNELS: No OTA connections yet. Suggest going to Channels to connect distribution partners.\n\n";
      }

      // Groups
      if (groups && groups.length > 0) {
        contextContent += `UPCOMING GROUPS (${groups.length}):\n`;
        groups.forEach((g: any) => {
          contextContent += `- ${g.name}: ${g.arrival_date} to ${g.departure_date}, ${g.total_rooms} rooms, Status: ${g.status}\n`;
        });
        contextContent += "\n";
      }

      // Events
      if (events && events.length > 0) {
        contextContent += `UPCOMING EVENTS (${events.length}):\n`;
        events.forEach((e: any) => {
          contextContent += `- ${e.name}: ${e.event_date}, Type: ${e.event_type || 'General'}, Status: ${e.status}\n`;
        });
        contextContent += "\n";
      }

      // Staff
      if (staff && staff.length > 0) {
        contextContent += `ACTIVE STAFF (${staff.length}):\n`;
        staff.forEach((s: any) => {
          contextContent += `- ${s.display_name}: ${s.role}\n`;
        });
        contextContent += "\n";
      }

      // Recent bookings
      if (recentBookings && recentBookings.length > 0) {
        contextContent += `RECENT BOOKINGS (last ${recentBookings.length}):\n`;
        recentBookings.forEach((b: any) => {
          contextContent += `- ${b.guest_name}: ${b.check_in_date} → ${b.check_out_date}, ${b.status}, R${b.total_price}\n`;
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
