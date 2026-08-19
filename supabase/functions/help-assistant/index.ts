import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_MODELS, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Shared knowledge: the free owner-level HubSpot CRM add-on and the native
// guest-intelligence features it projects. Appended to the generic and PMS prompts.
const HUBSPOT_KNOWLEDGE = `

HUBSPOT CRM ADD-ON (free, optional, owner-level):
- ROL'OS has a full native guest CRM. HubSpot is an OPTIONAL projection on top of it — every CRM feature keeps working with HubSpot switched off. Never present HubSpot as required.
- It is free and opt-in per owner, and it covers that owner's whole portfolio. There is no extra fee, tier or upsell for it.
- Connecting: Owner Account → the HubSpot card → paste a HubSpot private-app token → "Test connection" → save. The same card also appears in the property go-live workspace. Only the owner can connect or disconnect.
- The token is verified against HubSpot before it is stored, kept encrypted server-side, owner-scoped, and can be revoked by disconnecting at any time. It is never shown again after saving.
- What ROL'OS projects into HubSpot:
  • Guests → contacts, with stay history, lifetime spend, last stay date and preferences
  • Trade partners / agents → companies
  • Bookings → deals, with stage following the booking's real status
  • Website and portal enquiries → an enquiry pipeline (New → ... → Lost)
- Sync behaviour: one-way, ROL'OS → HubSpot. A delta sweep runs every 15 minutes; new, modified and cancelled bookings and enquiry status changes are pushed as they happen. Nothing written in HubSpot flows back into ROL'OS.
- Segmentation is first-class and native: Trade vs Direct, plus repeat and lapsed flags. Trade/Direct badges show on the **Guests** page and on inquiries, and the same flags travel to HubSpot.
- Related native features that also project: the **Inquiries** pipeline (/pms/inquiries), website enquiry intake, digital check-in (tokenised guest link or staff-side form) and post-departure feedback.
- Troubleshooting:
  - "Test connection" fails → the token is invalid, expired or was revoked in HubSpot. Create a fresh private-app token and reconnect.
  - Connection saved but records rejected for scopes → the private app needs contacts, companies and deals access; recreate the token with those scopes.
  - Nothing in HubSpot yet → the sweep runs every 15 minutes; give it one cycle, then re-check.
  - Disconnecting stops all future pushes and leaves records already in HubSpot untouched.
- Never claim two-way sync, HubSpot-side writes into ROL'OS, or a paid HubSpot tier from ROL'OS. If asked for exact scope names or HubSpot property mappings beyond the above, point to the "HubSpot CRM — free owner add-on" help article instead of guessing.`;

const HUBSPOT_ONBOARDING_NOTE = `

HUBSPOT STEP: The HubSpot CRM card in the workspace is free and entirely optional. It never blocks go-live and is not a Channel or website gate — if it is unconnected, tell them to move on.`;


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

CONTRACT MANAGEMENT (Admin Feature):
- Owner contracts are managed from the Admin panel under property settings
- When sending a contract, the system automatically includes ALL properties linked to that owner's email address in a single contract
- Multi-property contracts are fully supported — one contract covers all of an owner's properties
- Two contract types available: "Standard Listing Agreement" and "ROL'OS PMS Partnership Agreement"
- Contract statuses: draft → sent → viewed → signed (or declined/overridden)
- Admins can override the contract requirement with a reason
- Admins can resend contracts if needed
- Signed contracts are permanently accessible via the signing token
- Contract notifications go to the owner and the admin team (carike@roomsonline.co.za)

BILLING & FINANCE (Admin/Dev Feature):
- ROL supports 7 billing strategies: Default (commission-based), Widget, SaaS (subscription), Portfolio, Enterprise, Volume-Tiered, Payment Facilitator
- Global billing defaults are managed at /admin/billing-defaults — sets platform-wide rates per strategy
- Per-property overrides are set in the property's Billing tab — negotiated rates that override global defaults
- Resolution order: Property Override → Global Default → Hardcoded Fallback (10% commission)
- White-label branding has an optional monthly fee, configured per strategy or per property
- All billing events are logged to an immutable billing_transactions ledger
- Monthly invoices are auto-generated for property owners

SALES REP COMMISSION MODULE:
- Sales reps are managed at /admin/sales-reps — registry with tier assignments
- 3 commission tiers: Base (20% first-year, 5% residual), Accelerated (25%/7.5%), Elite (30%/10%)
- Commissions calculated on platform revenue (ROL's income from the property, not booking revenue)
- Property referrals are assigned in the property's Billing tab (Referral section)
- Lead sources tracked: cold call, referral, event, inbound, partner, social media, existing client, other
- Monthly commission calculation runs automatically on the 28th
- Reports appear at /admin/commission-reports for Fearless Leader approval
- 90-day clawback: if a property churns within 90 days, commissions are reversed
- Commission defaults (first-year rate, residual rate, duration, clawback days) are set in /admin/billing-defaults

VOUCHER / PROMO CODES:
- Property owners can create promotional voucher codes in the property form under Specials → Vouchers tab
- Two discount types: Percentage (e.g. 15% off) and Fixed amount (e.g. R500 off)
- Vouchers can have: usage limits (max redemptions), expiry dates, minimum night requirements, and non-refundable conditions
- During booking checkout, guests enter a voucher code which is validated server-side via the validate-voucher edge function
- Valid vouchers appear as a negative line item in the booking cost breakdown
- Non-refundable vouchers display a warning to the guest before confirmation
- Voucher usage is tracked automatically; expired or maxed-out codes are rejected

ROOM-LEVEL CHARGES:
- Additional charges (taxes, fees, deposits, surcharges) are managed in the property form under Rates → Additional Charges
- Charges support three calculation methods: Flat fee, Per night, Percentage of room rate
- Each charge can apply to ALL rooms or be scoped to specific room types via the "Applies to All Rooms" toggle
- Room-specific charges can have per-room amount overrides (e.g. Studio cleaning fee = R250, Suite cleaning fee = R450)
- The booking engine automatically calculates applicable charges based on the booked room type
- "Copy Charges" lets owners duplicate charges to other properties with Smart Copy — room assignments are matched by name (case-insensitive), not UUID

COPY BRANDING:
- The "Copy Branding" button in the property form's Branding tab lets owners sync visual identity to other properties
- Copies: logo URL, primary colour, secondary colour, font colour, and brand override toggle
- Works the same way as Copy Charges — select target properties and apply

PROPERTY ACTIVATION / QUALITY GATE:
- Before a property goes live, the Quality Gate checks activation readiness via the check-activation-readiness edge function
- Checks include: room types configured, rates set, branding complete, contact info filled, owner contract signed
- Results show Blockers (must fix) and Warnings (recommended) before activation
- Properties cannot be activated with unresolved blockers

INTEGRATIONS TOOLKIT:
- Properties can be embedded on websites using 9 integration methods:
  1. Direct Link — simple URL to the booking page
  2. Widget — floating booking widget overlay
  3. Booking Bar — horizontal search bar embed
  4. Full Embed — iframe of the full booking engine
  5. Smart Button — context-aware booking button
  6. WordPress Plugin — Gutenberg blocks with WP admin dashboard
  7. Elementor Widget — drag-and-drop Elementor integration
  8. API — REST API access for custom integrations
  9. Portfolio — multi-property booking page
- Configuration is managed in the property form's Integrations tab

ITINERARY / JOURNEY BUILDER:
- Multi-property trip planning tool accessible from the booking engine
- Guests can build multi-stop itineraries across different properties
- Features: interactive map, timeline view, PDF brochure generation
- Itineraries can include experience vouchers for local activities

PAYMENT GATEWAYS:
- Two supported gateways: PayFast (on-site modal payment) and PayGate (redirect to payment page)
- Both support dual environment (sandbox/production) for testing
- Payment configuration is set per property in the property form

STAFF LOGIN:
- Property staff access the PMS via branded login pages at /staff-login/:propertySlug
- Each property has a unique slug-based login URL with the property's branding

ADMIN NAVIGATION (grouped structure):
- Property Lifecycle: Properties, Property Pipeline, Contract Manager, Promotion
- People: Access Requests, Sales Reps, Owner Directory
- Finance: Billing Defaults, Commission Reports, Invoices, Financial Metrics
- System: Dev Tasks, Audit Logs, API Configurator, Knowledge Base, Billing Mappings

OWNER WORKSPACE:
- Calendar views: Accommodation Calendar, Event Calendar, Conference Calendar
- Property Pulse: operational health reports per property
- API Documentation viewer at /docs/api (OpenAPI spec)

Remember: You're the platform's built-in guide helping users navigate ROL efficiently!`;

const PMS_SYSTEM_PROMPT = `You are TOBI, the property-specific assistant embedded in the ROL'OS Property Management System.
You are currently helping manage a SPECIFIC PROPERTY. You have access to real data about this property below.

Your role:
- Help the user navigate the ROL'OS PMS interface efficiently
- Answer questions about THIS property's rooms, rates, bookings, guests, channels, groups, events, finances, and staff
- Guide users through common PMS tasks with step-by-step instructions
- Provide operational insights based on the real-time data below
- Suggest where to navigate for specific tasks (always use the exact page names below)

ACTION CAPABILITIES:
You can trigger real actions when the user asks. When you determine an action is needed, include an ACTION BLOCK in your response using this exact format:

\`\`\`action
{"type":"trigger_night_audit"}
\`\`\`

\`\`\`action
{"type":"occupancy_summary"}
\`\`\`

\`\`\`action
{"type":"todays_arrivals"}
\`\`\`

\`\`\`action
{"type":"revenue_snapshot"}
\`\`\`

Rules for actions:
- Only include ONE action block per response
- Include the action block AFTER your conversational text
- For "trigger night audit" requests, confirm with the user what will happen before including the action
- For data queries (occupancy, arrivals, revenue), include the action block immediately — the UI will render the results inline
- If the user asks to "run the night audit", "trigger audit", or similar → use trigger_night_audit
- If the user asks "what's my occupancy", "how full are we" → use occupancy_summary
- If the user asks "who's arriving today", "today's check-ins" → use todays_arrivals
- If the user asks "how's revenue", "revenue report", "financial snapshot" → use revenue_snapshot

NAVIGATION GUIDE — OPERATIONS:
- "Dashboard" (/pms) — Overview of occupancy, arrivals, departures, revenue, and the interactive 30-day calendar with restriction markers
- "Rooms" (/pms/rooms) — Physical room inventory: add/edit rooms, set status (available, occupied, maintenance, blocked), assign room types, manage floor plans
- "Guests" (/pms/guests) — Guest CRM: profiles with stay history, contact info, preferences, VIP flags, loyalty tiers, Trade/Direct badges, and communication log
- "Inquiries" (/pms/inquiries) — Native enquiry pipeline: website and portal leads from New through to Lost, Trade/Direct and repeat/lapsed segmentation, and "Convert to booking" handoff into a manual booking
- "Housekeeping" (/pms/housekeeping) — Task board for cleaning assignments, maintenance requests, room inspection checklists, and staff assignment

NAVIGATION GUIDE — REVENUE:
- "Rate Plans" (/pms/rate-plans) — Pricing strategies: base rates, seasonal pricing with day-of-week multipliers, minimum/maximum stay rules, and rate codes
- "Revenue Mgmt" (/pms/revenue) — Revenue management with 14-day demand forecasting and historical performance analysis (GBV, ADR, channel mix) for 30/60/90 day periods
- "Channels" (/pms/channels) — The ROL'OS Channel Manager: connect sales channels (Booking.com, Airbnb, Expedia, Google, and others), map rooms and rates, and keep availability and pricing in sync
- "Groups" (/pms/groups) — Group & block bookings: create group reservations, manage rooming lists, track group billing, and handle allotments with cutoff dates
- "Events" (/pms/events) — Function spaces & event booking: manage venues/spaces, create event bookings with catering and setup requirements, track event revenue

NAVIGATION GUIDE — MANAGEMENT:
- "Portfolio" (/pms/portfolio) — Multi-property portfolio overview with aggregated KPIs across all managed properties
- "Night Audit" (/pms/night-audit) — Nightly audit controls: roll housekeeping, finalize occupancy, calculate ADR/RevPAR metrics, close folios. Runs automatically at 02:00 SAST
- "Messaging" (/pms/messaging) — Guest messaging: 7 auto-seeded email templates (booking confirmation, pre-arrival, check-in, check-out, payment request, cancellation, manual), message queue with scheduling, delivery log via Resend
- "Reports" (/pms/reports) — Analytics: ADR, RevPAR, occupancy rates, revenue breakdown, channel performance, guest demographics, and financial summaries
- "Staff" (/pms/staff) — Staff management: invite team members, assign roles (General Manager, Front Desk, Housekeeping, Maintenance, Accountant, Auditor), manage shifts and schedules
- "Branding" (/pms/branding) — White-label identity: customize logo, primary/secondary/font colors, business stationery
- "Integrations" (/pms/integrations) — Website widgets, booking engine embeds, direct booking links, and third-party connections

COMMON TASKS:
- Add a room → "Go to **Rooms** and click 'Add Room'. Assign a room number, name, floor, and link it to a room type."
- Change room status → "In **Rooms**, use the status dropdown on any room card to toggle between available, occupied, maintenance, or blocked."
- Create rate plan → "Go to **Rate Plans** and click 'New Rate Plan'. Set a name, code, base multiplier, and minimum stay."
- View today's arrivals → "Check the **Dashboard** — today's arrivals and departures are shown at the top."
- Connect a sales channel → "Open **Channels**. The ROL'OS Channel Manager loads right in the page. Pick the channel you want from the channel list and click 'Connect', then follow the on-screen steps: 1) confirm the property the channel should sell, 2) map each ROL'OS room type to the matching room on the channel, 3) map your rate plans so pricing flows correctly, 4) switch availability sync on. Once mapping is complete, ROL'OS pushes rates and availability automatically and pulls new reservations back into your Dashboard and Bookings."
- Channel not connecting / mapping issues → "In **Channels**, reopen the channel card and check that every room type and rate plan has a mapped counterpart — unmapped rooms are the most common reason rates or availability don't appear. If the channel needs approval on their side, the card shows a pending status until they activate it. If the page shows that sign-in is being finalised, nothing is needed from you — TOBI completes it automatically."
- Stop selling on a channel → "In **Channels**, open the channel and either pause availability sync or disconnect it. Existing reservations already in ROL'OS are unaffected."
- Create a group booking → "Go to **Groups** and click 'New Group'. Set group name, dates, allotted rooms, and cutoff date."
- Invite a staff member → "Go to **Staff** and click 'Invite'. Enter their email and select a role."
- Run night audit → "Go to **Night Audit** to manually trigger the nightly audit or view past audit logs. It runs automatically at 02:00 SAST."

ROLE-BASED ACCESS (6 roles):
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
- Voucher/promo discounts appear as negative line items in booking cost breakdown
- Room-level charge overrides allow different amounts per room type (stored in room_charge_overrides JSONB)

VOUCHER MANAGEMENT (Property Form → Specials → Vouchers):
- Create promo codes with percentage or fixed discounts
- Set usage limits, expiry dates, minimum nights, non-refundable conditions
- Vouchers are validated server-side during booking checkout
- Usage tracking is automatic

ROOM-LEVEL CHARGES (Property Form → Rates → Additional Charges):
- Each charge can apply to all rooms or specific room types
- Per-room amount overrides for different rates by room type
- Three calculation methods: flat, per night, percentage

COPY TOOLS:
- Copy Charges: duplicates charges to other properties with Smart Copy (matches rooms by name, not UUID)
- Copy Branding: syncs logo, colours, brand override toggle to other properties

DEPOSIT SCHEDULES:
- Configure deposit collection rules per property
- Set deposit percentages and timing relative to check-in date

YIELD RULES / REVENUE MANAGEMENT:
- Revenue management engine at /pms/revenue with 14-day demand forecasting
- Historical performance analysis (GBV, ADR, channel mix) for 30/60/90 day periods
- Day-of-week rate multipliers in rate seasons

INVENTORY CALENDAR:
- Day-level availability grid management for room types
- Visual calendar showing open/closed/restricted dates
- Bulk update capabilities for date ranges

PMS BRANDING:
- White-label identity customization at /pms/branding
- Logo, primary/secondary/font colours with WCAG contrast checking
- Font readability preview with automatic fallback colour suggestions when contrast fails
- Business stationery customization

MESSAGE QUEUE:
- 7 auto-seeded email templates (booking confirmation, pre-arrival, check-in, check-out, payment request, cancellation, manual)
- Offset-hour scheduling for pre-arrival and post-checkout messages
- Delivery log via Resend integration

BILLING & FINANCE:
- Property billing is configured in the **Billing tab** of the property form
- Each property has a billing strategy (Default, Widget, SaaS, Portfolio, Enterprise, Volume-Tiered, Payment Facilitator)
- Rates follow 3-tier resolution: Property Override → Global Default → Hardcoded Fallback
- White-label branding incurs an additional monthly fee when enabled
- Global billing defaults are managed at /admin/billing-defaults (Fearless Leader/Dev only)
- All transactions logged to billing_transactions ledger; monthly owner_invoices auto-generated

SALES REP COMMISSIONS:
- Properties can be linked to a sales rep via the Referral section in the Billing tab
- Commission tiers: Base (20%/5%), Accelerated (25%/7.5%), Elite (30%/10%)
- Monthly calculation on the 28th generates reports at /admin/commission-reports
- 90-day clawback protection against early property churn
- Sales rep management: /admin/sales-reps

Guidelines:
- Be specific to THIS property using the data provided below
- When referring to room types, rates, or rooms, use the actual names from the property data
- Keep responses short and actionable (1-3 sentences for simple questions, more for walkthroughs)
- Include navigation hints like "Head to **[Page Name]** to do this"
- If asked "what's happening today", summarize arrivals, departures, and occupancy from the data
- If asked about revenue, reference rate plans and recent booking totals
- Use cat emoji sparingly 🐱
- Never make up data — only reference what's in the property context below
- You ARE the PMS assistant — speak as if you're part of the system

CONTRACTS:
- Owner contracts are managed from Admin → property settings. One contract automatically covers ALL properties linked to the owner's email.
- Two types: Standard Listing Agreement and ROL'OS PMS Partnership Agreement.
- Statuses: draft → sent → viewed → signed (or declined/overridden). Admins can override or resend.`;

const ONBOARDING_SYSTEM_PROMPT = `You are TOBI, the onboarding helper inside ROL'OS. You sit next to the wizard's own checklists and prompts — you do not replace them. You answer micro questions so the person can clear the current blocker and move on.

PRIORITY: Channel (RU) onboarding first. Website listing wizard second.

How you help:
- Read the live ONBOARDING STATE below. It is the source of truth for what is failing right now.
- Answer the exact question (why this check fails, what to type, where to click, what "unbound" means).
- Point at the same labels the wizard already shows. Quote the blocker text.
- One next action. Two to five short sentences unless they ask for a walkthrough.
- If a step is locked, say which earlier step must finish first.
- Never invent a Rentals United API, a field that is not on the screen, or a pass when the state says it failed.
- Never tell them to skip a mandatory Channel wizard gate.
- You are TOBI, not an AI model.

Channel wizard (12 macros, three stages):
1–5 Ready to sell — identity, location, rooms, photos, prices.
6–11 Published — push owner, key & secret, publish listing, currency, sub-account sign-off, enable Channel Manager.
12 Channels live — connect at least one sales channel.
An unbound property (no push owner, or no key & secret) cannot have publish, currency, sign-off, Channel Manager, or channels marked done. Leftover listing IDs are not a pass.
RU push/pull stays off until those gates pass. Dashboard bookings, cancels, mods and blockouts still save locally.

Website listing wizard:
Nine steps (identity, contact, location, policies, guest experience, facilities, rooms, media, plus venue extras). 70% is the list minimum. ROL Spec is editorial and is not this score.

When they need to open a field, end with exactly one action block:

\`\`\`action
{"type":"open_field","section":"SECTION","fieldKey":"FIELD_KEY","unit":"UNIT_OR_NULL"}
\`\`\`

Use section and fieldKey from the blocker in ONBOARDING STATE. Omit the action if you are only explaining.`;

// ===========================================================================
// Action Handlers — execute real operations server-side
// ===========================================================================
interface ActionResult {
  type: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

async function executeAction(
  actionType: string,
  propertyId: string,
  supabase: ReturnType<typeof createClient>,
  portfolioPropertyIds?: string[],
): Promise<ActionResult> {
  const today = new Date().toISOString().split("T")[0];
  const isPortfolio = !!(portfolioPropertyIds && portfolioPropertyIds.length > 1);
  const scopeIds = isPortfolio ? portfolioPropertyIds! : [propertyId];
  const scopeLabel = isPortfolio ? `portfolio (${scopeIds.length} properties)` : "property";

  switch (actionType) {
    case "trigger_night_audit": {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const results: Array<{ property_id: string; ok: boolean; error?: string }> = [];
      for (const pid of scopeIds) {
        const resp = await fetch(`${supabaseUrl}/functions/v1/pms-night-audit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ property_id: pid, trigger: "tobi_assistant" }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          results.push({ property_id: pid, ok: false, error: errText });
        } else {
          results.push({ property_id: pid, ok: true });
        }
      }
      return {
        type: actionType,
        success: results.every(r => r.ok),
        data: { scope: scopeLabel, results },
      };
    }

    case "occupancy_summary": {
      const { data: rooms } = await supabase
        .from("rolos_rooms")
        .select("id, status, property_id")
        .in("property_id", scopeIds);
      const total = rooms?.length || 0;
      const occupied = rooms?.filter((r: { status: string }) => r.status === "occupied").length || 0;
      const available = rooms?.filter((r: { status: string }) => r.status === "available").length || 0;
      const maintenance = rooms?.filter((r: { status: string }) => r.status === "maintenance").length || 0;
      const blocked = rooms?.filter((r: { status: string }) => r.status === "blocked").length || 0;
      return {
        type: actionType,
        success: true,
        data: {
          scope: scopeLabel,
          properties: scopeIds.length,
          total_rooms: total,
          occupied,
          available,
          maintenance,
          blocked,
          occupancy_percent: total > 0 ? Math.round((occupied / total) * 100) : 0,
          date: today,
        },
      };
    }

    case "todays_arrivals": {
      const { data: arrivals } = await supabase
        .from("bookings")
        .select("id, guest_name, guest_email, status, total_price, property_id")
        .in("property_id", scopeIds)
        .eq("check_in_date", today)
        .in("status", ["confirmed", "pending"]);
      const { data: departures } = await supabase
        .from("bookings")
        .select("id, guest_name, status, property_id")
        .in("property_id", scopeIds)
        .eq("check_out_date", today)
        .in("status", ["confirmed", "checked_in"]);
      return {
        type: actionType,
        success: true,
        data: {
          scope: scopeLabel,
          date: today,
          arrivals: (arrivals || []).map((a: { id: string; guest_name: string; status: string; total_price: number; property_id: string }) => ({
            id: a.id,
            guest_name: a.guest_name,
            status: a.status,
            total_price: a.total_price,
            property_id: a.property_id,
          })),
          departures: (departures || []).map((d: { id: string; guest_name: string; status: string; property_id: string }) => ({
            id: d.id,
            guest_name: d.guest_name,
            status: d.status,
            property_id: d.property_id,
          })),
          arrival_count: arrivals?.length || 0,
          departure_count: departures?.length || 0,
        },
      };
    }

    case "revenue_snapshot": {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, total_price, status, check_in_date, booking_channel, property_id")
        .in("property_id", scopeIds)
        .gte("check_in_date", thirtyDaysAgo)
        .in("status", ["confirmed", "checked_in", "checked_out"]);

      const totalRevenue = (bookings || []).reduce((s: number, b: { total_price: number }) => s + (b.total_price || 0), 0);
      const bookingCount = bookings?.length || 0;
      const avgBookingValue = bookingCount > 0 ? Math.round(totalRevenue / bookingCount) : 0;

      const channelMap: Record<string, number> = {};
      (bookings || []).forEach((b: { booking_channel: string | null; total_price: number }) => {
        const ch = b.booking_channel || "Direct";
        channelMap[ch] = (channelMap[ch] || 0) + (b.total_price || 0);
      });

      return {
        type: actionType,
        success: true,
        data: {
          scope: scopeLabel,
          period: "Last 30 days",
          total_revenue: totalRevenue,
          booking_count: bookingCount,
          avg_booking_value: avgBookingValue,
          channel_breakdown: channelMap,
        },
      };
    }

    default:
      return { type: actionType, success: false, error: `Unknown action: ${actionType}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userRole, pmsContext, onboardingContext, actionRequest } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // -----------------------------------------------------------------------
    // Direct action request (non-streaming) — returns JSON immediately
    // -----------------------------------------------------------------------
    if (actionRequest && pmsContext?.propertyId) {
      const result = await executeAction(
        actionRequest.type,
        pmsContext.propertyId,
        supabase,
        pmsContext.portfolioPropertyIds,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let contextContent = "";
    let systemPrompt = GENERIC_SYSTEM_PROMPT + HUBSPOT_KNOWLEDGE;

    if (onboardingContext && typeof onboardingContext === "object") {
      systemPrompt = ONBOARDING_SYSTEM_PROMPT + HUBSPOT_ONBOARDING_NOTE;
      const oc = onboardingContext as Record<string, unknown>;
      const blockers = Array.isArray(oc.blockers) ? oc.blockers : [];
      contextContent = `\n\n--- ONBOARDING STATE ---\n`;
      contextContent += `Wizard: ${oc.wizard === "website" ? "Website listing" : "Channel (RU) — PRIORITY"}\n`;
      contextContent += `Property: ${oc.propertyName || "Unknown"}\n`;
      if (oc.stage) contextContent += `Stage: ${oc.stage}\n`;
      contextContent += `Current step: ${oc.stepTitle || "Unknown"}`;
      if (oc.stepGoal) contextContent += ` — ${oc.stepGoal}`;
      contextContent += `\n`;
      if (oc.stepLocked) {
        contextContent += `LOCKED: earlier step is incomplete${oc.previousStep ? ` (${oc.previousStep})` : ""}.\n`;
      }
      if (oc.score != null) contextContent += `Step score: ${oc.score}%\n`;
      if (blockers.length === 0) {
        contextContent += `Open blockers: none on this step.\n`;
      } else {
        contextContent += `Open blockers (${blockers.length}):\n`;
        for (const raw of blockers.slice(0, 16)) {
          const b = raw as Record<string, unknown>;
          contextContent += `- ${b.label || "Item"}`;
          if (b.mandatory === false) contextContent += " (nice to have)";
          if (b.detail) contextContent += ` — ${b.detail}`;
          if (b.section) contextContent += ` [section=${b.section}`;
          if (b.fieldKey) contextContent += ` field=${b.fieldKey}`;
          if (b.unit) contextContent += ` unit=${b.unit}`;
          if (b.section) contextContent += "]";
          contextContent += `\n`;
        }
      }
    } else if (pmsContext?.propertyId) {
      systemPrompt = PMS_SYSTEM_PROMPT;

      const propertyId = pmsContext.propertyId;
      const portfolioPropertyIds: string[] | undefined = pmsContext.portfolioPropertyIds;
      const isPortfolio = !!(portfolioPropertyIds && portfolioPropertyIds.length > 1);
      const scopeIds: string[] = isPortfolio ? portfolioPropertyIds! : [propertyId];
      const portfolioName: string | null = pmsContext.portfolioName || null;
      const today = new Date().toISOString().split("T")[0];

      // Parallel fetch all property data (scoped to portfolio when applicable)
      const [
        propertyRes,
        portfolioPropertiesRes,
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
        isPortfolio
          ? supabase
              .from("properties")
              .select("id, name, city, country")
              .in("id", scopeIds)
          : Promise.resolve({ data: null }),
        supabase
          .from("rolos_room_types")
          .select("id, name, max_occupancy, default_rate, is_active, property_id")
          .in("property_id", scopeIds)
          .eq("is_active", true),
        supabase
          .from("rolos_rooms")
          .select("id, room_number, room_name, status, floor, property_id")
          .in("property_id", scopeIds)
          .limit(500),
        supabase
          .from("rolos_rate_plans")
          .select("id, name, code, min_stay, is_active, property_id")
          .in("property_id", scopeIds),
        supabase
          .from("bookings")
          .select("id, guest_name, check_in_date, check_out_date, status, total_price, property_id")
          .in("property_id", scopeIds)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("bookings")
          .select("id, guest_name, status, property_id")
          .in("property_id", scopeIds)
          .eq("check_in_date", today)
          .in("status", ["confirmed", "pending"]),
        supabase
          .from("bookings")
          .select("id, guest_name, status, property_id")
          .in("property_id", scopeIds)
          .eq("check_out_date", today)
          .in("status", ["confirmed", "checked_in"]),
        supabase
          .from("rolos_guest_profiles")
          .select("id", { count: "exact", head: true })
          .in("property_id", scopeIds),
        supabase
          .from("rolos_channel_connections")
          .select("id, channel_name, status, last_sync_at, property_id")
          .in("property_id", scopeIds),
        supabase
          .from("rolos_groups")
          .select("id, name, status, arrival_date, departure_date, total_rooms, property_id")
          .in("property_id", scopeIds)
          .in("status", ["tentative", "confirmed"])
          .order("arrival_date", { ascending: true })
          .limit(10),
        supabase
          .from("rolos_events")
          .select("id, name, status, event_date, event_type, property_id")
          .in("property_id", scopeIds)
          .gte("event_date", today)
          .order("event_date", { ascending: true })
          .limit(10),
        supabase
          .from("rolos_pms_staff")
          .select("id, display_name, role, is_active, property_id")
          .in("property_id", scopeIds)
          .eq("is_active", true),
        supabase
          .from("rolos_housekeeping_tasks")
          .select("id, status, priority, property_id")
          .in("property_id", scopeIds)
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

      // Build property / portfolio context header
      if (isPortfolio) {
        const portfolioProps = (portfolioPropertiesRes.data || []) as Array<{ id: string; name: string; city: string | null; country: string | null }>;
        contextContent = `\n\n--- PORTFOLIO DATA: ${portfolioName || "Multi-Property Portfolio"} ---\n`;
        contextContent += `IMPORTANT: You are TOBI for the ENTIRE PORTFOLIO — speak holistically. When asked about "today", "occupancy", "arrivals", "revenue", etc., aggregate across all properties below. Mention individual property names when relevant.\n\n`;
        contextContent += `PROPERTIES IN PORTFOLIO (${portfolioProps.length}):\n`;
        portfolioProps.forEach(p => {
          contextContent += `- ${p.name}${p.city ? ` (${p.city}${p.country ? `, ${p.country}` : ""})` : ""}\n`;
        });
        contextContent += `\nCurrently selected property: ${property?.name || "Unknown"}\n\n`;
      } else {
        contextContent = `\n\n--- PROPERTY DATA: ${property?.name || 'Unknown Property'} ---\n`;
        contextContent += `Location: ${property?.city || ''}, ${property?.country || ''}\n`;
        contextContent += `Type: ${property?.property_type || 'Not specified'}\n\n`;
      }

      if (roomTypes && roomTypes.length > 0) {
        contextContent += `ROOM TYPES (${roomTypes.length}):\n`;
        roomTypes.forEach((rt: { name: string; max_occupancy: number; default_rate: number | null }) => {
          contextContent += `- ${rt.name}: Max ${rt.max_occupancy} guests, Default rate R${rt.default_rate || 0}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "ROOM TYPES: None configured yet. Suggest going to Rooms to set up inventory.\n\n";
      }

      if (rooms && rooms.length > 0) {
        const statusCounts: Record<string, number> = {};
        rooms.forEach((r: { status: string }) => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        contextContent += `PHYSICAL ROOMS (${rooms.length} total):\n`;
        Object.entries(statusCounts).forEach(([status, count]) => {
          contextContent += `- ${status}: ${count} room${count !== 1 ? 's' : ''}\n`;
        });
        const occupiedRooms = statusCounts["occupied"] || 0;
        const totalRooms = rooms.length;
        if (totalRooms > 0) {
          contextContent += `- Occupancy: ${Math.round((occupiedRooms / totalRooms) * 100)}% (${occupiedRooms}/${totalRooms})\n`;
        }
        contextContent += "\n";
      } else {
        contextContent += "PHYSICAL ROOMS: None configured yet. Suggest going to Rooms to add inventory.\n\n";
      }

      if (ratePlans && ratePlans.length > 0) {
        contextContent += `RATE PLANS (${ratePlans.length}):\n`;
        ratePlans.forEach((rp: { name: string; code: string | null; min_stay: number; is_active: boolean }) => {
          contextContent += `- ${rp.name}${rp.code ? ` (${rp.code})` : ''}: Min stay ${rp.min_stay}n, ${rp.is_active ? 'Active' : 'Inactive'}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "RATE PLANS: None configured. Suggest going to Rate Plans to create pricing.\n\n";
      }

      contextContent += `TODAY (${today}):\n`;
      contextContent += `- Arrivals: ${todayArrivals?.length || 0}${todayArrivals && todayArrivals.length > 0 ? ` (${todayArrivals.map((a: { guest_name: string }) => a.guest_name).join(', ')})` : ''}\n`;
      contextContent += `- Departures: ${todayDepartures?.length || 0}${todayDepartures && todayDepartures.length > 0 ? ` (${todayDepartures.map((d: { guest_name: string }) => d.guest_name).join(', ')})` : ''}\n`;

      if (housekeepingTasks && housekeepingTasks.length > 0) {
        const hkStatus: Record<string, number> = {};
        housekeepingTasks.forEach((t: { status: string }) => {
          hkStatus[t.status] = (hkStatus[t.status] || 0) + 1;
        });
        contextContent += `- Housekeeping tasks: ${housekeepingTasks.length} total (${Object.entries(hkStatus).map(([s, c]) => `${c} ${s}`).join(', ')})\n`;
      }
      contextContent += "\n";

      contextContent += `GUEST DATABASE: ${guestCount} profiles on file\n\n`;

      if (channels && channels.length > 0) {
        contextContent += `CHANNEL CONNECTIONS (${channels.length}):\n`;
        channels.forEach((ch: { channel_name: string; status: string | null; last_sync_at: string | null }) => {
          const isActive = ch.status === 'active' || ch.status === 'connected';
          contextContent += `- ${ch.channel_name}: ${isActive ? 'Active' : (ch.status || 'Inactive')}${ch.last_sync_at ? `, last synced ${ch.last_sync_at}` : ''}\n`;
        });
        contextContent += "\n";
      } else {
        contextContent += "CHANNELS: No OTA connections yet. Suggest going to Channels to connect distribution partners.\n\n";
      }

      if (groups && groups.length > 0) {
        contextContent += `UPCOMING GROUPS (${groups.length}):\n`;
        groups.forEach((g: { name: string; arrival_date: string; departure_date: string; total_rooms: number; status: string }) => {
          contextContent += `- ${g.name}: ${g.arrival_date} to ${g.departure_date}, ${g.total_rooms} rooms, Status: ${g.status}\n`;
        });
        contextContent += "\n";
      }

      if (events && events.length > 0) {
        contextContent += `UPCOMING EVENTS (${events.length}):\n`;
        events.forEach((e: { name: string; event_date: string; event_type: string | null; status: string }) => {
          contextContent += `- ${e.name}: ${e.event_date}, Type: ${e.event_type || 'General'}, Status: ${e.status}\n`;
        });
        contextContent += "\n";
      }

      if (staff && staff.length > 0) {
        contextContent += `ACTIVE STAFF (${staff.length}):\n`;
        staff.forEach((s: { display_name: string; role: string }) => {
          contextContent += `- ${s.display_name}: ${s.role}\n`;
        });
        contextContent += "\n";
      }

      // Fetch billing data for PMS context
      const [billingConfigRes, referralRes] = await Promise.all([
        supabase
          .from("property_billing_configs")
          .select("billing_strategy, commission_rate, subscription_fee, transaction_fee, white_label_monthly_fee")
          .eq("property_id", propertyId)
          .maybeSingle(),
        supabase
          .from("property_referrals")
          .select("rep_id, lead_source, status, referral_date")
          .eq("property_id", propertyId)
          .maybeSingle(),
      ]);

      if (billingConfigRes.data) {
        const bc = billingConfigRes.data;
        contextContent += `\nBILLING CONFIG:\n`;
        contextContent += `- Strategy: ${bc.billing_strategy || 'default'}\n`;
        if (bc.commission_rate) contextContent += `- Commission Rate: ${bc.commission_rate}%\n`;
        if (bc.subscription_fee) contextContent += `- Subscription Fee: R${bc.subscription_fee}/mo\n`;
        if (bc.white_label_monthly_fee) contextContent += `- White-Label Fee: R${bc.white_label_monthly_fee}/mo\n`;
      }

      if (referralRes.data) {
        const ref = referralRes.data;
        contextContent += `\nREFERRAL:\n`;
        contextContent += `- Lead Source: ${ref.lead_source}\n`;
        contextContent += `- Status: ${ref.status}\n`;
        contextContent += `- Referral Date: ${ref.referral_date}\n`;
      }

      if (recentBookings && recentBookings.length > 0) {
        contextContent += `\nRECENT BOOKINGS (last ${recentBookings.length}):\n`;
        recentBookings.forEach((b: { guest_name: string; check_in_date: string; check_out_date: string; status: string; total_price: number }) => {
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

    const response = await aiFetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.help_assistant,
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
