// ============================================================================
// INQUIRY INTAKE — public website lead capture
//
// A property (or portfolio) publishes an inquiry key and posts its website form
// here. The lead lands natively in `rolos_inquiries`; the optional HubSpot
// add-on receives a projection afterwards and can never block the capture.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { projectToHubspot } from "../_shared/hubspotProjection.ts";
import { normaliseEmail, normaliseGuestName } from "../_shared/guestStats.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = z.object({
  inquiry_key: z.string().trim().min(8).max(120),
  guest_name: z.string().trim().min(1).max(160),
  guest_email: z.string().trim().email().max(255).optional(),
  guest_phone: z.string().trim().max(40).optional(),
  guest_country: z.string().trim().max(120).optional(),
  company_name: z.string().trim().max(200).optional(),
  check_in: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  check_out: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.number().int().min(1).max(60).optional(),
  children: z.number().int().min(0).max(60).optional(),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(40).optional(),
  is_trade: z.boolean().optional(),
  /** Honeypot — real browsers leave it empty. */
  trap: z.string().max(200).optional(),
});

/** Lifecycle marker derived from the guest's own stay history. */
function lifecycleFrom(stays: number, lastStay: string | null): "new" | "repeat" | "lapsed" {
  if (!stays) return "new";
  if (lastStay) {
    const days = (Date.now() - new Date(lastStay).getTime()) / 86_400_000;
    if (days > 540) return "lapsed";
  }
  return "repeat";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const body = parsed.data;

    // Silently accept and drop bot submissions so scrapers learn nothing.
    if (body.trap && body.trap.trim()) return json({ success: true, received: true });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: key } = await admin
      .from("rolos_inquiry_keys")
      .select("id, property_id, portfolio_id, is_active, allowed_origins, request_count")
      .eq("key_public", body.inquiry_key)
      .maybeSingle();

    if (!key || !key.is_active) return json({ error: "Unknown or inactive inquiry key" }, 403);

    // Origin allow-list is opt-in: empty means "any site".
    const origin = req.headers.get("Origin") || "";
    const allowed: string[] = key.allowed_origins || [];
    if (allowed.length && origin) {
      const host = (() => {
        try {
          return new URL(origin).host.toLowerCase();
        } catch {
          return "";
        }
      })();
      const permitted = allowed.some((a) => host === a.toLowerCase() || host.endsWith(`.${a.toLowerCase()}`));
      if (!permitted) return json({ error: "Origin not allowed for this inquiry key" }, 403);
    }

    const email = normaliseEmail(body.guest_email);
    const isTrade = body.is_trade ?? Boolean(body.company_name);

    // Repeat / lapsed segmentation from the unified guest record.
    let lifecycle: "new" | "repeat" | "lapsed" = "new";
    let guestProfileId: string | null = null;
    if (email) {
      const { data: profile } = await admin
        .from("rolos_guest_profiles")
        .select("id, total_stays, last_stay_date")
        .eq("email", email)
        .maybeSingle();
      if (profile) {
        guestProfileId = profile.id;
        lifecycle = lifecycleFrom(Number(profile.total_stays || 0), profile.last_stay_date);
      }
    }

    const notes = [
      body.message?.trim() || null,
      lifecycle !== "new" ? `Guest history: ${lifecycle}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: inquiry, error } = await admin
      .from("rolos_inquiries")
      .insert({
        property_id: key.property_id,
        portfolio_id: key.portfolio_id,
        guest_name: body.guest_name,
        guest_email: email || null,
        guest_phone: body.guest_phone || null,
        guest_country: body.guest_country || null,
        company_name: body.company_name || null,
        check_in: body.check_in || null,
        check_out: body.check_out || null,
        adults: body.adults ?? 2,
        children: body.children ?? 0,
        source: body.source || "website",
        notes: notes || null,
        is_trade: isTrade,
        intake_key_id: key.id,
      })
      .select("id, property_id, guest_name, guest_email, check_in, is_trade")
      .single();

    if (error) {
      console.error("[inquiry-intake] insert failed:", error.message);
      return json({ error: "Could not record the inquiry" }, 500);
    }

    await admin.from("rolos_inquiry_events").insert({
      inquiry_id: inquiry.id,
      event_type: "created",
      to_status: "new",
      note: `Website form (${body.source || "website"})`,
      actor_label: "Website",
    });

    await admin
      .from("rolos_inquiry_keys")
      .update({
        request_count: Number(key.request_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", key.id);

    // Optional outward projection — never gates the native capture.
    let propertyName: string | null = null;
    if (inquiry.property_id) {
      const { data: prop } = await admin
        .from("properties")
        .select("name")
        .eq("id", inquiry.property_id)
        .maybeSingle();
      propertyName = prop?.name ?? null;
    }

    const projection = await projectToHubspot(admin, {
      propertyId: inquiry.property_id,
      action: "upsert_inquiry",
      payload: {
        inquiry: {
          inquiry_id: inquiry.id,
          reference: `INQ-${String(inquiry.id).slice(0, 8).toUpperCase()}`,
          stage: "enquiry",
          guest_name: normaliseGuestName(inquiry.guest_name) ? inquiry.guest_name : undefined,
          ...(email ? { guest_email: email } : {}),
          ...(body.guest_phone ? { guest_phone: body.guest_phone } : {}),
          ...(propertyName ? { property_name: propertyName } : {}),
          ...(inquiry.check_in ? { check_in_date: inquiry.check_in } : {}),
          trade_or_direct: isTrade ? "trade" : "direct",
          source: body.source || "website",
        },
      },
    });

    if (projection.pushed > 0) {
      await admin
        .from("rolos_inquiries")
        .update({ hubspot_synced_at: new Date().toISOString() })
        .eq("id", inquiry.id);
    }

    return json({
      success: true,
      inquiry_id: inquiry.id,
      lifecycle,
      guest_profile_id: guestProfileId,
      projected: projection.pushed,
    });
  } catch (err) {
    console.error("[inquiry-intake] error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
