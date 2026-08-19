// ============================================================================
// GUEST CHECK-IN API — digital check-in / preference capture
//
// Two doors onto the same native record (`rolos_guest_checkins`):
//   • guests use a tokenised link (no account, no session)
//   • staff submit on the guest's behalf from the ROL'OS dashboard
// Identity numbers and dates of birth are encrypted at rest and never returned.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { projectToHubspot } from "../_shared/hubspotProjection.ts";
import { normaliseEmail } from "../_shared/guestStats.ts";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const partySchema = z.array(
  z.object({
    name: z.string().trim().max(160).optional(),
    age_band: z.enum(["adult", "child", "infant"]).optional(),
    dietary: z.string().trim().max(240).optional(),
  }),
).max(30);

const submissionSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(400).optional(),
  nationality: z.string().trim().max(120).optional(),
  identity_number: z.string().trim().max(60).optional(),
  date_of_birth: z.string().trim().max(20).optional(),
  arrival_time: z.string().trim().max(20).optional(),
  travelling_party: partySchema.optional(),
  dietary_requirements: z.string().trim().max(600).optional(),
  accessibility_needs: z.string().trim().max(600).optional(),
  preferences: z.string().trim().max(600).optional(),
  special_occasion: z.string().trim().max(240).optional(),
  marketing_consent: z.boolean().optional(),
  vehicle_registration: z.string().trim().max(40).optional(),
  emergency_contact_name: z.string().trim().max(160).optional(),
  emergency_contact_phone: z.string().trim().max(40).optional(),
});

const schema = z.object({
  action: z.enum(["get_form", "submit", "issue_link"]),
  token: z.string().trim().min(10).max(128).optional(),
  booking_id: z.string().uuid().optional(),
  submission: submissionSchema.optional(),
});

const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /** Signed-in staff caller, when there is one. */
    const resolveStaff = async (): Promise<string | null> => {
      const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!bearer || bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return null;
      const { data } = await admin.auth.getUser(bearer);
      return data?.user?.id ?? null;
    };

    const bookingColumns =
      "id, property_id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, adults, children, rol_reference, rol_reference_legacy, external_reservation_id, status";

    /** Resolve the booking a request is allowed to touch. */
    const resolveTarget = async (): Promise<
      | { booking: Record<string, unknown>; staffId: string | null; viaToken: boolean }
      | Response
    > => {
      if (body.token) {
        const { data: row } = await admin
          .from("rolos_guest_checkins")
          .select("id, booking_id, token_expires_at, completed_at")
          .eq("token", body.token)
          .maybeSingle();
        if (!row) return json({ error: "This check-in link is not valid." }, 404);
        if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
          return json({ error: "This check-in link has expired." }, 410);
        }
        const { data: booking } = await admin
          .from("bookings")
          .select(bookingColumns)
          .eq("id", row.booking_id)
          .maybeSingle();
        if (!booking) return json({ error: "Booking not found" }, 404);
        return { booking, staffId: null, viaToken: true };
      }

      const staffId = await resolveStaff();
      if (!staffId) return json({ error: "Authentication required" }, 401);
      if (!body.booking_id) return json({ error: "booking_id is required" }, 400);

      const { data: booking } = await admin
        .from("bookings")
        .select(bookingColumns)
        .eq("id", body.booking_id)
        .maybeSingle();
      if (!booking) return json({ error: "Booking not found" }, 404);

      const { data: allowed } = await admin.rpc("can_access_property", {
        _property_id: booking.property_id,
        _user_id: staffId,
      });
      if (!allowed) return json({ error: "Not allowed for this property" }, 403);

      return { booking, staffId, viaToken: false };
    };

    const target = await resolveTarget();
    if (target instanceof Response) return target;
    const { booking, staffId, viaToken } = target;

    // ---- get_form ---------------------------------------------------------
    if (body.action === "get_form") {
      const { data: existing } = await admin
        .from("rolos_guest_checkins")
        .select(
          "id, full_name, email, phone, address, nationality, arrival_time, travelling_party, dietary_requirements, accessibility_needs, preferences, special_occasion, marketing_consent, vehicle_registration, emergency_contact_name, emergency_contact_phone, completed_at",
        )
        .eq("booking_id", booking.id)
        .maybeSingle();

      let propertyName: string | null = null;
      if (booking.property_id) {
        const { data: prop } = await admin
          .from("properties")
          .select("name")
          .eq("id", booking.property_id)
          .maybeSingle();
        propertyName = prop?.name ?? null;
      }

      return json({
        success: true,
        booking: {
          id: booking.id,
          reference: displayBookingReference(booking),
          guest_name: booking.guest_name,
          guest_email: viaToken ? undefined : booking.guest_email,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          adults: booking.adults,
          children: booking.children,
          property_name: propertyName,
        },
        checkin: existing ?? null,
      });
    }

    // ---- issue_link (staff only) ------------------------------------------
    if (body.action === "issue_link") {
      if (!staffId) return json({ error: "Authentication required" }, 401);
      const token = newToken();
      const expires = new Date(Date.now() + 45 * 86_400_000).toISOString();

      const { error } = await admin
        .from("rolos_guest_checkins")
        .upsert(
          {
            booking_id: booking.id,
            property_id: booking.property_id,
            token,
            token_expires_at: expires,
            full_name: (booking.guest_name as string) || null,
            email: normaliseEmail(booking.guest_email as string) || null,
            phone: (booking.guest_phone as string) || null,
          },
          { onConflict: "booking_id" },
        );
      if (error) return json({ error: `Could not issue link: ${error.message}` }, 500);

      return json({
        success: true,
        token,
        expires_at: expires,
        path: `/checkin?token=${token}`,
      });
    }

    // ---- submit -----------------------------------------------------------
    if (!body.submission) return json({ error: "submission is required" }, 400);
    const s = body.submission;

    const encrypt = async (value?: string): Promise<string | null> => {
      if (!value) return null;
      const { data, error } = await admin.rpc("encrypt_sensitive_text", { plaintext: value });
      if (error) {
        console.error("[guest-checkin-api] encrypt failed:", error.message);
        return null;
      }
      return (data as string) ?? null;
    };

    const email = normaliseEmail(s.email) || normaliseEmail(booking.guest_email as string);

    let guestProfileId: string | null = null;
    if (email) {
      const { data: profile } = await admin
        .from("rolos_guest_profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      guestProfileId = profile?.id ?? null;
    }

    const identity = await encrypt(s.identity_number);
    const dob = await encrypt(s.date_of_birth);

    const { data: saved, error: saveErr } = await admin
      .from("rolos_guest_checkins")
      .upsert(
        {
          booking_id: booking.id,
          property_id: booking.property_id,
          guest_profile_id: guestProfileId,
          full_name: s.full_name,
          email: email || null,
          phone: s.phone || null,
          address: s.address || null,
          nationality: s.nationality || null,
          ...(identity ? { identity_number_encrypted: identity } : {}),
          ...(dob ? { date_of_birth_encrypted: dob } : {}),
          arrival_time: s.arrival_time || null,
          travelling_party: s.travelling_party ?? [],
          dietary_requirements: s.dietary_requirements || null,
          accessibility_needs: s.accessibility_needs || null,
          preferences: s.preferences || null,
          special_occasion: s.special_occasion || null,
          marketing_consent: s.marketing_consent ?? false,
          vehicle_registration: s.vehicle_registration || null,
          emergency_contact_name: s.emergency_contact_name || null,
          emergency_contact_phone: s.emergency_contact_phone || null,
          submitted_by: staffId ? "staff" : "guest",
          submitted_by_user_id: staffId,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "booking_id" },
      )
      .select("id, completed_at")
      .single();

    if (saveErr) {
      console.error("[guest-checkin-api] save failed:", saveErr.message);
      return json({ error: "Could not save the check-in" }, 500);
    }

    // Keep the unified guest record in step with what the guest just told us.
    if (guestProfileId) {
      await admin
        .from("rolos_guest_profiles")
        .update({
          ...(s.nationality ? { nationality: s.nationality } : {}),
          ...(s.phone ? { phone: s.phone } : {}),
          ...(s.dietary_requirements ? { dietary_requirements: s.dietary_requirements } : {}),
          ...(s.preferences ? { preferences: s.preferences } : {}),
          marketing_consent: s.marketing_consent ?? false,
        })
        .eq("id", guestProfileId);
    }

    // Optional outward projection — a note on the guest's CRM timeline.
    if (email) {
      await projectToHubspot(admin, {
        propertyId: booking.property_id as string,
        action: "log_engagement",
        payload: {
          engagement: {
            email,
            title: `Digital check-in completed · ${displayBookingReference(booking)}`,
            body: [
              s.arrival_time ? `Arrival: ${s.arrival_time}` : null,
              s.dietary_requirements ? `Dietary: ${s.dietary_requirements}` : null,
              s.accessibility_needs ? `Accessibility: ${s.accessibility_needs}` : null,
              s.special_occasion ? `Occasion: ${s.special_occasion}` : null,
              s.preferences ? `Preferences: ${s.preferences}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      });
      await admin
        .from("rolos_guest_checkins")
        .update({ hubspot_synced_at: new Date().toISOString() })
        .eq("id", saved.id);
    }

    return json({ success: true, checkin_id: saved.id, completed_at: saved.completed_at });
  } catch (err) {
    console.error("[guest-checkin-api] error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
