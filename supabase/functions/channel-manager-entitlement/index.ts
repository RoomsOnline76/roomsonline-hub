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
  scope:
    | "property"
    | "portfolio"
    | "unit"
    | "purge_duplicates"
    /** Read-only: pull every listing the channel account holds and classify it. */
    | "reconcile"
    /** Archive one listing id upstream (orphans that no local record points at). */
    | "purge_listing"
    /** Clear a local listing id the channel account no longer returns. */
    | "clear_local_listing";
  entity_id: string;
  enabled?: boolean;
  /** Free-text audit note captured in the confirmation dialog. */
  reason?: string;
  /** Set by the cost monitor so unit listings are archived too. */
  include_units?: boolean;
  /** Send the re-activation notice to dev + finance. */
  notify?: boolean;
  /** purge_duplicates: limit the purge to a single deactivated unit record. */
  unit_id?: string;
  /** purge_listing: RU OwnerID that owns the listing. */
  owner_id?: string | null;
  /** purge_listing: the channel already reports it archived — skip the push. */
  already_archived?: boolean;

  /** clear_local_listing: "property" | "unit" record kind holding the stale id. */
  record_kind?: "property" | "unit";
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

/**
 * RU listings for white-label properties live on a sub-user account. Calling
 * Push_SetPropertiesStatus_RQ with master credentials returns Status 0 plus a
 * warning ("Property with given ID does not exist") and changes nothing, so the
 * OwnerID must be resolved and passed through.
 */
async function resolveRuOwnerId(
  admin: ReturnType<typeof createClient>,
  propertyId: string,
): Promise<string | null> {
  const { data: direct } = await admin
    .from("ru_owner_accounts")
    .select("ru_owner_id")
    .eq("property_id", propertyId)
    .not("ru_owner_id", "is", null)
    .maybeSingle();
  if (direct?.ru_owner_id) return String(direct.ru_owner_id);

  const { data: members } = await admin
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId);
  const portfolioIds = (members || []).map((m: { portfolio_id: string }) => m.portfolio_id);
  if (portfolioIds.length === 0) return null;

  const { data: viaPortfolio } = await admin
    .from("ru_owner_accounts")
    .select("ru_owner_id")
    .in("portfolio_id", portfolioIds)
    .not("ru_owner_id", "is", null)
    .limit(1)
    .maybeSingle();
  return viaPortfolio?.ru_owner_id ? String(viaPortfolio.ru_owner_id) : null;
}

/**
 * Operation label + trace stamped on every channel exchange we cause, so the
 * durable exchange log can be filtered by the ROL'OS operation (reconcile /
 * cleanup) instead of only by the low-level adapter action.
 */
interface ChannelLogCtx {
  trace_id: string;
  parent_action: string;
}

const logCtx = (traceId: string, operation: string): ChannelLogCtx => ({
  trace_id: traceId,
  parent_action: operation,
});

/** Push one listing's active/archived state to RU and report a real failure. */
async function pushListingStatus(
  admin: ReturnType<typeof createClient>,
  args: {
    propertyId: string;
    ruPropertyId: string;
    archive: boolean;
    ownerId: string | null;
    ctx?: ChannelLogCtx;
  },
): Promise<string | null> {
  const { data: ruRes, error: ruErr } = await admin.functions.invoke("rentalsunited-api", {
    body: {
      action: "set_property_status",
      property_id: args.propertyId,
      ru_property_id: args.ruPropertyId,
      ...(args.ownerId ? { owner_id: args.ownerId } : {}),
      ...(args.ctx ?? {}),
      metadata: { is_active: !args.archive, is_archived: args.archive },
    },
  });
  if (ruErr) return ruErr.message;
  const res = (ruRes || {}) as { success?: boolean; error?: string; raw_xml?: string };
  if (res.success === false) return res.error || "Rentals United rejected the status change";
  // RU reports per-listing rejections as warnings inside a Status 0 envelope.
  const warning = res.raw_xml?.match(/<Warning[^>]*>([^<]+)<\/Warning>/)?.[1];
  if (warning) return `Rentals United warning: ${warning}`;
  return null;
}

interface ChannelListing {
  id: string;
  name: string;
  is_active?: boolean;
  is_archived?: boolean;
}

/** Read every listing one channel account holds. Errors are returned, never thrown. */
async function pullOwnerListings(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  ctx: ChannelLogCtx,
): Promise<{ listings: ChannelListing[]; error: string | null }> {
  const { data, error } = await admin.functions.invoke("rentalsunited-api", {
    body: { action: "list_properties", owner_id: Number(ownerId), ...ctx },
  });
  const res = (data || {}) as {
    success?: boolean;
    error?: { message?: string } | string;
    properties?: ChannelListing[];
  };
  if (error || res.success === false) {
    const message =
      error?.message ||
      (typeof res.error === "string" ? res.error : res.error?.message) ||
      "Channel account could not be read";
    return { listings: [], error: message };
  }
  return { listings: res.properties || [], error: null };
}

/**
 * Is this listing id still returned by the account? Archived listings stay in
 * the feed, so "present" here means present in any form — that is the state a
 * cleanup has to actually change.
 */
async function verifyListingPresence(
  admin: ReturnType<typeof createClient>,
  args: { listingId: string; ownerId: string | null; ctx: ChannelLogCtx },
): Promise<{ present: boolean | null; archived: boolean; error: string | null }> {
  if (!args.ownerId) return { present: null, archived: false, error: "No channel account could be resolved" };
  const { listings, error } = await pullOwnerListings(admin, args.ownerId, args.ctx);
  if (error) return { present: null, archived: false, error };
  const hit = listings.find((l) => String(l.id) === args.listingId);
  return { present: !!hit, archived: hit?.is_archived === true, error: null };
}

/**
 * Remove one listing for real: try a hard deletion first and fall back to
 * archiving only when the account does not support deletion. The caller still
 * has to verify — neither call is trusted on its envelope alone.
 */
async function removeListingUpstream(
  admin: ReturnType<typeof createClient>,
  args: { propertyId: string; listingId: string; ownerId: string | null; ctx: ChannelLogCtx },
): Promise<{ method: "deleted" | "archived" | "none"; error: string | null }> {
  const { data, error } = await admin.functions.invoke("rentalsunited-api", {
    body: {
      action: "delete_property",
      property_id: args.propertyId || undefined,
      ru_property_id: Number(args.listingId),
      ...(args.ownerId ? { owner_id: args.ownerId } : {}),
      ...args.ctx,
    },
  });
  const res = (data || {}) as { success?: boolean; error?: string };
  if (!error && res.success === true) return { method: "deleted", error: null };

  // Deletion unsupported or rejected — archive so the listing at least stops
  // billing, and let the verification step report what actually happened.
  const failure = await pushListingStatus(admin, {
    propertyId: args.propertyId,
    ruPropertyId: args.listingId,
    archive: true,
    ownerId: args.ownerId,
    ctx: { ...args.ctx, parent_action: `${args.ctx.parent_action}:archive_fallback` },
  });
  if (failure) return { method: "none", error: failure };
  return { method: "archived", error: null };
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
    const scopes = [
      "property",
      "portfolio",
      "unit",
      "purge_duplicates",
      "reconcile",
      "purge_listing",
      "clear_local_listing",
    ];
    if (!raw || !scopes.includes(raw.scope)) {
      return bad(`scope must be one of: ${scopes.join(", ")}`);
    }
    if (!raw.entity_id) return bad("entity_id is required");
    const NO_ENABLED = new Set(["purge_duplicates", "reconcile", "purge_listing", "clear_local_listing"]);
    if (!NO_ENABLED.has(raw.scope) && typeof raw.enabled !== "boolean") {
      return bad("enabled is required");
    }

    // ── Reconcile: read every listing the channel account actually holds and
    //    classify it against local records. Read-only — nothing is mutated. ──
    if (raw.scope === "reconcile") {
      const { data: accounts, error: accErr } = await admin
        .from("ru_owner_accounts")
        .select("id, ru_owner_id, ru_user_id, owner_email, portfolio_id, property_id")
        .not("ru_owner_id", "is", null);
      if (accErr) return bad(accErr.message, 500);

      const [{ data: props }, { data: units }] = await Promise.all([
        admin.from("properties").select("id, name, is_active, rentalsunited_property_id"),
        admin.from("hostfully_room_types").select("id, name, property_id, is_active, rentalsunited_property_id"),
      ]);

      type Local = {
        listingId: string;
        kind: "property" | "unit";
        recordId: string;
        propertyId: string;
        label: string;
        isActive: boolean;
      };
      const localByListing = new Map<string, Local>();
      for (const p of (props || []) as Array<Record<string, unknown>>) {
        const lid = p.rentalsunited_property_id as string | null;
        if (!lid) continue;
        localByListing.set(String(lid), {
          listingId: String(lid),
          kind: "property",
          recordId: p.id as string,
          propertyId: p.id as string,
          label: (p.name as string) || "Untitled property",
          isActive: p.is_active !== false,
        });
      }
      const propertyNames = new Map<string, string>();
      for (const p of (props || []) as Array<Record<string, unknown>>) {
        propertyNames.set(p.id as string, ((p.name as string) || "Untitled property"));
      }
      for (const u of (units || []) as Array<Record<string, unknown>>) {
        const lid = u.rentalsunited_property_id as string | null;
        if (!lid) continue;
        localByListing.set(String(lid), {
          listingId: String(lid),
          kind: "unit",
          recordId: u.id as string,
          propertyId: u.property_id as string,
          label: `${propertyNames.get(u.property_id as string) || "Property"} — ${(u.name as string) || "Unit"}`,
          isActive: u.is_active !== false,
        });
      }

      const ownerIds = Array.from(
        new Set((accounts || []).map((a: { ru_owner_id: string | null }) => String(a.ru_owner_id))),
      );
      const accountResults: Array<{
        owner_id: string;
        owner_email: string | null;
        listing_count: number;
        error: string | null;
        is_master: boolean;
      }> = [];
      // The master/parent account may never hold listings in a white-label
      // integration, so flag it explicitly rather than assume it is clean.
      const masterOwnerId = (Deno.env.get("RU_OWNER_ID") || "").trim();
      const seenOnChannel = new Set<string>();
      const archivedOnChannel = new Set<string>();
      const orphans: Array<{ listing_id: string; name: string; owner_id: string; is_archived: boolean }> = [];
      const archivedOrphans: Array<{ listing_id: string; name: string; owner_id: string }> = [];
      const matched: Array<{
        listing_id: string;
        name: string;
        owner_id: string;
        is_archived: boolean;
        local_label: string;
        local_active: boolean;
        kind: "property" | "unit";
      }> = [];

      for (const ownerId of ownerIds) {
        const account = (accounts || []).find(
          (a: { ru_owner_id: string | null }) => String(a.ru_owner_id) === ownerId,
        ) as { owner_email: string | null } | undefined;
        const { data: listRes, error: listErr } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "list_properties", owner_id: Number(ownerId) },
        });
        const res = (listRes || {}) as {
          success?: boolean;
          error?: { message?: string } | string;
          properties?: Array<{ id: string; name: string; is_active?: boolean; is_archived?: boolean }>;
        };
        if (listErr || res.success === false) {
          const message =
            listErr?.message ||
            (typeof res.error === "string" ? res.error : res.error?.message) ||
            "Channel account could not be read";
          accountResults.push({
            owner_id: ownerId,
            owner_email: account?.owner_email ?? null,
            listing_count: 0,
            error: message,
            is_master: masterOwnerId !== "" && masterOwnerId === ownerId,
          });
          continue;
        }

        const listings = res.properties || [];
        const liveListings = listings.filter((l) => l.is_archived !== true);
        accountResults.push({
          owner_id: ownerId,
          owner_email: account?.owner_email ?? null,
          listing_count: liveListings.length,
          error: null,
          is_master: masterOwnerId !== "" && masterOwnerId === ownerId,
        });

        for (const l of listings) {
          const id = String(l.id);
          const local = localByListing.get(id);
          // Archived listings stay in the channel property feed forever (they are
          // only hidden in the channel portal) and never bill, so they are counted
          // and listed apart from anything actionable.
          if (l.is_archived === true) {
            archivedOnChannel.add(id);
            if (!local) {
              archivedOrphans.push({ listing_id: id, name: l.name || "Unnamed listing", owner_id: ownerId });
              continue;
            }
          }
          seenOnChannel.add(id);
          if (!local) {
            orphans.push({
              listing_id: id,
              name: l.name || "Unnamed listing",
              owner_id: ownerId,
              is_archived: false,
            });
            continue;
          }
          matched.push({
            listing_id: id,
            name: l.name || local.label,
            owner_id: ownerId,
            is_archived: l.is_archived === true,
            local_label: local.label,
            local_active: local.isActive,
            kind: local.kind,
          });
        }
      }

      // Local ids the account no longer returns — only trustworthy when at least
      // one account read succeeded, otherwise everything would look stale.
      const anyRead = accountResults.some((a) => a.error === null);
      const stale = anyRead
        ? Array.from(localByListing.values())
            .filter((l) => !seenOnChannel.has(l.listingId) && !archivedOnChannel.has(l.listingId))
            .map((l) => ({
              listing_id: l.listingId,
              label: l.label,
              kind: l.kind,
              record_id: l.recordId,
              property_id: l.propertyId,
              local_active: l.isActive,
            }))
        : [];

      return new Response(
        JSON.stringify({
          success: true,
          reconciled_at: new Date().toISOString(),
          accounts: accountResults,
          // Live listings only — archived ones are reported separately.
          channel_listing_count: seenOnChannel.size,
          archived_count: archivedOnChannel.size,
          archived_orphans: archivedOrphans,
          matched,
          orphans,
          stale,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Purge a single orphan listing id upstream ─────────────────────
    if (raw.scope === "purge_listing") {
      const listingId = String(raw.entity_id);
      let ownerId = raw.owner_id ? String(raw.owner_id) : null;
      if (!ownerId) {
        const { data: acct } = await admin
          .from("ru_owner_accounts")
          .select("ru_owner_id")
          .not("ru_owner_id", "is", null)
          .limit(1)
          .maybeSingle();
        ownerId = acct?.ru_owner_id ? String(acct.ru_owner_id) : null;
      }
      // Any local record pointing at this id is cleared once the archive lands.
      const { data: ownerProp } = await admin
        .from("properties")
        .select("id")
        .eq("rentalsunited_property_id", listingId)
        .maybeSingle();
      // Re-archiving something the channel already reports as archived is a
      // wasted call that looks like a failed clean-up, so honour the caller's
      // "already archived" flag and only clear the local id.
      if (raw.already_archived !== true) {
        const failure = await pushListingStatus(admin, {
          propertyId: ownerProp?.id ?? "",
          ruPropertyId: listingId,
          archive: true,
          ownerId,
        });
        if (failure) return bad(failure, 502);
      }

      await admin.from("properties").update({ rentalsunited_property_id: null }).eq("rentalsunited_property_id", listingId);
      await admin
        .from("hostfully_room_types")
        .update({ rentalsunited_property_id: null })
        .eq("rentalsunited_property_id", listingId);
      await admin.from("ru_archive_events").insert({
        property_id: ownerProp?.id ?? null,
        property_name: `Orphan listing purge (#${listingId})`,
        direction: "archived",
        unit_count: 0,
        listing_count: 1,
        reason: raw.reason ?? "Orphan listing removed during channel reconciliation",
        actor_user_id: userData.user.id,
        actor_email: actorEmail,
        ru_status: "updated",
        detail: `listing ${listingId} archived at the channel manager`,
      });

      return new Response(JSON.stringify({ success: true, listing_id: listingId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Clear a stale local listing id (already gone upstream) ────────
    if (raw.scope === "clear_local_listing") {
      const table = raw.record_kind === "property" ? "properties" : "hostfully_room_types";
      const { error: clearErr } = await admin
        .from(table)
        .update({ rentalsunited_property_id: null })
        .eq("id", raw.entity_id);
      if (clearErr) return bad(clearErr.message, 500);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // ── Purge duplicate listings: deactivated unit records that still hold a
    //    channel listing id. Archive the listing upstream, then clear the id so
    //    the record can never bill or be re-activated onto the channel again. ──
    if (raw.scope === "purge_duplicates") {
      let query = admin
        .from("hostfully_room_types")
        .select("id, name, property_id, rentalsunited_property_id")
        .eq("property_id", raw.entity_id)
        .eq("is_active", false)
        .not("rentalsunited_property_id", "is", null);
      if (raw.unit_id) query = query.eq("id", raw.unit_id);

      const { data: dupes, error: dupErr } = await query;
      if (dupErr) return bad(dupErr.message, 500);
      if (!dupes || dupes.length === 0) {
        return new Response(JSON.stringify({ success: true, purged: 0, failed: 0, results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ownerId = await resolveRuOwnerId(admin, raw.entity_id);
      const results: { name: string; listing_id: string; status: string; detail?: string }[] = [];
      let purged = 0;
      let failed = 0;

      for (const dup of dupes) {
        const listingId = dup.rentalsunited_property_id as string;
        const failure = await pushListingStatus(admin, {
          propertyId: dup.property_id,
          ruPropertyId: listingId,
          archive: true,
          ownerId,
        });
        if (failure) {
          failed += 1;
          results.push({ name: dup.name, listing_id: listingId, status: "ru_failed", detail: failure });
          continue;
        }
        const { error: clearErr } = await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("id", dup.id);
        if (clearErr) {
          failed += 1;
          results.push({ name: dup.name, listing_id: listingId, status: "ru_failed", detail: clearErr.message });
          continue;
        }
        purged += 1;
        results.push({ name: dup.name, listing_id: listingId, status: "purged" });
      }

      await admin.from("ru_archive_events").insert({
        property_id: raw.entity_id,
        property_name: `Duplicate purge (${purged} listing${purged === 1 ? "" : "s"})`,
        direction: "archived",
        unit_count: dupes.length,
        listing_count: purged,
        reason: raw.reason ?? "Duplicate listing purge from channel cost monitor",
        actor_user_id: userData.user.id,
        actor_email: actorEmail,
        ru_status: failed > 0 ? "ru_failed" : "updated",
        detail: results.map((r) => `${r.name}#${r.listing_id}:${r.status}`).join(", ").slice(0, 900),
      });

      return new Response(JSON.stringify({ success: failed === 0, purged, failed, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        const ownerId = await resolveRuOwnerId(admin, unit.property_id);
        const failure = await pushListingStatus(admin, {
          propertyId: unit.property_id,
          ruPropertyId: unit.rentalsunited_property_id,
          archive: unitArchive,
          ownerId,
        });
        if (failure) {
          unitStatus = "ru_failed";
          unitDetail = failure;
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

      // Activation is one act: unlock the building, resume pushes and resync ARI.
      let unitAri: string | null = null;
      let unitAriRetryable = false;
      if (!unitArchive) {
        await admin
          .from("properties")
          .update({ ru_archived: false, ru_archived_at: null, ru_push_enabled: true })
          .eq("id", unit.property_id);

        if (unitStatus !== "ru_failed") {
          try {
            const { data: ariRes, error: ariErr } = await admin.functions.invoke("push-property-to-ru", {
              body: { property_id: unit.property_id, action: "refresh_ari", trigger: "channel_monitor_unit_activation" },
            });
            const res = ariRes as { success?: boolean; error?: { code?: string; message?: string } } | null;
            if (ariErr) {
              unitAri = ariErr.message;
              unitAriRetryable = true;
            } else if (res?.success === false) {
              unitAri = res.error?.message ?? "ARI refresh reported a failure";
              unitAriRetryable = res.error?.code === "RU_UPSTREAM_UNAVAILABLE";
            }
          } catch (e) {
            unitAri = e instanceof Error ? e.message : "ARI refresh failed";
            unitAriRetryable = true;
          }
          if (unitAri) {
            unitDetail = `${unitDetail ? `${unitDetail}; ` : ""}${
              unitAriRetryable ? "ARI re-push will retry" : "ARI re-push failed"
            }: ${unitAri}`;
          }
        }
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
              ari_push_error: unitAri,
              ari_push_retryable: unitAriRetryable,

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
      ari_push_error?: string | null;
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

      const ruOwnerId = await resolveRuOwnerId(admin, p.id);

      if (p.rentalsunited_property_id) {
        const failure = await pushListingStatus(admin, {
          propertyId: p.id,
          ruPropertyId: p.rentalsunited_property_id,
          archive,
          ownerId: ruOwnerId,
        });
        if (failure) {
          status = "ru_failed";
          detail = failure;
        }
      } else {
        detail = "Building has no Rentals United listing of its own — unit listings pushed individually";
      }



      const { error: updErr } = await admin
        .from("properties")
        .update({
          ru_archived: archive,
          ru_archived_at: archive ? new Date().toISOString() : null,
          // Archiving stops further ARI pushes; re-activating resumes them.
          ru_push_enabled: !archive,

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
        const toChange = rows.filter((u) => (u.is_active !== false) === archive);
        const ruUnitFailures: string[] = [];

        // Multi-unit buildings hold their RU listing ids on the units, so the
        // archive/re-activate must be pushed per unit — flipping the local flag
        // alone leaves the listings live at the channel manager.
        for (const u of rows) {
          if (!u.rentalsunited_property_id) continue;
          const failure = await pushListingStatus(admin, {
            propertyId: p.id,
            ruPropertyId: u.rentalsunited_property_id,
            archive,
            ownerId: ruOwnerId,
          });
          if (failure) ruUnitFailures.push(`${u.rentalsunited_property_id}: ${failure}`);
        }


        if (ruUnitFailures.length > 0) {
          status = "ru_failed";
          detail = `${detail ? `${detail}; ` : ""}unit listing push failed → ${ruUnitFailures.join("; ")}`;
        }

        if (toChange.length > 0) {
          const { error: unitErr } = await admin
            .from("hostfully_room_types")
            .update({ is_active: !archive })
            .in(
              "id",
              toChange.map((u) => u.id),
            );
          if (unitErr) {
            detail = `${detail ? `${detail}; ` : ""}unit update failed: ${unitErr.message}`;
          } else {
            unitsChanged = toChange.length;
          }
        }
      }

      // ── Re-activation must resync availability + rates at the channel ──
      // Listings come back live with whatever ARI RU last held, so push a fresh
      // ARI refresh immediately instead of waiting for the daily cron. The activation itself has
      // already succeeded at this point, so a partial/transient ARI outcome is reported as a
      // retryable warning — never as a failed reactivation.
      let ariPush: string | null = null;
      let ariRetryable = false;
      if (!archive && status !== "ru_failed") {
        try {
          const { data: ariRes, error: ariErr } = await admin.functions.invoke("push-property-to-ru", {
            body: { property_id: p.id, action: "refresh_ari", trigger: "channel_monitor_reactivation" },
          });
          const res = ariRes as { success?: boolean; error?: { code?: string; message?: string } } | null;
          if (ariErr) {
            ariPush = ariErr.message;
            ariRetryable = true;
          } else if (res?.success === false) {
            ariPush = res.error?.message ?? "ARI refresh reported a failure";
            ariRetryable = res.error?.code === "RU_UPSTREAM_UNAVAILABLE";
          }
        } catch (e) {
          ariPush = e instanceof Error ? e.message : "ARI refresh failed";
          ariRetryable = true;
        }
        if (ariPush) {
          detail = `${detail ? `${detail}; ` : ""}${ariRetryable ? "ARI re-push will retry" : "ARI re-push failed"}: ${ariPush}`;
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
        ari_push_error: ariPush,
        ari_push_retryable: ariRetryable,
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
