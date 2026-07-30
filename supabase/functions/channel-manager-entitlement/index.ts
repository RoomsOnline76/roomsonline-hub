// Channel Manager entitlement fan-out.
//
// When the billing switch "Channel Manager (Rentals United)" is toggled for a
// property or a portfolio, every affected property must be archived (or
// re-activated) at Rentals United and flagged locally so the ROL'OS Channel
// Manager screen can lock itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  scope: "property" | "portfolio";
  entity_id: string;
  enabled: boolean;
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return bad("Missing Authorization header", 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── Auth: staff only ──────────────────────────────────────────────
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return bad("Invalid session", 401);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const allowed = (roles || []).some((r: { role: string }) =>
      ["admin", "dev", "fearless_leader"].includes(r.role)
    );
    if (!allowed) return bad("Insufficient permissions", 403);

    const raw = (await req.json().catch(() => null)) as Body | null;
    if (!raw || (raw.scope !== "property" && raw.scope !== "portfolio")) {
      return bad("scope must be 'property' or 'portfolio'");
    }
    if (!raw.entity_id || typeof raw.enabled !== "boolean") {
      return bad("entity_id and enabled are required");
    }

    // ── Resolve affected properties ───────────────────────────────────
    let propertyIds: string[] = [];
    if (raw.scope === "property") {
      propertyIds = [raw.entity_id];
    } else {
      const { data: members } = await admin
        .from("property_portfolio_members")
        .select("property_id")
        .eq("portfolio_id", raw.entity_id);
      propertyIds = (members || []).map((m: { property_id: string }) => m.property_id);
    }
    if (propertyIds.length === 0) {
      return new Response(JSON.stringify({ success: true, affected: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: props, error: propErr } = await admin
      .from("properties")
      .select("id, name, rentalsunited_property_id, ru_push_enabled, ru_archived")
      .in("id", propertyIds);
    if (propErr) return bad(propErr.message, 500);

    const archive = !raw.enabled;
    const results: Array<{
      property_id: string;
      name: string | null;
      ru_property_id: string | null;
      status: "updated" | "skipped" | "ru_failed";
      detail?: string;
    }> = [];

    for (const p of (props || []) as Array<{
      id: string;
      name: string | null;
      rentalsunited_property_id: string | null;
      ru_push_enabled: boolean | null;
      ru_archived: boolean | null;
    }>) {
      let detail: string | undefined;
      let status: "updated" | "skipped" | "ru_failed" = "updated";

      if (p.rentalsunited_property_id) {
        // Push the archive / re-activate call to Rentals United.
        const { data: ruRes, error: ruErr } = await admin.functions.invoke(
          "rentalsunited-api",
          {
            body: {
              action: "set_property_status",
              property_id: p.id,
              ru_property_id: p.rentalsunited_property_id,
              is_active: !archive,
              is_archived: archive,
            },
          }
        );
        if (ruErr || (ruRes && (ruRes as { success?: boolean }).success === false)) {
          status = "ru_failed";
          detail =
            ruErr?.message ||
            (ruRes as { error?: string } | null)?.error ||
            "Rentals United rejected the status change";
        }
      } else {
        detail = "No Rentals United listing yet — local flag only";
      }

      const { error: updErr } = await admin
        .from("properties")
        .update({
          ru_archived: archive,
          ru_archived_at: archive ? new Date().toISOString() : null,
          // Archiving must also stop any further ARI pushes.
          ...(archive ? { ru_push_enabled: false } : {}),
        })
        .eq("id", p.id);
      if (updErr) {
        status = "ru_failed";
        detail = updErr.message;
      }

      results.push({
        property_id: p.id,
        name: p.name,
        ru_property_id: p.rentalsunited_property_id,
        status,
        detail,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        archived: archive,
        affected: results.length,
        failed: results.filter((r) => r.status === "ru_failed").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Unexpected error", 500);
  }
});
