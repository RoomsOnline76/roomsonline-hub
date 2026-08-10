// Channel Manager entitlement fan-out.
//
// When the billing switch "Channel Manager (Rentals United)" is toggled for a
// property or a portfolio — or when an admin archives a property from the
// Channel Manager cost monitor — every affected property (and its units) must
// be archived (or re-activated) at Rentals United and flagged locally so the
// ROL'OS Channel Manager screen can lock itself and billing stops counting it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_RECIPIENTS = ["dev@roomsonline.co.za", "carike@roomsonline.co.za"];

interface Body {
  scope: "property" | "portfolio" | "unit";
  entity_id: string;
  enabled: boolean;
  /** Free-text audit note captured in the confirmation dialog. */
  reason?: string;
  /** Set by the cost monitor so unit listings are archived too. */
  include_units?: boolean;
  /** Send the re-activation notice to dev + finance. */
  notify?: boolean;
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendReactivationNotice(payload: {
  propertyNames: string[];
  actorEmail: string | null;
  listingCount: number;
  unitCount: number;
  reason?: string;
}) {
  if (!RESEND_API_KEY) return "RESEND_API_KEY not configured";
  const rows = payload.propertyNames.map((n) => `<li>${n}</li>`).join("");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A2E">
      <h2 style="color:#E91E8C;margin:0 0 12px">Channel Manager re-activation</h2>
      <p>The following ${payload.propertyNames.length === 1 ? "property has" : "properties have"} been
      re-activated on the Channel Manager and will resume billing this period.</p>
      <ul>${rows}</ul>
      <p><strong>Listings resuming:</strong> ${payload.listingCount}<br/>
         <strong>Units re-activated:</strong> ${payload.unitCount}<br/>
         <strong>Actioned by:</strong> ${payload.actorEmail || "unknown"}</p>
      ${payload.reason ? `<p><strong>Reason:</strong> ${payload.reason}</p>` : ""}
      <p style="font-size:12px;color:#6b7280">Sent automatically by ROL'OS.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: NOTIFY_RECIPIENTS,
        subject: `Channel Manager re-activation — ${payload.propertyNames.join(", ").slice(0, 90)}`,
        html,
      }),
    });
    if (!res.ok) return `Resend ${res.status}: ${await res.text()}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Email send failed";
  }
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

    const actorEmail = userData.user.email ?? null;

    const raw = (await req.json().catch(() => null)) as Body | null;
    if (!raw || (raw.scope !== "property" && raw.scope !== "portfolio" && raw.scope !== "unit")) {
      return bad("scope must be 'property', 'portfolio' or 'unit'");
    }
    if (!raw.entity_id || typeof raw.enabled !== "boolean") {
      return bad("entity_id and enabled are required");
    }

    // ── Single unit listing toggle (from the cost monitor unit rows) ───
    if (raw.scope === "unit") {
      const { data: unit, error: unitErr } = await admin
        .from("hostfully_room_types")
        .select("id, name, property_id, is_active, rentalsunited_property_id")
        .eq("id", raw.entity_id)
        .maybeSingle();
      if (unitErr) return bad(unitErr.message, 500);
      if (!unit) return bad("Unit not found", 404);

      const unitArchive = !raw.enabled;
      let unitStatus: "updated" | "ru_failed" = "updated";
      let unitDetail: string | undefined;

      if (unit.rentalsunited_property_id) {
        const { data: ruRes, error: ruErr } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "set_property_status",
            property_id: unit.property_id,
            ru_property_id: unit.rentalsunited_property_id,
            metadata: { is_active: !unitArchive, is_archived: unitArchive },
          },
        });
        if (ruErr || (ruRes && (ruRes as { success?: boolean }).success === false)) {
          unitStatus = "ru_failed";
          unitDetail =
            ruErr?.message ||
            (ruRes as { error?: string } | null)?.error ||
            "Rentals United rejected the status change";
        }
      } else {
        unitDetail = "No Rentals United listing yet — local flag only";
      }

      const { error: flagErr } = await admin
        .from("hostfully_room_types")
        .update({ is_active: !unitArchive })
        .eq("id", unit.id);
      if (flagErr) {
        unitStatus = "ru_failed";
        unitDetail = flagErr.message;
      }

      // Re-activating a unit on an archived building must unlock the building.
      if (!unitArchive) {
        await admin
          .from("properties")
          .update({ ru_archived: false, ru_archived_at: null })
          .eq("id", unit.property_id)
          .eq("ru_archived", true);
      }

      await admin.from("ru_archive_events").insert({
        property_id: unit.property_id,
        property_name: unit.name,
        direction: unitArchive ? "archived" : "reactivated",
        unit_count: 1,
        listing_count: unit.rentalsunited_property_id ? 1 : 0,
        reason: raw.reason ?? null,
        actor_user_id: userData.user.id,
        actor_email: actorEmail,
        ru_status: unitStatus,
        detail: unitDetail ?? null,
      });

      return new Response(
        JSON.stringify({
          success: true,
          archived: unitArchive,
          affected: 1,
          failed: unitStatus === "ru_failed" ? 1 : 0,
          notification_error: null,
          results: [
            {
              property_id: unit.property_id,
              name: unit.name,
              ru_property_id: unit.rentalsunited_property_id,
              status: unitStatus,
              units_changed: 1,
              detail: unitDetail,
            },
          ],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const includeUnits = raw.include_units !== false;
    const results: Array<{
      property_id: string;
      name: string | null;
      ru_property_id: string | null;
      status: "updated" | "skipped" | "ru_failed";
      units_changed?: number;
      listings?: number;
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
              // The rentalsunited-api handler reads these flags from `metadata`.
              metadata: {
                is_active: !archive,
                is_archived: archive,
              },
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

      // ── Units: archiving a building must stop its unit listings too ──
      let unitsChanged = 0;
      let listingCount = 0;
      if (includeUnits) {
        const { data: units } = await admin
          .from("hostfully_room_types")
          .select("id, is_active, rentalsunited_property_id")
          .eq("property_id", p.id)
          .not("rentalsunited_property_id", "is", null);

        const rows = (units || []) as Array<{
          id: string;
          is_active: boolean | null;
          rentalsunited_property_id: string | null;
        }>;
        listingCount = rows.length;
        const toChange = rows.filter((u) => (u.is_active !== false) === archive).map((u) => u.id);
        if (toChange.length > 0) {
          const { error: unitErr } = await admin
            .from("hostfully_room_types")
            .update({ is_active: !archive })
            .in("id", toChange);
          if (unitErr) {
            detail = `${detail ? `${detail}; ` : ""}unit update failed: ${unitErr.message}`;
          } else {
            unitsChanged = toChange.length;
          }
        }
      }

      // ── Audit trail for the cost monitor ─────────────────────────────
      await admin.from("ru_archive_events").insert({
        property_id: p.id,
        property_name: p.name,
        direction: archive ? "archived" : "reactivated",
        unit_count: unitsChanged,
        listing_count: listingCount || (p.rentalsunited_property_id ? 1 : 0),
        reason: raw.reason ?? null,
        actor_user_id: userData.user.id,
        actor_email: actorEmail,
        ru_status: status,
        detail: detail ?? null,
      });

      results.push({
        property_id: p.id,
        name: p.name,
        ru_property_id: p.rentalsunited_property_id,
        status,
        units_changed: unitsChanged,
        listings: listingCount,
        detail,
      });
    }

    // Re-activation resumes billing — always tell dev + finance.
    let notice: string | null = null;
    if (!archive && raw.notify !== false) {
      notice = await sendReactivationNotice({
        propertyNames: results.map((r) => r.name || r.property_id),
        actorEmail,
        listingCount: results.reduce((s, r) => s + (r.listings || 0), 0),
        unitCount: results.reduce((s, r) => s + (r.units_changed || 0), 0),
        reason: raw.reason,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        archived: archive,
        affected: results.length,
        failed: results.filter((r) => r.status === "ru_failed").length,
        notification_error: notice,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Unexpected error", 500);
  }
});
