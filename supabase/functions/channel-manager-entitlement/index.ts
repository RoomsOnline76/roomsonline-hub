// Channel Manager entitlement fan-out.
//
// When the billing switch "Channel Manager (Rentals United)" is toggled for a
// property or a portfolio — or when an admin archives a property from the
// Channel Manager cost monitor — every affected property (and its units) must
// be archived (or re-activated) at Rentals United and flagged locally so the
// ROL'OS Channel Manager screen can lock itself and billing stops counting it.
import { readRuRoster } from "../_shared/ruRosterCache.ts";
import { readRuOwnerListingCache, writeRuOwnerListingCache, type RuOwnerListing } from "../_shared/ruOwnerListingCache.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ruCompanyDetailsSatisfied } from "../_shared/ruCompanyDetails.ts";
import { fetchRetiredRuAccounts } from "../_shared/ruRetiredAccounts.ts";
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
    | "clear_local_listing"
    /** Remove/release many listings on one account with a single pair of reads. */
    | "cleanup_batch"
    /** Point a local record at a listing id verified live on the account. */
    | "repoint_local_listing"
    /** Restore an authored unit that is live upstream but inactive locally. */
    | "restore_local_unit";
  entity_id: string;
  /** cleanup_batch: everything to resolve on this account, in order. */
  targets?: Array<{
    type: "listing" | "stale";
    listing_id?: string | null;
    record_id?: string | null;
    record_kind?: "property" | "unit";
    /** Property the stale record belongs to, used to scope it to its account. */
    property_id?: string | null;
    name?: string;

  }>;

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
  /** purge_listing: legacy hint, ignored — presence is now verified upstream. */
  already_archived?: boolean;

  /** clear_local_listing: "property" | "unit" record kind holding the stale id. */
  record_kind?: "property" | "unit";
  /** repoint_local_listing: the listing id to attach once verified live. */
  listing_id?: string;
}


/**
 * A rate-limit deferral is a "come back shortly", not an error: answer 200 so
 * the monitor can show it inline instead of blanking on a 502.
 */
function deferred(message: string) {
  return new Response(JSON.stringify({ success: false, deferred: true, error: message }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
async function distributionPushAllowed(
  admin: ReturnType<typeof createClient>,
  propertyId: string,
  ruOwnerId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!ruOwnerId) {
    return {
      ok: false,
      reason: "Property is unbound — bind the push owner and capture the key & secret before enabling push.",
    };
  }
  const { data: cred } = await admin
    .from("ru_api_credentials")
    .select("access_key")
    .eq("ru_owner_id", ruOwnerId)
    .maybeSingle();
  const { data: acc } = await admin
    .from("ru_owner_accounts")
    .select("id, ru_api_access_key, company_details_sent, company_filled_at")
    .eq("ru_owner_id", ruOwnerId)
    .maybeSingle();
  if (!cred?.access_key && !acc?.ru_api_access_key) {
    return { ok: false, reason: "Sub-account key & secret are not configured — Channel wizard gates are not passed." };
  }
  if (acc && !(await ruCompanyDetailsSatisfied(admin, ruOwnerId, acc)).satisfied) {
    return { ok: false, reason: "Company details have not been sent to Rentals United — push cannot be enabled." };
  }
  return { ok: true };
}

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

type ChannelListing = RuOwnerListing;

/** Read every listing one channel account holds. Errors are returned, never thrown. */
export const QUEUED_READ_MESSAGE =
  "Listing read queued behind the channel rate limit — not counted as empty";

/** A queued read is not a failure: the channel queue drains within a minute. */
async function pullOwnerListingsOnce(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  ctx: ChannelLogCtx,
  opts: { forceFresh?: boolean; cacheOnly?: boolean; allowStale?: boolean; source?: string } = {},
): Promise<{ listings: ChannelListing[]; error: string | null; deferred: boolean; cached?: boolean; fetchedAt?: string | null }> {
  const source = opts.source ?? ctx.parent_action;
  const staleFallback = await readRuOwnerListingCache(admin, ownerId, { allowStale: true });

  if (!opts.forceFresh) {
    const cached = await readRuOwnerListingCache(admin, ownerId);
    if (cached.hit) {
      return { listings: cached.listings, error: null, deferred: false, cached: true, fetchedAt: cached.fetchedAt };
    }
  }

  if (opts.cacheOnly) {
    if (staleFallback.hit) {
      return { listings: staleFallback.listings, error: null, deferred: false, cached: true, fetchedAt: staleFallback.fetchedAt };
    }
    return { listings: [], error: "No cached channel listing snapshot yet — run a manual reconciliation refresh", deferred: false, cached: true, fetchedAt: null };
  }

  const { data, error } = await admin.functions.invoke("rentalsunited-api", {
    body: { action: "list_properties", owner_id: Number(ownerId), deferrable: false, ...ctx },
  });
  const res = (data || {}) as {
    success?: boolean;
    queued?: boolean;
    error?: { message?: string } | string;
    properties?: ChannelListing[];
  };
  const queued = res.queued === true || !Array.isArray(res.properties);
  if (error || res.success === false || queued) {
    const message =
      error?.message ||
      (typeof res.error === "string" ? res.error : res.error?.message) ||
      (queued ? QUEUED_READ_MESSAGE : "Channel account could not be read");
    if (staleFallback.hit && opts.allowStale) {
      return {
        listings: staleFallback.listings,
        error: null,
        deferred: false,
        cached: true,
        fetchedAt: staleFallback.fetchedAt,
      };
    }
    return { listings: [], error: message, deferred: queued && res.success !== false && !error };
  }
  const listings = res.properties || [];
  const fetchedAt = await writeRuOwnerListingCache(admin, ownerId, listings, source);
  return { listings, error: null, deferred: false, cached: false, fetchedAt };
}

/**
 * Read one account's listings once. Rate-limited reads are reported as waiting instead of being
 * retried every 20 seconds; destructive callers explicitly request fresh reads when needed.
 */
async function pullOwnerListings(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  ctx: ChannelLogCtx,
  opts: { forceFresh?: boolean; cacheOnly?: boolean; allowStale?: boolean; source?: string } = {},
): Promise<{ listings: ChannelListing[]; error: string | null; deferred?: boolean; cached?: boolean; fetchedAt?: string | null }> {
  return await pullOwnerListingsOnce(admin, ownerId, ctx, opts);
}

/**
 * A blank account read used to be treated as "unverified" forever, which made the
 * last listing on an account impossible to clean up: the removal succeeded, the
 * account then legitimately answered empty, and every retry refused to run.
 * An empty answer is only trusted when two consecutive successful reads agree.
 */
async function pullOwnerListingsConfirmed(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  ctx: ChannelLogCtx,
  opts: { forceFresh?: boolean; cacheOnly?: boolean; allowStale?: boolean; source?: string } = {},
): Promise<{ listings: ChannelListing[]; error: string | null; deferred?: boolean; confirmedEmpty: boolean; cached?: boolean; fetchedAt?: string | null }> {
  const first = await pullOwnerListings(admin, ownerId, ctx, opts);
  if (first.error) return { ...first, confirmedEmpty: false };
  if (first.listings.length > 0) return { ...first, confirmedEmpty: false };
  const second = await pullOwnerListings(admin, ownerId, ctx, { ...opts, forceFresh: true });
  if (second.error) {
    return {
      listings: [],
      error: `The channel account answered with no listings — the confirming read could not be completed (${second.error})`,
      deferred: second.deferred,
      confirmedEmpty: false,
    };
  }
  if (second.listings.length > 0) return { ...second, confirmedEmpty: false };
  return { listings: [], error: null, deferred: false, confirmedEmpty: true };
}

/**
 * Is this listing id still returned by the account? Archived listings stay in
 * the feed, so "present" here means present in any form — that is the state a
 * cleanup has to actually change.
 */
async function verifyListingPresence(
  admin: ReturnType<typeof createClient>,
  args: { listingId: string; ownerId: string | null; ctx: ChannelLogCtx },
): Promise<{ present: boolean | null; archived: boolean; error: string | null; deferred?: boolean }> {
  if (!args.ownerId) return { present: null, archived: false, error: "No channel account could be resolved" };
  const { listings, error, deferred } = await pullOwnerListingsConfirmed(admin, args.ownerId, args.ctx, { forceFresh: true });
  if (error) return { present: null, archived: false, error, deferred };
  // Two agreeing successful reads: the account really holds nothing, so the
  // listing is genuinely absent and the local id can be released.
  if (listings.length === 0) {
    return { present: false, archived: false, error: null, deferred: false };
  }

  const hit = listings.find((l) => String(l.id) === args.listingId);
  // RU never hard-deletes: a removed listing stays in the feed either flagged
  // archived (NLA) or simply switched inactive (Active="false"). Both mean it
  // no longer sells or bills, so both count as the terminal removed state.
  const notSellable = hit ? hit.is_archived === true || hit.is_active === false : false;
  return { present: !!hit, archived: notSellable, error: null, deferred: false };
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

    // Trusted internal caller: our own scheduled jobs present the service role
    // key, which is not a user JWT. Anything else must resolve to a staff user.
    const isServiceCall = SERVICE_KEY.length > 0 && jwt === SERVICE_KEY;

    let actorEmailResolved: string | null = "system@cron";
    // Audit rows need the actor id outside this block; a service call has none.
    let actorUserId: string | null = null;
    if (!isServiceCall) {
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
      actorEmailResolved = userData.user.email ?? null;
      actorUserId = userData.user.id;
    }


    const actorEmail = actorEmailResolved;

    // One trace per request: the caller may pass its own so a whole "clean up
    // all" run reads as a single chain in the exchange log.
    const traceId = req.headers.get("x-rol-trace-id") || crypto.randomUUID();



    const raw = (await req.json().catch(() => null)) as Body | null;
    const scopes = [
      "property",
      "portfolio",
      "unit",
      "purge_duplicates",
      "reconcile",
      "purge_listing",
      "clear_local_listing",
      "cleanup_batch",
      "repoint_local_listing",
      "restore_local_unit",
    ];
    if (!raw || !scopes.includes(raw.scope)) {
      return bad(`scope must be one of: ${scopes.join(", ")}`);
    }
    if (!raw.entity_id && raw.scope !== "cleanup_batch") return bad("entity_id is required");
    const NO_ENABLED = new Set([
      "purge_duplicates",
      "reconcile",
      "purge_listing",
      "clear_local_listing",
      "cleanup_batch",
      "repoint_local_listing",
      "restore_local_unit",
    ]);

    if (!NO_ENABLED.has(raw.scope) && typeof raw.enabled !== "boolean") {
      return bad("enabled is required");
    }

    // ── Reconcile: read every listing the channel account actually holds and
    //    classify it against local records. Read-only — nothing is mutated. ──
    if (raw.scope === "reconcile") {
      const { data: accounts, error: accErr } = await admin
        .from("ru_owner_accounts")
        .select("id, ru_owner_id, ru_user_id, owner_email, ru_login_email, ru_api_access_key, portfolio_id, property_id")
        .not("ru_owner_id", "is", null);
      if (accErr) return bad(accErr.message, 500);


      const [{ data: props }, { data: units }] = await Promise.all([
        admin.from("properties").select("id, name, is_active, is_trading, ru_push_enabled, rentalsunited_property_id, amenities"),
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
      // Indexed by kind + record id: one listing id can be claimed by several
      // local records (a wrong copy/paste of a unit id onto a property, for
      // example). A single id-keyed map silently dropped all but one of them.
      const localRecords = new Map<string, Local>();
      const localByListing = new Map<string, Local[]>();
      const indexLocal = (l: Local) => {
        localRecords.set(`${l.kind}:${l.recordId}`, l);
        const bucket = localByListing.get(l.listingId);
        if (bucket) bucket.push(l);
        else localByListing.set(l.listingId, [l]);
      };
      const propertyNames = new Map<string, string>();
      for (const p of (props || []) as Array<Record<string, unknown>>) {
        propertyNames.set(p.id as string, ((p.name as string) || "Untitled property"));
      }
      for (const p of (props || []) as Array<Record<string, unknown>>) {
        const lid = p.rentalsunited_property_id as string | null;
        if (!lid) continue;
        indexLocal({
          listingId: String(lid),
          kind: "property",
          recordId: p.id as string,
          propertyId: p.id as string,
          label: (p.name as string) || "Untitled property",
          isActive: p.is_active !== false,
        });
      }
      for (const u of (units || []) as Array<Record<string, unknown>>) {
        const lid = u.rentalsunited_property_id as string | null;
        if (!lid) continue;
        indexLocal({
          listingId: String(lid),
          kind: "unit",
          recordId: u.id as string,
          propertyId: u.property_id as string,
          label: `${propertyNames.get(u.property_id as string) || "Property"} — ${(u.name as string) || "Unit"}`,
          isActive: u.is_active !== false,
        });
      }

      // The master/parent account may never hold listings in a white-label
      // integration, so flag it explicitly rather than assume it is clean.
      const masterOwnerId = (Deno.env.get("RU_OWNER_ID") || "").trim();

      type BoundAcct = {
        owner_email: string | null;
        login_email: string | null;
        access_key: string | null;
      };
      const boundByOwner = new Map<string, BoundAcct>();
      for (const a of (accounts || []) as Array<Record<string, unknown>>) {
        boundByOwner.set(String(a.ru_owner_id), {
          owner_email: (a.owner_email as string) ?? null,
          login_email: (a.ru_login_email as string) ?? null,
          access_key: (a.ru_api_access_key as string) ?? null,
        });
      }

      // Keys can live on the per-OwnerID credential store as well as the bound row.
      const { data: credRows } = await admin
        .from("ru_api_credentials")
        .select("ru_owner_id, login_email, access_key")
        .not("access_key", "is", null);
      const credByOwner = new Map<string, string | null>();
      for (const c of (credRows || []) as Array<Record<string, unknown>>) {
        if (c.ru_owner_id) credByOwner.set(String(c.ru_owner_id), (c.login_email as string) ?? null);
      }

      // Retired test sub-accounts: never read, never counted, never alerted on. They
      // are reported once as an explicit exclusion so the numbers stay auditable.
      const retiredAccounts = await fetchRetiredRuAccounts();
      const retiredOwnerIds = new Set(retiredAccounts.map((r) => r.ru_owner_id));

      // Roster straight from the channel: accounts ROL'OS never bound still hold
      // listings (and still bill), so reading only our own table under-reports.
      type RosterEntry = {
        owner_id: string;
        portal_email: string | null;
        portal_contact_email: string | null;
        portal_name: string | null;
      };
      const roster = new Map<string, RosterEntry>();
      let rosterError: string | null = null;
      {
        // Reconciliation is the one caller that may spend a wire read (nightly), and its
        // answer feeds the shared roster cache so nothing else has to read again.
        // Reconciliation may spend a wire read, but only when the shared cache is actually
        // stale — two reconciles in the same window reuse the first answer rather than
        // re-opening the Pull_ListMyUsers_RQ storm.
        const rosterRead = await readRuRoster(admin, { maxAgeMs: 5 * 60 * 1000, source: "channel-reconcile" });
        const usersErr = rosterRead.ok ? null : { message: rosterRead.message };
        const usersRes = rosterRead.ok ? { success: true, users: rosterRead.users } : { success: false, error: { message: rosterRead.message } };
        const ures = (usersRes || {}) as {
          success?: boolean;
          error?: { message?: string } | string;
          users?: Array<{
            owner_id?: string;
            email?: string;
            login_email?: string;
            first_name?: string;
            last_name?: string;
          }>;
        };
        if (usersErr || ures.success === false) {
          rosterError =
            usersErr?.message ||
            (typeof ures.error === "string" ? ures.error : ures.error?.message) ||
            "The channel sub-account roster could not be read — only accounts known to ROL'OS were reconciled";
        } else {
          for (const u of ures.users || []) {
            const oid = String(u.owner_id || "").trim();
            if (!oid || retiredOwnerIds.has(oid)) continue;
            const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
            // The portal LOGIN (`<UserName>`) is the account's identity. The roster's
            // `<Email>` is only the contact address and can lag behind it (OwnerID
            // 741765 logs in as connect@ while the list still reports rooms@), so
            // naming an account by `<Email>` prints the wrong login.
            roster.set(oid, {
              owner_id: oid,
              portal_email: u.login_email || u.email || null,
              portal_contact_email: u.email || null,
              portal_name: name || null,
            });
          }
        }
      }

      // Detached: bound locally, but the master account's roster no longer returns it.
      // Our keys can no longer authorise a read of that account (sub-account inventory
      // is only readable AS that sub-account), so it is excluded from every count
      // instead of being read, failed and alerted on forever. If the roster read itself
      // failed we keep the old back-fill — "no answer" must never read as "gone".
      const detachedOwnerIds = new Set<string>();
      for (const ownerId of boundByOwner.keys()) {
        if (roster.has(ownerId) || retiredOwnerIds.has(ownerId)) continue;
        if (rosterError === null) {
          detachedOwnerIds.add(ownerId);
          continue;
        }
        const acct = boundByOwner.get(ownerId)!;
        roster.set(ownerId, {
          owner_id: ownerId,
          portal_email: acct.login_email || acct.owner_email,
          portal_contact_email: acct.owner_email ?? null,
          portal_name: null,
        });
      }

      // Exclusion must stay auditable: carry each detached account's last known live
      // listing count from the previous stored pass. A non-zero count is a billing
      // question for the channel, not something our API can settle.
      const detachedAccounts: Array<{
        owner_id: string;
        owner_label: string;
        login_email: string | null;
        last_known_listing_count: number | null;
        last_seen_at: string | null;
        needs_billing_verification: boolean;
      }> = [];
      if (detachedOwnerIds.size > 0) {
        const lastKnown = new Map<string, { count: number; at: string }>();
        try {
          const { data: runs } = await admin
            .from("channel_reconciliation_runs")
            .select("created_at, findings")
            .order("created_at", { ascending: false })
            .limit(20);
          for (const run of (runs || []) as Array<{ created_at: string; findings: unknown }>) {
            const f = (run.findings || {}) as {
              monitored_accounts?: Array<{ owner_id?: string; listing_count?: number }>;
              unmonitored_accounts?: Array<{ owner_id?: string; listing_count?: number }>;
            };
            for (const a of [...(f.monitored_accounts || []), ...(f.unmonitored_accounts || [])]) {
              const oid = String(a.owner_id ?? "").trim();
              if (!oid || !detachedOwnerIds.has(oid) || lastKnown.has(oid)) continue;
              lastKnown.set(oid, { count: Number(a.listing_count ?? 0), at: run.created_at });
            }
          }
        } catch (e) {
          console.warn(
            "[channel-manager-entitlement] could not read the last reconciliation snapshot for detached accounts:",
            e instanceof Error ? e.message : e,
          );
        }
        for (const ownerId of detachedOwnerIds) {
          const acct = boundByOwner.get(ownerId)!;
          const seen = lastKnown.get(ownerId) ?? null;
          const login = acct.login_email || acct.owner_email || credByOwner.get(ownerId) || null;
          detachedAccounts.push({
            owner_id: ownerId,
            owner_label: `${login || "Unnamed sub-account"} · OwnerID ${ownerId}`,
            login_email: login,
            last_known_listing_count: seen ? seen.count : null,
            last_seen_at: seen ? seen.at : null,
            // Unknown counts are treated as "verify" too: silence is not proof of zero.
            needs_billing_verification: seen === null || seen.count > 0,
          });
        }
        console.log(
          `[channel-manager-entitlement] reconcile: excluded ${detachedAccounts.length} detached sub-account(s) no longer under the master: ${[...detachedOwnerIds].join(", ")}`,
        );
      }

      const ownerIds = Array.from(roster.keys());


      // One canonical way to name a sub-account everywhere it is reported. The
      // account IS its portal login: our local `owner_email` is the PROPERTY owner's
      // address and the roster's `<Email>` can lag behind a login rename, so neither
      // may be printed as a second "contact" — that made OwnerID 741765 read as
      // connect@ "(contact rooms@)" when its contact address is also connect@.
      const accountLabel = (ownerId: string) => {
        const r = roster.get(ownerId);
        const acct = boundByOwner.get(ownerId);
        const login = acct?.login_email || r?.portal_email || credByOwner.get(ownerId) || null;
        return `${login || r?.portal_name || "Unnamed sub-account"} · OwnerID ${ownerId}`;
      };


      const accountResults: Array<{
        owner_id: string;
        owner_email: string | null;
        login_email: string | null;
        contact_email: string | null;
        owner_label: string;
        bound: boolean;
        has_keys: boolean;
        /**
         * In scope for monitoring: bound to a ROL'OS property/portfolio AND holding
         * stored keys. Retired test / archived sub-accounts fail this and must never
         * raise a reconciliation warning.
         */
        monitored: boolean;
        listing_count: number;
        archived_count?: number;
        total_listing_count?: number;
        /** The account really answered with its listing set on this pass. */
        read?: boolean;
        /** Not read because the channel rate-limited/queued the pull. */
        deferred?: boolean;
        /** Served from the persisted listing snapshot instead of a fresh channel read. */
        cached?: boolean;
        /** Timestamp of the listing snapshot used for this account. */
        fetched_at?: string | null;
        error: string | null;
        is_master: boolean;
      }> = [];

      // Every listing is classified exactly once, so the buckets always add up
      // to the account totals instead of counting an archived-but-linked
      // listing as live as well as archived.
      const liveOnChannel = new Set<string>();
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
      // Local ids that point at a listing the channel has already archived: the
      // record looks connected but nothing it points at can sell.
      const archivedMatched: Array<{
        listing_id: string;
        name: string;
        owner_id: string;
        local_label: string;
        kind: "property" | "unit";
        record_id: string;
        property_id: string;
        local_active: boolean;
        live_alternative_id: string | null;
      }> = [];
      // Every live listing, kept so same-name copies on one account can be grouped afterwards.
      const liveRows: Array<{ listing_id: string; name: string; owner_id: string; matched: boolean }> = [];
      // Listings held by a sub-account ROL'OS has not bound. These are NOT orphans
      // to delete — they belong to another account and are only reported.
      const foreignListings: Array<{
        listing_id: string;
        name: string;
        owner_id: string;
        owner_label: string;
        is_archived: boolean;
        local_label: string | null;
        kind: "property" | "unit" | null;
        record_id: string | null;
        property_id: string | null;
      }> = [];
      // Anything seen on any account (bound or not) — a local id pointing here is not stale.
      const seenAnywhere = new Set<string>();



      // The channel rate-limits repeated pulls, so a large account list can
      // outrun the function wall clock and the caller only ever sees a 502.
      // Each read is bounded, and once the overall budget is spent the rest of
      // the accounts are reported as "not read" instead of killing the request.
      const startedAt = Date.now();
      const TOTAL_BUDGET_MS = 45_000;
      const PER_ACCOUNT_MS = 15_000;

      for (const ownerId of ownerIds) {
        const acct = boundByOwner.get(ownerId);
        const bound = Boolean(acct);
        const hasKeys = Boolean(acct?.access_key) || credByOwner.has(ownerId);
        const rosterEntry = roster.get(ownerId);
        const loginEmail = acct?.login_email || rosterEntry?.portal_email || credByOwner.get(ownerId) || null;
        const base = {
          owner_id: ownerId,
          owner_email: loginEmail,
          login_email: loginEmail,
          // Contact address of the SUB-ACCOUNT — defaults to its login, since a
          // stale roster `<Email>` is not a different address, just an old one.
          contact_email:
            acct?.login_email ?? rosterEntry?.portal_email ?? rosterEntry?.portal_contact_email ?? null,
          owner_label: accountLabel(ownerId),
          bound,
          has_keys: hasKeys,
          monitored: bound && hasKeys,
          is_master: masterOwnerId !== "" && masterOwnerId === ownerId,
        };

        if (Date.now() - startedAt > TOTAL_BUDGET_MS) {
          accountResults.push({
            ...base,
            listing_count: 0,
            error: "Not read — reconciliation time budget reached, run again to finish this account",
          });
          continue;
        }

        // Sub-account inventory can only be read as that sub-account. Without its
        // key pair the account is reported as unread rather than silently skipped.
        if (!hasKeys) {
          accountResults.push({
            ...base,
            listing_count: 0,
            error:
              "No keys — this sub-account's AccessKey + SecretKey are not stored, so its listings could not be read",
          });
          continue;
        }

        const listResult = await Promise.race([
          pullOwnerListings(admin, ownerId, logCtx(traceId, "channel-reconcile:pull_listings"), {
            allowStale: true,
            source: "channel-reconcile",
          }),
          new Promise<{ listings: ChannelListing[]; error: string; deferred: boolean; cached?: boolean; fetchedAt?: string | null }>((resolve) =>
            setTimeout(
              () => resolve({ listings: [], error: "Channel account read timed out — try again shortly", deferred: false }),
              PER_ACCOUNT_MS,
            ),
          ),
        ]);
        if (listResult.error) {
          accountResults.push({
            ...base,
            listing_count: 0,
            read: false,
            deferred: listResult.deferred === true,
            error: listResult.error,
          });
          continue;
        }

        let listings = listResult.listings || [];
        // Only bound accounts are expected to hold ROL'OS ids; an empty answer
        // from one of those while local records still point somewhere is checked
        // twice before it is believed — but once two reads agree, the account
        // really is empty and those local ids are stale (clearable), not
        // unverifiable forever.
        const localIdsHeld = bound ? localRecords.size : 0;
        if (listings.length === 0 && localIdsHeld > 0) {
          const confirm = await pullOwnerListings(admin, ownerId, logCtx(traceId, "channel-reconcile:confirm_empty"), { forceFresh: true });
          if (confirm.error) {
            accountResults.push({
              ...base,
              listing_count: 0,
              read: false,
              deferred: confirm.deferred === true,
              error: `Unverifiable — the account answered empty and the confirming read failed (${confirm.error})`,
            });
            continue;
          }
          listings = confirm.listings;
        }

        const liveListings = listings.filter((l) => l.is_archived !== true);
        accountResults.push({
          ...base,
          listing_count: liveListings.length,
          archived_count: listings.length - liveListings.length,
          total_listing_count: listings.length,
          read: true,
          deferred: false,
          cached: listResult.cached === true,
          fetched_at: listResult.fetchedAt ?? null,
          error: null,
        });

        for (const l of listings) {
          const id = String(l.id);
          const locals = localByListing.get(id) || [];
          const name = l.name || locals[0]?.label || "Unnamed listing";
          seenAnywhere.add(id);

          // Listings on an account ROL'OS has not bound belong to someone else's
          // sub-account: reported, never classified as our orphans or duplicates.
          if (!bound) {
            if (locals.length === 0) {
              foreignListings.push({
                listing_id: id,
                name,
                owner_id: ownerId,
                owner_label: base.owner_label,
                is_archived: l.is_archived === true,
                local_label: null,
                kind: null,
                record_id: null,
                property_id: null,
              });
            } else {
              for (const local of locals) {
                foreignListings.push({
                  listing_id: id,
                  name,
                  owner_id: ownerId,
                  owner_label: base.owner_label,
                  is_archived: l.is_archived === true,
                  local_label: local.label,
                  kind: local.kind,
                  record_id: local.recordId,
                  property_id: local.propertyId,
                });
              }
            }
            continue;
          }

          // Archived listings stay in the channel property feed forever (they are
          // only hidden in the channel portal) and never sell or bill. They are
          // classified here and never counted as live as well.
          if (l.is_archived === true) {
            archivedOnChannel.add(id);
            if (locals.length === 0) {
              archivedOrphans.push({ listing_id: id, name, owner_id: ownerId });
              continue;
            }
            for (const local of locals) {
              archivedMatched.push({
                listing_id: id,
                name,
                owner_id: ownerId,
                local_label: local.label,
                kind: local.kind,
                record_id: local.recordId,
                property_id: local.propertyId,
                local_active: local.isActive,
                live_alternative_id: null,
              });
            }
            continue;
          }

          liveOnChannel.add(id);
          liveRows.push({ listing_id: id, name, owner_id: ownerId, matched: locals.length > 0 });
          if (locals.length === 0) {
            orphans.push({ listing_id: id, name, owner_id: ownerId, is_archived: false });
            continue;
          }

          for (const local of locals) {
            matched.push({
              listing_id: id,
              name,
              owner_id: ownerId,
              is_archived: false,
              local_label: local.label,
              local_active: local.isActive,
              kind: local.kind,
            });
          }
        }
      }



      /**
       * Same-name copies on one account. Repeated creates put several listings on the account for
       * one real unit; only one of them is the listing ROL'OS points at, so the rest are surplus
       * (they still bill). The keeper is the matched listing, otherwise the lowest id — the
       * oldest, which is the one the channel portal history is attached to.
       */
      const dupGroups = new Map<string, typeof liveRows>();
      for (const row of liveRows) {
        const key = `${row.owner_id}::${row.name.trim().toLowerCase()}`;
        const bucket = dupGroups.get(key);
        if (bucket) bucket.push(row);
        else dupGroups.set(key, [row]);
      }
      const duplicates: Array<{
        listing_id: string;
        name: string;
        owner_id: string;
        keep_listing_id: string;
        copies: number;
        /** Does a local record point at this surplus copy (mis-wired) or is it unmatched? */
        matched: boolean;
      }> = [];
      for (const rows of dupGroups.values()) {
        if (rows.length < 2) continue;
        const keeper =
          rows.find((r) => r.matched) ??
          [...rows].sort((a, b) => Number(a.listing_id) - Number(b.listing_id))[0];
        for (const r of rows) {
          if (r.listing_id === keeper.listing_id) continue;
          duplicates.push({
            listing_id: r.listing_id,
            name: r.name,
            owner_id: r.owner_id,
            keep_listing_id: keeper.listing_id,
            copies: rows.length,
            matched: r.matched,
          });
        }

      }



      /**
       * One listing, one class. A surplus same-name copy that no local record
       * points at was previously counted as an orphan *and* as a duplicate, so
       * the tiles added up to more problems than the account holds. Duplicate
       * wins: it is the actionable description of that listing.
       */
      const duplicateIds = new Set(duplicates.map((d) => d.listing_id));
      for (let i = orphans.length - 1; i >= 0; i--) {
        if (duplicateIds.has(orphans[i].listing_id)) orphans.splice(i, 1);
      }


      // A record whose id is archived upstream usually has a live twin under the
      // same unit name — that is the listing it should point at.
      const liveByName = new Map<string, string[]>();
      for (const row of liveRows) {
        const key = `${row.owner_id}::${row.name.trim().toLowerCase()}`;
        const bucket = liveByName.get(key);
        if (bucket) bucket.push(row.listing_id);
        else liveByName.set(key, [row.listing_id]);
      }
      for (const row of archivedMatched) {
        const unitName = row.local_label.split("—").pop()?.trim() || row.name;
        const candidates =
          liveByName.get(`${row.owner_id}::${row.name.trim().toLowerCase()}`) ||
          liveByName.get(`${row.owner_id}::${unitName.toLowerCase()}`) ||
          [];
        // Newest live copy: the one the most recent push created.
        row.live_alternative_id = candidates.length
          ? [...candidates].sort((a, b) => Number(b) - Number(a))[0]
          : null;
      }

      // One listing id claimed by more than one local record — a mis-wired id.
      const conflicts: Array<{
        listing_id: string;
        records: Array<{
          kind: "property" | "unit";
          record_id: string;
          property_id: string;
          label: string;
          local_active: boolean;
        }>;
      }> = [];
      for (const [listingId, locals] of localByListing.entries()) {
        if (locals.length < 2) continue;
        conflicts.push({
          listing_id: listingId,
          records: locals.map((l) => ({
            kind: l.kind,
            record_id: l.recordId,
            property_id: l.propertyId,
            label: l.label,
            local_active: l.isActive,
          })),
        });
      }

      // Local ids no account returns. "Stale" is a deletion verdict, so it may only
      // be issued when EVERY account that could hold ROL'OS listings actually
      // answered. If any of them was deferred, timed out, unreadable or answered
      // empty, the unseen ids are reported as unverified instead — the cleanup path
      // must never act on a read that did not happen.
      const unreadAccounts = accountResults.filter((a) => a.error !== null && (a.bound || a.monitored));
      const allAccountsRead = unreadAccounts.length === 0 && accountResults.some((a) => a.read === true);
      const unseen = Array.from(localRecords.values())
        .filter((l) => !seenAnywhere.has(l.listingId))
        .map((l) => ({
          listing_id: l.listingId,
          label: l.label,
          kind: l.kind,
          record_id: l.recordId,
          property_id: l.propertyId,
          local_active: l.isActive,
        }));
      const stale = allAccountsRead ? unseen : [];
      const unverified = allAccountsRead ? [] : unseen;

      const accountTotal = accountResults.reduce(
        (sum, a) => sum + (a.total_listing_count ?? a.listing_count),
        0,
      );
      const boundAccountTotal = accountResults
        .filter((a) => a.bound)
        .reduce((sum, a) => sum + (a.total_listing_count ?? a.listing_count), 0);

      /**
       * Per-property footprint. Counting only listings the channel returns hides the
       * other half of the disconnect: an active unit that holds no listing id at all,
       * or a listing id parked on a unit that is no longer active. Both are reported
       * so "some units are missing" is visible instead of implied.
       */
      const unitsByProperty = new Map<string, Array<Record<string, unknown>>>();
      for (const u of (units || []) as Array<Record<string, unknown>>) {
        const pid = String(u.property_id);
        const bucket = unitsByProperty.get(pid);
        if (bucket) bucket.push(u);
        else unitsByProperty.set(pid, [u]);
      }
      const footprint: Array<{
        property_id: string;
        property_name: string;
        push_enabled: boolean;
        building_listing_id: string | null;
        active_units: number;
        units_with_listing: number;
        units_without_listing: Array<{ record_id: string; name: string }>;
        inactive_units_with_listing: Array<{ record_id: string; name: string; listing_id: string }>;
        live_on_channel: number;
        archived_on_channel: number;
      }> = [];
      for (const p of (props || []) as Array<Record<string, unknown>>) {
        const pid = p.id as string;
        const pUnits = unitsByProperty.get(pid) || [];
        const buildingId = (p.rentalsunited_property_id as string | null) ?? null;
        const holdsFootprint =
          Boolean(buildingId) || pUnits.some((u) => Boolean(u.rentalsunited_property_id)) || p.ru_push_enabled === true;
        if (!holdsFootprint) continue;

        const activeUnits = pUnits.filter((u) => u.is_active !== false);
        const ids = [
          ...(buildingId ? [buildingId] : []),
          ...pUnits.map((u) => u.rentalsunited_property_id as string | null).filter(Boolean) as string[],
        ];
        footprint.push({
          property_id: pid,
          property_name: (p.name as string) || "Untitled property",
          push_enabled: p.ru_push_enabled === true,
          building_listing_id: buildingId,
          active_units: activeUnits.length,
          units_with_listing: activeUnits.filter((u) => Boolean(u.rentalsunited_property_id)).length,
          units_without_listing: activeUnits
            .filter((u) => !u.rentalsunited_property_id)
            .map((u) => ({ record_id: u.id as string, name: (u.name as string) || "Unit" })),
          inactive_units_with_listing: pUnits
            .filter((u) => u.is_active === false && Boolean(u.rentalsunited_property_id))
            .map((u) => ({
              record_id: u.id as string,
              name: (u.name as string) || "Unit",
              listing_id: String(u.rentalsunited_property_id),
            })),
          live_on_channel: ids.filter((id) => liveOnChannel.has(id)).length,
          archived_on_channel: ids.filter((id) => archivedOnChannel.has(id)).length,
        });
      }
      const untrackedUnitCount = footprint.reduce((s, f) => s + f.units_without_listing.length, 0);
      const inactiveHeldCount = footprint.reduce((s, f) => s + f.inactive_units_with_listing.length, 0);
      const propertyById = new Map(
        ((props || []) as Array<Record<string, unknown>>).map((p) => [String(p.id), p]),
      );
      const recoverableInactiveUnits = footprint.flatMap((f) => {
        const property = propertyById.get(f.property_id);
        const amenities = (property?.amenities || {}) as {
          room_types?: Array<{ name?: string; is_active?: boolean }>;
        };
        const authoredNames = new Set(
          (amenities.room_types || [])
            .filter((room) => room.is_active !== false)
            .map((room) => String(room.name || "").trim().toLowerCase())
            .filter(Boolean),
        );
        return f.inactive_units_with_listing
          .filter(
            (unit) =>
              liveOnChannel.has(unit.listing_id) && authoredNames.has(unit.name.trim().toLowerCase()),
          )
          .map((unit) => ({ ...unit, property_id: f.property_id }));
      });

      /**
       * Single-account rule. Every ROL'OS listing must live on the monitored
       * sub-account(s). A live listing anywhere else is a violation, and an account
       * we cannot read is reported as unverifiable rather than assumed empty.
       */
      const allowedOwnerIds = accountResults.filter((a) => a.monitored).map((a) => a.owner_id);
      const allowedSet = new Set(allowedOwnerIds);
      const ownerViolations = accountResults
        .filter((a) => !allowedSet.has(a.owner_id) && a.listing_count > 0)
        .map((a) => ({
          owner_id: a.owner_id,
          owner_label: a.owner_label,
          live_listing_count: a.listing_count,
        }));
      const unverifiableAccounts = accountResults
        .filter((a) => a.error !== null)
        .map((a) => ({
          owner_id: a.owner_id,
          owner_label: a.owner_label,
          bound: a.bound,
          has_keys: a.has_keys,
          reason: a.error as string,
        }));

      return new Response(
        JSON.stringify({
          success: true,
          reconciled_at: new Date().toISOString(),
          accounts: accountResults,
          roster_error: rosterError,
          // Retired test sub-accounts, excluded from every number above.
          retired_accounts: retiredAccounts,
          // Bound accounts the master no longer lists — excluded from every number
          // above, reported so the exclusion (and any billing question) is auditable.
          detached_accounts: detachedAccounts,
          // Mutually exclusive: live + archived always equals the bound-account total.
          channel_listing_count: liveOnChannel.size,
          archived_count: archivedOnChannel.size,
          account_listing_total: boundAccountTotal,
          all_account_listing_total: accountTotal,
          foreign_listings: foreignListings,
          foreign_listing_count: foreignListings.length,
          archived_orphans: archivedOrphans,
          archived_matched: archivedMatched,
          conflicts,
          matched,

          orphans,
          duplicates,
          stale,
          /** Unseen local ids from a pass where some account was not read. Never cleanup targets. */
          unverified,
          /** Every account that could hold ROL'OS listings answered on this pass. */
          read_complete: allAccountsRead,
          unread_owner_ids: unreadAccounts.map((a) => a.owner_id),
          footprint,
          untracked_unit_count: untrackedUnitCount,
          inactive_units_holding_listings: inactiveHeldCount,
          recoverable_inactive_units: recoverableInactiveUnits,
          allowed_owner_ids: allowedOwnerIds,
          owner_violations: ownerViolations,
          unverifiable_accounts: unverifiableAccounts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },

      );

    }

    // ── Remove a single listing id upstream: verify → delete → verify ─
    //    A Status 0 envelope is never treated as proof. The local id is only
    //    cleared once the account stops returning the listing.
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
      const { data: ownerProp } = await admin
        .from("properties")
        .select("id")
        .eq("rentalsunited_property_id", listingId)
        .maybeSingle();
      const propertyId = ownerProp?.id ?? "";

      // 1. Is it actually still there?
      const before = await verifyListingPresence(admin, {
        listingId,
        ownerId,
        ctx: logCtx(traceId, "channel-cleanup:verify"),
      });
      if (before.error) return before.deferred ? deferred(before.error) : bad(before.error, 502);

      let outcome: "already_gone" | "deleted" | "refused" = "already_gone";
      let method: "deleted" | "archived" | "none" = "none";
      let detail = `listing ${listingId} was no longer held by the channel account`;

      if (before.present) {
        // 2. Remove it for real.
        const removal = await removeListingUpstream(admin, {
          propertyId,
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:delete"),
        });
        if (removal.error) return bad(removal.error, 502);
        method = removal.method;

        // 3. Confirm against the account, not against the reply.
        const after = await verifyListingPresence(admin, {
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:verify_after"),
        });
        if (after.error) return after.deferred ? deferred(after.error) : bad(after.error, 502);

        // The channel does not hard-delete listings: an archived listing stays in
        // the owner list flagged as archived. That is the terminal removed state —
        // it stops selling and billing — so it counts as success. Only a listing
        // that is still live (present and not archived) is a refusal.
        if (after.present && !after.archived) {
          outcome = "refused";
          detail = `listing ${listingId} is still live on the channel account after a ${method} request`;
        } else if (after.present && after.archived) {
          outcome = "deleted";
          detail = `listing ${listingId} confirmed archived on the channel account (no longer sellable)`;
        } else {
          outcome = "deleted";
          detail = `listing ${listingId} confirmed removed from the channel account (${method})`;
        }

      }

      // The local id is only released on a confirmed absence.
      if (outcome !== "refused") {
        await admin
          .from("properties")
          .update({ rentalsunited_property_id: null })
          .eq("rentalsunited_property_id", listingId);
        await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("rentalsunited_property_id", listingId);
      }

      await admin.from("ru_archive_events").insert({
        property_id: ownerProp?.id ?? null,
        property_name: `Listing cleanup (#${listingId})`,
        direction: "archived",
        unit_count: 0,
        listing_count: outcome === "refused" ? 0 : 1,
        reason: raw.reason ?? "Listing removed during channel reconciliation",
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        ru_status: outcome === "refused" ? "ru_failed" : "updated",
        detail,
      });

      return new Response(
        JSON.stringify({
          success: outcome !== "refused",
          listing_id: listingId,
          outcome,
          method,
          trace_id: traceId,
          detail,
          ...(outcome === "refused" ? { error: detail } : {}),
        }),
        { status: outcome === "refused" ? 409 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // ── Release a local listing id — archiving upstream first ─────────
    //    Never a blind local clear: if the account still holds the listing it is
    //    archived (verify → archive → verify) before the id is released, so an id
    //    can never be dropped locally while the listing keeps selling and billing.
    if (raw.scope === "clear_local_listing") {
      const table = raw.record_kind === "property" ? "properties" : "hostfully_room_types";
      const { data: record } = await admin
        .from(table)
        .select("id, rentalsunited_property_id")
        .eq("id", raw.entity_id)
        .maybeSingle();
      const listingId = record?.rentalsunited_property_id
        ? String(record.rentalsunited_property_id)
        : null;

      let ownerId = raw.owner_id ? String(raw.owner_id) : null;
      if (!ownerId && listingId) {
        const propertyIdForOwner =
          raw.record_kind === "property" ? String(raw.entity_id) : null;
        if (propertyIdForOwner) {
          ownerId = await resolveRuOwnerId(admin, propertyIdForOwner);
        } else {
          const { data: unit } = await admin
            .from("hostfully_room_types")
            .select("property_id")
            .eq("id", raw.entity_id)
            .maybeSingle();
          if (unit?.property_id) ownerId = await resolveRuOwnerId(admin, String(unit.property_id));
        }
        if (!ownerId) {
          const { data: acct } = await admin
            .from("ru_owner_accounts")
            .select("ru_owner_id")
            .not("ru_owner_id", "is", null)
            .limit(1)
            .maybeSingle();
          ownerId = acct?.ru_owner_id ? String(acct.ru_owner_id) : null;
        }
      }

      let outcome: "already_gone" | "archived" | "refused" | "no_listing_id" = "no_listing_id";
      let detail = "record held no channel listing id";

      if (listingId) {
        const before = await verifyListingPresence(admin, {
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:verify"),
        });
        if (before.error) return before.deferred ? deferred(before.error) : bad(before.error, 502);

        if (!before.present) {
          outcome = "already_gone";
          detail = `listing ${listingId} is no longer held by the channel account`;
        } else if (before.archived) {
          outcome = "archived";
          detail = `listing ${listingId} was already archived on the channel account`;
        } else {
          const propertyIdForRemoval =
            raw.record_kind === "property" ? String(raw.entity_id) : "";
          const removal = await removeListingUpstream(admin, {
            propertyId: propertyIdForRemoval,
            listingId,
            ownerId,
            ctx: logCtx(traceId, "channel-cleanup:delete"),
          });
          if (removal.error) return bad(removal.error, 502);

          const after = await verifyListingPresence(admin, {
            listingId,
            ownerId,
            ctx: logCtx(traceId, "channel-cleanup:verify_after"),
          });
          if (after.error) return after.deferred ? deferred(after.error) : bad(after.error, 502);

          if (after.present && !after.archived) {
            outcome = "refused";
            detail = `listing ${listingId} is still live on the channel account after a ${removal.method} request — the local id was kept`;
          } else {
            outcome = "archived";
            detail = `listing ${listingId} confirmed no longer sellable on the channel account (${removal.method})`;
          }
        }

        await admin.from("ru_archive_events").insert({
          property_id: raw.record_kind === "property" ? raw.entity_id : null,
          property_name: `Listing release (#${listingId})`,
          direction: "archived",
          unit_count: raw.record_kind === "property" ? 0 : 1,
          listing_count: outcome === "refused" ? 0 : 1,
          reason: raw.reason ?? "Local listing id released during channel reconciliation",
          actor_user_id: actorUserId,
          actor_email: actorEmail,
          ru_status: outcome === "refused" ? "ru_failed" : "updated",
          detail,
        });

        if (outcome === "refused") {
          return new Response(
            JSON.stringify({ success: false, outcome, listing_id: listingId, trace_id: traceId, detail, error: detail }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const { error: clearErr } = await admin
        .from(table)
        .update({ rentalsunited_property_id: null })
        .eq("id", raw.entity_id);
      if (clearErr) return bad(clearErr.message, 500);
      return new Response(
        JSON.stringify({ success: true, outcome, listing_id: listingId, trace_id: traceId, detail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Bulk cleanup for one channel account: one pull, N removals, one pull ─
    //    The per-row scopes above each cost two full account reads (and each of
    //    those can sit out the rate-limit ladder for up to a minute), which is
    //    what made "Clean up all" take minutes per listing. Here the account is
    //    read once for presence, every target is removed against that snapshot,
    //    and a single verification read at the end decides deleted vs refused.
    if (raw.scope === "cleanup_batch") {
      const targets = Array.isArray(raw.targets) ? raw.targets : [];
      if (targets.length === 0) return bad("targets is required", 400);

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
      if (!ownerId) return bad("No channel account could be resolved", 400);

      const startedAt = Date.now();
      const BUDGET_MS = 12 * 60 * 1000;

      // 1. One presence read for the whole run (empty answers confirmed twice).
      const snapshot = await pullOwnerListingsConfirmed(admin, ownerId, logCtx(traceId, "channel-cleanup:verify"), { forceFresh: true });
      if (snapshot.error) {
        return snapshot.deferred ? deferred(snapshot.error) : bad(snapshot.error, 502);
      }
      // A single blank read is unverified — but two agreeing reads mean the account
      // genuinely holds nothing, so every target is already gone and its local id
      // can be released instead of the run refusing forever.
      if (snapshot.listings.length === 0 && !snapshot.confirmedEmpty) {
        return deferred(
          "The channel account answered with no listings at all — nothing was verified, so no cleanup was run",
        );
      }

      const heldNow = new Map<string, boolean>(); // listing id → still sellable
      for (const l of snapshot.listings) {
        heldNow.set(String(l.id), !(l.is_archived === true || l.is_active === false));
      }

      type BatchResult = {
        key: string;
        listing_id: string | null;
        label: string;
        outcome: "already_gone" | "deleted" | "refused" | "failed" | "no_listing_id" | "skipped";
        detail: string;
      };
      const results: BatchResult[] = [];
      const remaining: typeof targets = [];
      // Targets whose removal call succeeded and still need the closing verify.
      const pending: Array<{
        key: string;
        label: string;
        listingId: string;
        method: string;
        propertyId: string | null;
        recordKind: "property" | "unit" | null;
        recordId: string | null;
      }> = [];

      const clearListingLocally = async (listingId: string) => {
        await admin
          .from("properties")
          .update({ rentalsunited_property_id: null })
          .eq("rentalsunited_property_id", listingId);
        await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("rentalsunited_property_id", listingId);
      };

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (Date.now() - startedAt > BUDGET_MS) {
          remaining.push(...targets.slice(i));
          break;
        }
        const key = t.type === "stale" ? String(t.record_id ?? "") : String(t.listing_id ?? "");
        const label = t.name || key;

        // Resolve the listing id: stale rows carry it on the local record.
        let listingId = t.listing_id ? String(t.listing_id) : null;
        let recordKind: "property" | "unit" | null = t.record_kind ?? null;
        if (t.type === "stale") {
          // A stale id may belong to a different sub-account; never judge its
          // presence against this account's snapshot.
          const scopeProperty = t.property_id
            ? String(t.property_id)
            : recordKind === "property"
              ? String(t.record_id ?? "")
              : null;
          if (scopeProperty) {
            const staleOwner = await resolveRuOwnerId(admin, scopeProperty);
            if (staleOwner && staleOwner !== ownerId) {
              results.push({
                key,
                listing_id: t.listing_id ?? null,
                label,
                outcome: "skipped",
                detail: `belongs to channel account ${staleOwner}`,
              });
              continue;
            }
          }

          const table = recordKind === "property" ? "properties" : "hostfully_room_types";
          const { data: record } = await admin
            .from(table)
            .select("id, rentalsunited_property_id")
            .eq("id", t.record_id)
            .maybeSingle();
          listingId = record?.rentalsunited_property_id ? String(record.rentalsunited_property_id) : null;
          if (!listingId) {
            results.push({
              key,
              listing_id: null,
              label,
              outcome: "no_listing_id",
              detail: "record held no channel listing id",
            });
            continue;
          }
        }
        if (!listingId) {
          results.push({ key, listing_id: null, label, outcome: "failed", detail: "no listing id supplied" });
          continue;
        }

        const { data: ownerProp } = await admin
          .from("properties")
          .select("id")
          .eq("rentalsunited_property_id", listingId)
          .maybeSingle();
        const propertyId = ownerProp?.id ?? "";

        const sellable = heldNow.get(listingId);
        if (sellable === undefined) {
          // Not held by the account at all — nothing to remove upstream.
          if (t.type === "stale" && t.record_id) {
            const table = recordKind === "property" ? "properties" : "hostfully_room_types";
            await admin.from(table).update({ rentalsunited_property_id: null }).eq("id", t.record_id);
          } else {
            await clearListingLocally(listingId);
          }
          results.push({
            key,
            listing_id: listingId,
            label,
            outcome: "already_gone",
            detail: `listing ${listingId} was no longer held by the channel account`,
          });
          continue;
        }
        if (sellable === false) {
          // Present but already archived/inactive: terminal removed state.
          if (t.type === "stale" && t.record_id) {
            const table = recordKind === "property" ? "properties" : "hostfully_room_types";
            await admin.from(table).update({ rentalsunited_property_id: null }).eq("id", t.record_id);
          } else {
            await clearListingLocally(listingId);
          }
          results.push({
            key,
            listing_id: listingId,
            label,
            outcome: "deleted",
            detail: `listing ${listingId} already archived on the channel account (no longer sellable)`,
          });
          continue;
        }

        const removal = await removeListingUpstream(admin, {
          propertyId,
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:delete"),
        });
        if (removal.error) {
          results.push({ key, listing_id: listingId, label, outcome: "failed", detail: removal.error });
          continue;
        }
        pending.push({
          key,
          label,
          listingId,
          method: removal.method,
          propertyId: propertyId || null,
          recordKind,
          recordId: t.type === "stale" ? String(t.record_id ?? "") : null,
        });
      }

      // 3. One closing verification read for everything we touched.
      if (pending.length > 0) {
        const after = await pullOwnerListings(admin, ownerId, logCtx(traceId, "channel-cleanup:verify_after"), { forceFresh: true });
        const stillSellable = new Map<string, boolean>();
        if (!after.error) {
          for (const l of after.listings) {
            stillSellable.set(String(l.id), !(l.is_archived === true || l.is_active === false));
          }
        }
        for (const p of pending) {
          if (after.error) {
            results.push({
              key: p.key,
              listing_id: p.listingId,
              label: p.label,
              outcome: "failed",
              detail: `removal sent (${p.method}) but the account could not be re-read: ${after.error}`,
            });
            continue;
          }
          const live = stillSellable.get(p.listingId);
          if (live === true) {
            results.push({
              key: p.key,
              listing_id: p.listingId,
              label: p.label,
              outcome: "refused",
              detail: `listing ${p.listingId} is still live on the channel account after a ${p.method} request`,
            });
            continue;
          }
          if (p.recordId) {
            const table = p.recordKind === "property" ? "properties" : "hostfully_room_types";
            await admin.from(table).update({ rentalsunited_property_id: null }).eq("id", p.recordId);
          } else {
            await clearListingLocally(p.listingId);
          }
          results.push({
            key: p.key,
            listing_id: p.listingId,
            label: p.label,
            outcome: "deleted",
            detail:
              live === false
                ? `listing ${p.listingId} confirmed archived on the channel account (no longer sellable)`
                : `listing ${p.listingId} confirmed removed from the channel account (${p.method})`,
          });
        }
      }

      // One audit row per target, exactly as the per-row scopes write them.
      const events = results
        .filter((r) => r.outcome !== "no_listing_id")
        .map((r) => ({
          property_id: null,
          property_name: `Listing cleanup (#${r.listing_id ?? "?"})`,
          direction: "archived",
          unit_count: 0,
          listing_count: r.outcome === "deleted" || r.outcome === "already_gone" ? 1 : 0,
          reason: raw.reason ?? "Listing removed during channel reconciliation",
          actor_user_id: actorUserId,
          actor_email: actorEmail,
          ru_status: r.outcome === "deleted" || r.outcome === "already_gone" ? "updated" : "ru_failed",
          detail: r.detail,
        }));
      if (events.length > 0) await admin.from("ru_archive_events").insert(events);

      const cleaned = results.filter((r) => r.outcome === "deleted" || r.outcome === "already_gone").length;
      return new Response(
        JSON.stringify({
          success: true,
          status: remaining.length > 0 ? "resumable" : "complete",
          owner_id: ownerId,
          trace_id: traceId,
          cleaned,
          refused: results.filter((r) => r.outcome === "refused").length,
          failed: results.filter((r) => r.outcome === "failed").length,
          results,
          remaining,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }




    // ── Restore an authored unit that is live upstream but inactive locally ──
    if (raw.scope === "restore_local_unit") {
      const { data: unit, error: unitErr } = await admin
        .from("hostfully_room_types")
        .select("id, name, property_id, linked_rolos_id, rentalsunited_property_id, properties!inner(amenities)")
        .eq("id", raw.entity_id)
        .maybeSingle();
      if (unitErr) return bad(unitErr.message, 500);
      if (!unit?.rentalsunited_property_id) return bad("Unit has no channel listing", 409);

      const joinedProperty = unit.properties as unknown as {
        amenities?: { room_types?: Array<{ name?: string; is_active?: boolean }> };
      };
      const authored = (joinedProperty.amenities?.room_types || []).some(
        (room) =>
          room.is_active !== false &&
          String(room.name || "").trim().toLowerCase() === String(unit.name || "").trim().toLowerCase(),
      );
      if (!authored) return bad("Unit is not active in the property's authored Rooms inventory", 409);

      const ownerId = await resolveRuOwnerId(admin, unit.property_id);
      const presence = await verifyListingPresence(admin, {
        listingId: String(unit.rentalsunited_property_id),
        ownerId,
        ctx: logCtx(traceId, "channel-restore-unit:verify"),
      });
      if (presence.error) return presence.deferred ? deferred(presence.error) : bad(presence.error, 502);
      if (!presence.present || presence.archived) return bad("The unit listing is not live on the channel", 409);

      const { error: restoreErr } = await admin
        .from("hostfully_room_types")
        .update({ is_active: true })
        .eq("id", unit.id);
      if (restoreErr) return bad(restoreErr.message, 500);
      if (unit.linked_rolos_id) {
        const { error: linkedErr } = await admin
          .from("rolos_room_types")
          .update({ is_active: true })
          .eq("id", unit.linked_rolos_id);
        if (linkedErr) return bad(linkedErr.message, 500);
      }

      await admin.from("ru_archive_events").insert({
        property_id: unit.property_id,
        property_name: `Unit restored (${unit.name})`,
        direction: "reactivated",
        unit_count: 1,
        listing_count: 1,
        reason: raw.reason ?? "Authored unit restored during channel reconciliation",
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        ru_status: "updated",
        detail: `${unit.name} kept live on listing ${unit.rentalsunited_property_id}`,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Re-point a local record at a listing that is live on the account ──
    //    Used when a record still holds an id the channel has archived. The
    //    replacement id is verified live upstream before anything is written,
    //    so a mistake in the reconcile report can never wire in a dead id.
    if (raw.scope === "repoint_local_listing") {
      const listingId = String(raw.listing_id ?? "").trim();
      if (!listingId) return bad("listing_id is required", 400);
      const table = raw.record_kind === "property" ? "properties" : "hostfully_room_types";
      const ownerId = raw.owner_id ? String(raw.owner_id) : null;

      const presence = await verifyListingPresence(admin, {
        listingId,
        ownerId,
        ctx: logCtx(traceId, "channel-repoint:verify"),
      });
      if (presence.error) return presence.deferred ? deferred(presence.error) : bad(presence.error, 502);
      if (!presence.present) return bad(`Listing ${listingId} is not held by the channel account`, 409);
      if (presence.archived) return bad(`Listing ${listingId} is archived on the channel account`, 409);

      // Release the id from anything else holding it, so a re-point can never
      // create a second collision.
      await admin
        .from("properties")
        .update({ rentalsunited_property_id: null })
        .eq("rentalsunited_property_id", listingId)
        .neq("id", raw.entity_id);
      await admin
        .from("hostfully_room_types")
        .update({ rentalsunited_property_id: null })
        .eq("rentalsunited_property_id", listingId)
        .neq("id", raw.entity_id);

      const { error: setErr } = await admin
        .from(table)
        .update({ rentalsunited_property_id: listingId })
        .eq("id", raw.entity_id);
      if (setErr) return bad(setErr.message, 500);

      await admin.from("ru_archive_events").insert({
        property_id: raw.record_kind === "property" ? raw.entity_id : null,
        property_name: `Listing re-point (#${listingId})`,
        direction: "reactivated",
        unit_count: raw.record_kind === "property" ? 0 : 1,
        listing_count: 1,
        reason: raw.reason ?? "Local listing id re-pointed during channel reconciliation",
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        ru_status: "updated",
        detail: `${raw.record_kind ?? "unit"} ${raw.entity_id} now points at live listing ${listingId}`,
      });

      return new Response(JSON.stringify({ success: true, listing_id: listingId }), {
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
        const removal = await removeListingUpstream(admin, {
          propertyId: dup.property_id,
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:delete"),
        });
        if (removal.error) {
          failed += 1;
          results.push({ name: dup.name, listing_id: listingId, status: "ru_failed", detail: removal.error });
          continue;
        }
        // Confirm against the account before releasing the local id.
        const after = await verifyListingPresence(admin, {
          listingId,
          ownerId,
          ctx: logCtx(traceId, "channel-cleanup:verify_after"),
        });
        // Archived-but-present is the channel's terminal removed state — accept it.
        if (after.present && !after.archived) {
          failed += 1;
          results.push({
            name: dup.name,
            listing_id: listingId,
            status: "ru_failed",
            detail: `still live on the channel account after a ${removal.method} request`,
          });
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
        actor_user_id: actorUserId,
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

      // Delisting is not deactivating. A unit the Rooms tab still lists is real
      // sellable inventory: pull its channel listing, but never switch the unit
      // off — that is what silently shrank a property's push to a single unit.
      let keptActive = false;
      if (unitArchive) {
        const { data: parent } = await admin
          .from("properties")
          .select("amenities")
          .eq("id", unit.property_id)
          .maybeSingle();
        const canonical = (((parent?.amenities as { room_types?: Array<{ name?: string | null }> } | null)
          ?.room_types) || []).map((r) => String(r?.name || "").trim().toLowerCase());
        keptActive = canonical.includes(String(unit.name || "").trim().toLowerCase());
      }

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


      if (keptActive) {
        // Release the channel id so the unit stops billing, but leave it sellable.
        const { error: idErr } = await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("id", unit.id);
        if (idErr) {
          unitStatus = "ru_failed";
          unitDetail = idErr.message;
        } else {
          unitDetail = `${unitDetail ? `${unitDetail}; ` : ""}delisted from the channel and kept active locally — it is still listed on the property's Rooms tab`;
        }
      } else {
        const { error: flagErr } = await admin
          .from("hostfully_room_types")
          .update({ is_active: !unitArchive })
          .eq("id", unit.id);
        if (flagErr) {
          unitStatus = "ru_failed";
          unitDetail = flagErr.message;
        }
      }


      // Activation is one act: unlock the building, resume pushes and resync ARI.
      let unitAri: string | null = null;
      let unitAriRetryable = false;
      if (!unitArchive) {
        const unitOwnerId = await resolveRuOwnerId(admin, unit.property_id);
        const gate = await distributionPushAllowed(admin, unit.property_id, unitOwnerId);
        if (!gate.ok) {
          unitStatus = "ru_failed";
          unitDetail = gate.reason ?? unitDetail;
        } else {
        await admin
          .from("properties")
          .update({
            ru_archived: false,
            ru_archived_at: null,
            ru_push_enabled: true,
            ru_hold_reason: null,
            ru_hold_set_at: null,
          })
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
      }

      await admin.from("ru_archive_events").insert({
        property_id: unit.property_id,
        property_name: unit.name,
        direction: unitArchive ? (keptActive ? "delisted" : "archived") : "reactivated",

        unit_count: 1,
        listing_count: unit.rentalsunited_property_id ? 1 : 0,
        reason: raw.reason ?? null,
        actor_user_id: actorUserId,
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
              kept_active: keptActive,


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
      if (!archive) {
        const gate = await distributionPushAllowed(admin, p.id, ruOwnerId);
        if (!gate.ok) {
          results.push({
            property_id: p.id,
            name: p.name,
            ru_property_id: p.rentalsunited_property_id,
            status: "skipped",
            detail: gate.reason,
          });
          continue;
        }
      }

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
          // Archiving is an explicit hold on distribution; re-activating lifts it.
          ru_push_enabled: !archive,
          ru_hold_reason: archive ? "Listing archived at the Channel Manager" : null,
          ru_hold_set_at: archive ? new Date().toISOString() : null,

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
        actor_user_id: actorUserId,
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
