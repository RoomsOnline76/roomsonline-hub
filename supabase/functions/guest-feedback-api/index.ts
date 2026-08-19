// ============================================================================
// GUEST FEEDBACK API — post-departure survey
//
// Native to ROL'OS: every departure gets a feedback record staff can work,
// whether or not the property opted into the branded survey email. Guests
// answer through a tokenised link with no account.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { projectToHubspot } from "../_shared/hubspotProjection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = z.object({
  action: z.enum(["get_form", "submit"]),
  token: z.string().trim().min(10).max(128),
  rating: z.number().int().min(1).max(5).optional(),
  would_recommend: z.boolean().optional(),
  comment: z.string().trim().max(2000).optional(),
});

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

    const { data: request } = await admin
      .from("rolos_feedback_requests")
      .select(
        "id, booking_id, property_id, guest_name, guest_email, status, rating, would_recommend, comment, responded_at",
      )
      .eq("token", body.token)
      .maybeSingle();

    if (!request) return json({ error: "This feedback link is not valid." }, 404);

    let propertyName: string | null = null;
    if (request.property_id) {
      const { data: prop } = await admin
        .from("properties")
        .select("name")
        .eq("id", request.property_id)
        .maybeSingle();
      propertyName = prop?.name ?? null;
    }

    if (body.action === "get_form") {
      return json({
        success: true,
        guest_name: request.guest_name,
        property_name: propertyName,
        already_responded: Boolean(request.responded_at),
        response: request.responded_at
          ? {
              rating: request.rating,
              would_recommend: request.would_recommend,
              comment: request.comment,
            }
          : null,
      });
    }

    if (request.responded_at) {
      return json({ success: true, already_responded: true });
    }
    if (!body.rating) return json({ error: "A rating is required" }, 400);

    const now = new Date().toISOString();
    const { error } = await admin
      .from("rolos_feedback_requests")
      .update({
        rating: body.rating,
        would_recommend: body.would_recommend ?? null,
        comment: body.comment || null,
        // Anything at or below three stars needs a human; the rest is closed.
        status: body.rating <= 3 ? "needs_attention" : "responded",
        responded_at: now,
      })
      .eq("id", request.id);

    if (error) {
      console.error("[guest-feedback-api] update failed:", error.message);
      return json({ error: "Could not record your feedback" }, 500);
    }

    if (request.guest_email) {
      await projectToHubspot(admin, {
        propertyId: request.property_id,
        action: "log_engagement",
        payload: {
          engagement: {
            email: request.guest_email,
            title: `Post-stay feedback · ${body.rating}/5${
              propertyName ? ` · ${propertyName}` : ""
            }`,
            body: [
              body.would_recommend == null
                ? null
                : `Would recommend: ${body.would_recommend ? "yes" : "no"}`,
              body.comment || null,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        },
      });
      await admin
        .from("rolos_feedback_requests")
        .update({ hubspot_synced_at: now })
        .eq("id", request.id);
    }

    return json({ success: true, rating: body.rating, needs_attention: body.rating <= 3 });
  } catch (err) {
    console.error("[guest-feedback-api] error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
