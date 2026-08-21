// ============================================================================
// HUBSPOT API v1.0 — owner-scoped CRM add-on (free, optional, isolated)
//
// This function is the ONLY place HubSpot credentials are read or used.
// It is NOT a PMS adapter: it never touches availability, rates, pms_mappings
// or any booking/calendar surface. Tokens never leave this function.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HUBSPOT_BASE = "https://api.hubapi.com";
const SERVICE = "hubspot";
/** Custom HubSpot property carrying the Trade / Direct segmentation marker. */
const TRADE_PROPERTY = "rol_trade_or_direct";
/** Custom HubSpot property carrying the guest lifecycle marker. */
const LIFECYCLE_PROPERTY = "rol_guest_lifecycle";


const requestSchema = z.object({
  action: z.enum([
    "get_status",
    "save_credentials",
    "set_enabled",
    "disconnect",
    "test_connection",
    "upsert_company",
    "upsert_contact",
    "create_or_update_deal",
    "upsert_inquiry",
    "enrich_contact",
    "log_engagement",
    "sync_owner",
    // Read-only operator surfaces (CRM page + Guests enrichment).
    "get_metrics",
    "get_contact_summary",
    "get_sync_log",
    // Optional, default-off message logging (never affects native delivery).
    "set_message_logging",
    "log_message_event",
  ]),

  owner_id: z.string().uuid().optional(),
  portal_id: z.string().trim().min(1).max(64).optional(),
  access_token: z.string().trim().min(10).max(512).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  company: z
    .object({
      name: z.string().trim().min(1).max(255),
      domain: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(64).optional(),
      city: z.string().trim().max(120).optional(),
      country: z.string().trim().max(120).optional(),
      description: z.string().trim().max(2000).optional(),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email().max(255),
      firstname: z.string().trim().max(120).optional(),
      lastname: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(64).optional(),
      country: z.string().trim().max(120).optional(),
      trade_or_direct: z.enum(["trade", "direct"]).optional(),
    })
    .optional(),
  deal: z
    .object({
      booking_id: z.string().trim().min(1).max(120),
      dealname: z.string().trim().min(1).max(255),
      amount: z.number().nonnegative().optional(),
      currency: z.string().trim().max(8).optional(),
      status: z.string().trim().max(64).optional(),
      closedate: z.string().trim().max(40).optional(),
      contact_email: z.string().email().max(255).optional(),
      trade_or_direct: z.enum(["trade", "direct"]).optional(),
    })
    .optional(),
  /** Native inquiry projected as a HubSpot deal in an "enquiry" stage. */
  inquiry: z
    .object({
      inquiry_id: z.string().trim().min(1).max(120),
      reference: z.string().trim().max(64).optional(),
      stage: z.string().trim().max(64).optional(),
      guest_name: z.string().trim().max(255).optional(),
      guest_email: z.string().email().max(255).optional(),
      guest_phone: z.string().trim().max(64).optional(),
      property_name: z.string().trim().max(255).optional(),
      estimated_value: z.number().nonnegative().optional(),
      currency: z.string().trim().max(8).optional(),
      check_in_date: z.string().trim().max(40).optional(),
      trade_or_direct: z.enum(["trade", "direct"]).optional(),
      source: z.string().trim().max(64).optional(),
    })
    .optional(),
  /** Segmentation / lifecycle enrichment for an existing guest contact. */
  enrichment: z
    .object({
      email: z.string().email().max(255),
      trade_or_direct: z.enum(["trade", "direct"]).optional(),
      lifecycle: z.enum(["new", "repeat", "lapsed"]).optional(),
      total_stays: z.number().int().nonnegative().optional(),
      total_spent: z.number().nonnegative().optional(),
      last_stay_date: z.string().trim().max(40).optional(),
    })
    .optional(),
  /** Timeline note against a contact (check-in completed, feedback received). */
  engagement: z
    .object({
      email: z.string().email().max(255),
      title: z.string().trim().min(1).max(255),
      body: z.string().trim().max(4000).optional(),
    })
    .optional(),
  /** Delta sweep window for `sync_owner` — ISO timestamp. */
  since: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  /** Contact lookup for the read-only Guests enrichment panel. */
  email: z.string().email().max(255).optional(),
  /** Scope for the read-only CRM metrics / sync log. */
  property_id: z.string().uuid().optional(),
  /** Optional per-property message logging switch (default OFF). */
  message_logging: z
    .object({
      property_id: z.string().uuid(),
      enabled: z.boolean(),
    })
    .optional(),
  /** A native message that has ALREADY been delivered, projected as a note. */
  message_event: z
    .object({
      email: z.string().email().max(255),
      property_id: z.string().uuid().optional(),
      event: z.string().trim().max(64).optional(),
      subject: z.string().trim().max(255).optional(),
      body: z.string().trim().max(4000).optional(),
      /** Set when the caller is an explicit operator opt-in, not the auto sweep. */
      force: z.boolean().optional(),
    })
    .optional(),
});



type Json = Record<string, unknown>;

const ok = (data: Json) =>
  new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (error: string, status = 400, extra: Json = {}) =>
  new Response(JSON.stringify({ success: false, error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Map an internal reservation status onto a HubSpot default pipeline stage. */
const DEAL_STAGE_MAP: Record<string, string> = {
  enquiry: "appointmentscheduled",
  pending: "appointmentscheduled",
  provisional: "qualifiedtobuy",
  confirmed: "contractsent",
  checked_in: "closedwon",
  checked_out: "closedwon",
  completed: "closedwon",
  cancelled: "closedlost",
  no_show: "closedlost",
};

function resolveStage(status: string | undefined, config: Json): string {
  const overrides = (config?.deal_stages as Record<string, string> | undefined) || {};
  const key = (status || "confirmed").toLowerCase();
  return overrides[key] || DEAL_STAGE_MAP[key] || "appointmentscheduled";
}

interface OwnerIntegration {
  id: string;
  owner_id: string;
  enabled: boolean;
  portal_id: string | null;
  access_token: string | null;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  config: Json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail("Invalid request", 400, { details: parsed.error.flatten().fieldErrors });
    }
    const body = parsed.data;

    // ---- Identity -----------------------------------------------------------
    // Owner-scoped actions require a signed-in caller. Server-to-server sync
    // calls (service-role key) may pass owner_id explicitly.
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = bearer === serviceKey;

    let ownerId: string | null = null;
    let isStaff = false;

    if (isServiceCall) {
      ownerId = body.owner_id ?? null;
    } else {
      if (!bearer) return fail("Authentication required", 401);
      const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
      if (userErr || !userData?.user) return fail("Invalid session", 401);
      const callerId = userData.user.id;

      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      isStaff = (roles || []).some((r: { role: string }) =>
        ["admin", "dev", "fearless_leader"].includes(r.role),
      );
      ownerId = isStaff && body.owner_id ? body.owner_id : callerId;
    }

    if (!ownerId) return fail("owner_id is required", 400);

    // ---- Load the owner row -------------------------------------------------
    const { data: rowRaw, error: rowErr } = await admin
      .from("owner_integrations")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("service", SERVICE)
      .maybeSingle();
    if (rowErr) return fail(`Could not read integration: ${rowErr.message}`, 500);

    const row = rowRaw as (OwnerIntegration & { access_token: string | null }) | null;

    const statusPayload = (r: typeof row) => ({
      owner_id: ownerId,
      service: SERVICE,
      enabled: r?.enabled ?? false,
      connected: Boolean(r?.access_token),
      portal_id: r?.portal_id ?? null,
      sync_status: r?.sync_status ?? "pending",
      last_sync_at: r?.last_sync_at ?? null,
      last_error: r?.last_error ?? null,
      config: r?.config ?? {},
    });

    const decryptToken = async (): Promise<string | null> => {
      if (!row?.access_token) return null;
      const { data, error } = await admin.rpc("decrypt_sensitive_text", {
        encrypted_data: row.access_token,
      });
      if (error) {
        console.error("[hubspot-api] token decrypt failed:", error.message);
        return null;
      }
      return (data as string) || null;
    };

    const hubspot = async (
      token: string,
      path: string,
      init: RequestInit = {},
    ): Promise<{ ok: boolean; status: number; body: unknown }> => {
      const res = await fetch(`${HUBSPOT_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const text = await res.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* keep raw text */
      }
      if (!res.ok) {
        console.error(`[hubspot-api] ${path} failed [${res.status}]: ${text.slice(0, 500)}`);
      }
      return { ok: res.ok, status: res.status, body: payload };
    };

    const markSync = async (status: "ok" | "error", error?: string) => {
      await admin
        .from("owner_integrations")
        .update({
          sync_status: status,
          last_sync_at: new Date().toISOString(),
          last_error: status === "error" ? (error || "Unknown error").slice(0, 500) : null,
        })
        .eq("owner_id", ownerId)
        .eq("service", SERVICE);
    };

    /**
     * Append an audit line to the shared integration log. Fire-and-forget:
     * a failed log write must never change the outcome of a HubSpot action.
     */
    const logEvent = async (
      event: string,
      metadata: Json = {},
      propertyId?: string | null,
    ): Promise<void> => {
      try {
        await admin.from("integration_logs").insert({
          property_id: propertyId ?? body.property_id ?? null,
          integration_type: SERVICE,
          event,
          metadata: { owner_id: ownerId, ...metadata },
        });
      } catch (err) {
        console.warn("[hubspot-api] log write failed:", err);
      }
    };

    /** Owner's properties — the scope every read-only metric is measured over. */
    const ownerPropertyIds = async (): Promise<string[]> => {
      const { data } = await admin
        .from("property_owners")
        .select("property_id")
        .eq("user_id", ownerId);
      return (data || []).map((l: { property_id: string }) => l.property_id);
    };

    /** Guard used by every sync action: enabled + credentials present. */
    const requireActive = async (): Promise<
      { token: string; config: Json } | Response
    > => {
      if (!row?.enabled) return fail("HubSpot is not enabled for this owner", 409, { skipped: true });
      const token = await decryptToken();
      if (!token) return fail("HubSpot credentials are missing", 409, { skipped: true });
      return { token, config: (row.config || {}) as Json };
    };

    // ---- Trade vs Direct segmentation --------------------------------------
    // Guests booked through an agent are "trade"; everyone else is "direct".
    // The marker rides on a custom HubSpot property so owners can build lists
    // from it. We create the property on first use and never fail a sync when
    // the portal refuses it.
    const tradePropertyReady = new Map<string, boolean>();

    const ensureTradeProperty = async (
      token: string,
      objectType: "contacts" | "deals",
    ): Promise<boolean> => {
      const cached = tradePropertyReady.get(objectType);
      if (cached !== undefined) return cached;

      const probe = await hubspot(token, `/crm/v3/properties/${objectType}/${TRADE_PROPERTY}`);
      if (probe.ok) {
        tradePropertyReady.set(objectType, true);
        return true;
      }

      const created = await hubspot(token, `/crm/v3/properties/${objectType}`, {
        method: "POST",
        body: JSON.stringify({
          name: TRADE_PROPERTY,
          label: "Trade or Direct",
          type: "enumeration",
          fieldType: "select",
          groupName: objectType === "contacts" ? "contactinformation" : "dealinformation",
          options: [
            { label: "Trade", value: "trade", displayOrder: 0 },
            { label: "Direct", value: "direct", displayOrder: 1 },
          ],
        }),
      });
      // 409 means another sync already created it.
      const ready = created.ok || created.status === 409;
      tradePropertyReady.set(objectType, ready);
      return ready;
    };

    const withTrade = async (
      token: string,
      objectType: "contacts" | "deals",
      props: Json,
      segment: "trade" | "direct" | undefined,
    ): Promise<Json> => {
      if (!segment) return props;
      const ready = await ensureTradeProperty(token, objectType);
      return ready ? { ...props, [TRADE_PROPERTY]: segment } : props;
    };

    // Guest lifecycle marker (new / repeat / lapsed) — same soft-fail contract
    // as the trade marker: never break a sync because a portal refuses it.
    const lifecycleReady = new Map<string, boolean>();

    const ensureLifecycleProperty = async (token: string): Promise<boolean> => {
      const cached = lifecycleReady.get("contacts");
      if (cached !== undefined) return cached;

      const probe = await hubspot(token, `/crm/v3/properties/contacts/${LIFECYCLE_PROPERTY}`);
      if (probe.ok) {
        lifecycleReady.set("contacts", true);
        return true;
      }
      const created = await hubspot(token, "/crm/v3/properties/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: LIFECYCLE_PROPERTY,
          label: "Guest lifecycle",
          type: "enumeration",
          fieldType: "select",
          groupName: "contactinformation",
          options: [
            { label: "New", value: "new", displayOrder: 0 },
            { label: "Repeat", value: "repeat", displayOrder: 1 },
            { label: "Lapsed", value: "lapsed", displayOrder: 2 },
          ],
        }),
      });
      const ready = created.ok || created.status === 409;
      lifecycleReady.set("contacts", ready);
      return ready;
    };


    // ---- Deduped remote upserts (shared by single events and sweeps) -------
    const findContactId = async (token: string, email: string): Promise<string | null> => {
      const search = await hubspot(token, "/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          limit: 1,
          properties: ["email"],
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        }),
      });
      return (search.body as { results?: Array<{ id: string }> })?.results?.[0]?.id ?? null;
    };

    const upsertContactRemote = async (
      token: string,
      props: Json,
      email: string,
    ): Promise<{ ok: boolean; status: number; id: string | null; body: unknown }> => {
      let res = await hubspot(token, "/crm/v3/objects/contacts", {
        method: "POST",
        body: JSON.stringify({ properties: props }),
      });
      let id = (res.body as { id?: string })?.id ?? null;
      if (!res.ok && res.status === 409) {
        id = await findContactId(token, email);
        if (id) {
          res = await hubspot(token, `/crm/v3/objects/contacts/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: props }),
          });
        }
      }
      return { ok: res.ok, status: res.status, id, body: res.body };
    };

    const upsertDealRemote = async (
      token: string,
      props: Json,
      bookingLabel: string,
    ): Promise<{ ok: boolean; status: number; id: string | null; created: boolean; body: unknown }> => {
      const search = await hubspot(token, "/crm/v3/objects/deals/search", {
        method: "POST",
        body: JSON.stringify({
          limit: 1,
          properties: ["dealname"],
          filterGroups: [
            {
              filters: [
                { propertyName: "dealname", operator: "CONTAINS_TOKEN", value: bookingLabel },
              ],
            },
          ],
        }),
      });
      const existingId =
        (search.ok && (search.body as { results?: Array<{ id: string }> })?.results?.[0]?.id) || null;

      const res = existingId
        ? await hubspot(token, `/crm/v3/objects/deals/${existingId}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: props }),
          })
        : await hubspot(token, "/crm/v3/objects/deals", {
            method: "POST",
            body: JSON.stringify({ properties: props }),
          });

      return {
        ok: res.ok,
        status: res.status,
        id: (res.body as { id?: string })?.id ?? existingId,
        created: !existingId,
        body: res.body,
      };
    };

    const upsertCompanyRemote = async (
      token: string,
      props: Json,
      name: string,
    ): Promise<{ ok: boolean; status: number; id: string | null; created: boolean; body: unknown }> => {
      const search = await hubspot(token, "/crm/v3/objects/companies/search", {
        method: "POST",
        body: JSON.stringify({
          limit: 1,
          properties: ["name"],
          filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: name }] }],
        }),
      });
      const existingId =
        (search.ok && (search.body as { results?: Array<{ id: string }> })?.results?.[0]?.id) || null;

      const res = existingId
        ? await hubspot(token, `/crm/v3/objects/companies/${existingId}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: props }),
          })
        : await hubspot(token, "/crm/v3/objects/companies", {
            method: "POST",
            body: JSON.stringify({ properties: props }),
          });

      return {
        ok: res.ok,
        status: res.status,
        id: (res.body as { id?: string })?.id ?? existingId,
        created: !existingId,
        body: res.body,
      };
    };

    const associateDealContact = async (token: string, dealId: string, email: string) => {
      const contactId = await findContactId(token, email);
      if (!contactId) return;
      await hubspot(
        token,
        `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`,
        { method: "PUT" },
      );
    };



    // ---- Actions ------------------------------------------------------------
    switch (body.action) {
      case "get_status":
        return ok(statusPayload(row));

      case "save_credentials": {
        if (!body.access_token) return fail("access_token is required", 400);

        // Verify before persisting — never store a token we cannot use.
        const probe = await hubspot(body.access_token, "/crm/v3/objects/companies?limit=1");
        if (!probe.ok) {
          return ok({
            ...statusPayload(row),
            tested: true,
            test_ok: false,
            status: probe.status,
            message:
              probe.status === 401 || probe.status === 403
                ? "HubSpot rejected that token. Check the Private App token and its CRM scopes."
                : `HubSpot returned ${probe.status}.`,
          });
        }

        const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", {
          plaintext: body.access_token,
        });
        if (encErr) return fail(`Could not store credentials: ${encErr.message}`, 500);

        const payload = {
          owner_id: ownerId,
          service: SERVICE,
          enabled: true,
          portal_id: body.portal_id ?? row?.portal_id ?? null,
          access_token: enc,
          sync_status: "ok",
          last_error: null,
          config: { ...(row?.config || {}), ...(body.config || {}) },
        };

        const { data: saved, error: saveErr } = await admin
          .from("owner_integrations")
          .upsert(payload, { onConflict: "owner_id,service" })
          .select("*")
          .single();
        if (saveErr) return fail(`Could not save integration: ${saveErr.message}`, 500);

        return ok({ ...statusPayload(saved as typeof row), tested: true, test_ok: true });
      }

      case "set_enabled": {
        const enabled = body.enabled === true;
        if (enabled && !row?.access_token) {
          return fail("Add and test a HubSpot token before enabling", 409);
        }
        const { data: saved, error } = await admin
          .from("owner_integrations")
          .upsert(
            {
              owner_id: ownerId,
              service: SERVICE,
              enabled,
              config: { ...(row?.config || {}), ...(body.config || {}) },
            },
            { onConflict: "owner_id,service" },
          )
          .select("*")
          .single();
        if (error) return fail(`Could not update integration: ${error.message}`, 500);
        return ok(statusPayload(saved as typeof row));
      }

      case "disconnect": {
        const { data: saved, error } = await admin
          .from("owner_integrations")
          .upsert(
            {
              owner_id: ownerId,
              service: SERVICE,
              enabled: false,
              access_token: null,
              refresh_token: null,
              portal_id: null,
              sync_status: "pending",
              last_error: null,
            },
            { onConflict: "owner_id,service" },
          )
          .select("*")
          .single();
        if (error) return fail(`Could not disconnect: ${error.message}`, 500);
        return ok(statusPayload(saved as typeof row));
      }

      case "test_connection": {
        const token = body.access_token || (await decryptToken());
        if (!token) return fail("No HubSpot token on file", 409);
        const probe = await hubspot(token, "/crm/v3/objects/companies?limit=1");
        if (!probe.ok) {
          if (row) await markSync("error", `Connection test failed (${probe.status})`);
          return ok({
            test_ok: false,
            status: probe.status,
            message:
              probe.status === 401 || probe.status === 403
                ? "HubSpot rejected the token. Check its CRM scopes."
                : `HubSpot returned ${probe.status}.`,
            details: probe.body,
          });
        }
        if (row) await markSync("ok");
        return ok({ test_ok: true, status: probe.status });
      }

      case "upsert_company": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.company) return fail("company is required", 400);

        const props: Json = {
          name: body.company.name,
          ...(body.company.domain ? { domain: body.company.domain } : {}),
          ...(body.company.phone ? { phone: body.company.phone } : {}),
          ...(body.company.city ? { city: body.company.city } : {}),
          ...(body.company.country ? { country: body.company.country } : {}),
          ...(body.company.description ? { description: body.company.description } : {}),
        };

        const res = await upsertCompanyRemote(active.token, props, body.company.name);
        if (!res.ok) {
          await markSync("error", `Company sync failed (${res.status})`);
          return fail("HubSpot company sync failed", res.status, { details: res.body });
        }
        await markSync("ok");
        return ok({ company_id: res.id, created: res.created });
      }

      case "upsert_contact": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.contact) return fail("contact is required", 400);

        const base: Json = {
          email: body.contact.email,
          ...(body.contact.firstname ? { firstname: body.contact.firstname } : {}),
          ...(body.contact.lastname ? { lastname: body.contact.lastname } : {}),
          ...(body.contact.phone ? { phone: body.contact.phone } : {}),
          ...(body.contact.country ? { country: body.contact.country } : {}),
        };
        const props = await withTrade(
          active.token,
          "contacts",
          base,
          body.contact.trade_or_direct,
        );

        const res = await upsertContactRemote(active.token, props, body.contact.email);
        if (!res.ok) {
          await markSync("error", `Contact sync failed (${res.status})`);
          return fail("HubSpot contact sync failed", res.status, { details: res.body });
        }
        await markSync("ok");
        return ok({ contact_id: res.id, created: res.status < 300 && res.created !== false });
      }

      case "create_or_update_deal": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.deal) return fail("deal is required", 400);

        const base: Json = {
          dealname: body.deal.dealname,
          pipeline: (active.config.pipeline_id as string) || "default",
          dealstage: resolveStage(body.deal.status, active.config),
          ...(body.deal.amount != null ? { amount: String(body.deal.amount) } : {}),
          ...(body.deal.closedate ? { closedate: body.deal.closedate } : {}),
        };
        const props = await withTrade(active.token, "deals", base, body.deal.trade_or_direct);

        const res = await upsertDealRemote(active.token, props, body.deal.booking_id);
        if (!res.ok) {
          await markSync("error", `Deal sync failed (${res.status})`);
          return fail("HubSpot deal sync failed", res.status, { details: res.body });
        }

        if (res.id && body.deal.contact_email) {
          await associateDealContact(active.token, res.id, body.deal.contact_email);
        }

        await markSync("ok");
        return ok({ deal_id: res.id, created: res.created });
      }

      // ---- Guest intelligence projections -----------------------------------
      // ROLOS owns inquiries, check-ins and feedback natively; HubSpot only
      // ever receives a projection of what already exists locally.
      case "upsert_inquiry": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.inquiry) return fail("inquiry is required", 400);

        const inq = body.inquiry;
        const label = inq.reference || inq.inquiry_id;
        const guest = (inq.guest_name || "").trim();
        const segment = inq.trade_or_direct;

        let contactId: string | null = null;
        if (inq.guest_email) {
          const parts = guest ? guest.split(/\s+/) : [];
          const contactProps = await withTrade(
            active.token,
            "contacts",
            {
              email: inq.guest_email,
              ...(parts[0] ? { firstname: parts[0] } : {}),
              ...(parts.length > 1 ? { lastname: parts.slice(1).join(" ") } : {}),
              ...(inq.guest_phone ? { phone: inq.guest_phone } : {}),
            },
            segment,
          );
          const cRes = await upsertContactRemote(active.token, contactProps, inq.guest_email);
          contactId = cRes.id;
        }

        const dealProps = await withTrade(
          active.token,
          "deals",
          {
            dealname: `${label}${guest ? ` · ${guest}` : ""}`,
            pipeline: (active.config.pipeline_id as string) || "default",
            dealstage: resolveStage(inq.stage || "enquiry", active.config),
            ...(inq.estimated_value != null ? { amount: String(inq.estimated_value) } : {}),
            ...(inq.check_in_date
              ? { closedate: new Date(inq.check_in_date).toISOString() }
              : {}),
            ...(inq.source || inq.property_name
              ? {
                  description: [
                    inq.property_name ? `Property: ${inq.property_name}` : null,
                    inq.source ? `Source: ${inq.source}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              : {}),
          },
          segment,
        );

        const res = await upsertDealRemote(active.token, dealProps, label);
        if (!res.ok) {
          await markSync("error", `Inquiry sync failed (${res.status})`);
          return fail("HubSpot inquiry sync failed", res.status, { details: res.body });
        }
        if (res.id && inq.guest_email) {
          await associateDealContact(active.token, res.id, inq.guest_email);
        }
        await markSync("ok");
        return ok({ deal_id: res.id, contact_id: contactId, created: res.created });
      }

      case "enrich_contact": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.enrichment) return fail("enrichment is required", 400);

        const e = body.enrichment;
        let props: Json = { email: e.email };
        props = await withTrade(active.token, "contacts", props, e.trade_or_direct);
        if (e.lifecycle && (await ensureLifecycleProperty(active.token))) {
          props = { ...props, [LIFECYCLE_PROPERTY]: e.lifecycle };
        }
        if (e.total_spent != null) props = { ...props, total_revenue: String(e.total_spent) };

        const res = await upsertContactRemote(active.token, props, e.email);
        if (!res.ok) {
          await markSync("error", `Contact enrichment failed (${res.status})`);
          return fail("HubSpot contact enrichment failed", res.status, { details: res.body });
        }
        await markSync("ok");
        return ok({ contact_id: res.id, lifecycle: e.lifecycle ?? null });
      }

      case "log_engagement": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.engagement) return fail("engagement is required", 400);

        const contactId = await findContactId(active.token, body.engagement.email);
        if (!contactId) return ok({ skipped: true, reason: "contact_not_found" });

        const noteBody = [body.engagement.title, body.engagement.body]
          .filter(Boolean)
          .join("\n\n");
        const res = await hubspot(active.token, "/crm/v3/objects/notes", {
          method: "POST",
          body: JSON.stringify({
            properties: {
              hs_timestamp: new Date().toISOString(),
              hs_note_body: noteBody,
            },
            associations: [
              {
                to: { id: contactId },
                types: [
                  { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 },
                ],
              },
            ],
          }),
        });
        if (!res.ok) {
          await markSync("error", `Engagement log failed (${res.status})`);
          return fail("HubSpot engagement log failed", res.status, { details: res.body });
        }
        await markSync("ok");
        return ok({ note_id: (res.body as { id?: string })?.id ?? null, contact_id: contactId });
      }


      // ---- Read-only operator surfaces --------------------------------------
      // These power the CRM page and the Guests enrichment panel. They only
      // ever read: no writes to HubSpot, no writes to ROL'OS records.
      case "get_metrics": {
        const active = await requireActive();
        if (active instanceof Response) return active;

        const countOf = async (
          object: "contacts" | "deals",
          filters: Json[] = [],
        ): Promise<number | null> => {
          const res = await hubspot(active.token, `/crm/v3/objects/${object}/search`, {
            method: "POST",
            body: JSON.stringify({
              limit: 1,
              properties: ["hs_object_id"],
              ...(filters.length ? { filterGroups: [{ filters }] } : {}),
            }),
          });
          if (!res.ok) return null;
          const total = (res.body as { total?: number })?.total;
          return typeof total === "number" ? total : null;
        };

        const contactsTotal = await countOf("contacts");
        const openDeals = await countOf("deals", [
          { propertyName: "hs_is_closed", operator: "EQ", value: "false" },
        ]);

        // Linked guests: batch-read a bounded sample of ROL'OS guest emails and
        // count how many exist in the portal. Bounded so the call stays quick.
        const propertyIds = await ownerPropertyIds();
        let guestsWithEmail = 0;
        let linkedGuests: number | null = null;

        if (propertyIds.length) {
          const { data: guests } = await admin
            .from("rolos_guest_profiles")
            .select("email")
            .in("property_id", propertyIds)
            .not("email", "is", null)
            .limit(500);
          const emails = Array.from(
            new Set(
              (guests || [])
                .map((g: { email: string | null }) => (g.email || "").trim().toLowerCase())
                .filter(Boolean),
            ),
          );
          guestsWithEmail = emails.length;

          if (emails.length) {
            let matched = 0;
            let failed = false;
            for (let i = 0; i < emails.length; i += 100) {
              const chunk = emails.slice(i, i + 100);
              const res = await hubspot(active.token, "/crm/v3/objects/contacts/batch/read", {
                method: "POST",
                body: JSON.stringify({
                  idProperty: "email",
                  properties: ["email"],
                  inputs: chunk.map((email) => ({ id: email })),
                }),
              });
              // 207 = partial success (some emails simply do not exist).
              if (!res.ok && res.status !== 207) {
                failed = true;
                break;
              }
              matched += ((res.body as { results?: unknown[] })?.results || []).length;
            }
            if (!failed) linkedGuests = matched;
          } else {
            linkedGuests = 0;
          }
        }

        return ok({
          contacts_total: contactsTotal,
          open_deals: openDeals,
          guests_with_email: guestsWithEmail,
          linked_guests: linkedGuests,
          properties: propertyIds.length,
          portal_id: row?.portal_id ?? null,
          last_sync_at: row?.last_sync_at ?? null,
        });
      }

      case "get_contact_summary": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.email) return fail("email is required", 400);

        const email = body.email.trim().toLowerCase();
        const search = await hubspot(active.token, "/crm/v3/objects/contacts/search", {
          method: "POST",
          body: JSON.stringify({
            limit: 1,
            properties: [
              "email",
              "firstname",
              "lastname",
              "lifecyclestage",
              "hubspot_owner_id",
              "hs_lead_status",
              "createdate",
              "lastmodifieddate",
              TRADE_PROPERTY,
              LIFECYCLE_PROPERTY,
            ],
            filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
          }),
        });
        if (!search.ok) {
          return fail("HubSpot contact lookup failed", search.status, { details: search.body });
        }
        const hit = (search.body as {
          results?: Array<{ id: string; properties: Record<string, string | null> }>;
        })?.results?.[0];
        if (!hit) return ok({ linked: false, portal_id: row?.portal_id ?? null });

        const props = hit.properties || {};

        // Contact owner name — best effort, never fatal.
        let ownerName: string | null = null;
        if (props.hubspot_owner_id) {
          const ownerRes = await hubspot(
            active.token,
            `/crm/v3/owners/${props.hubspot_owner_id}`,
          );
          if (ownerRes.ok) {
            const o = ownerRes.body as { firstName?: string; lastName?: string; email?: string };
            ownerName =
              [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || null;
          }
        }

        // Recent timeline notes.
        const notesRes = await hubspot(
          active.token,
          `/crm/v4/objects/contacts/${hit.id}/associations/notes?limit=5`,
        );
        const noteIds = ((notesRes.body as { results?: Array<{ toObjectId?: string | number }> })
          ?.results || [])
          .map((r) => String(r.toObjectId ?? ""))
          .filter(Boolean)
          .slice(0, 5);
        const timeline: Array<{ id: string; body: string; at: string | null }> = [];
        for (const noteId of noteIds) {
          const noteRes = await hubspot(
            active.token,
            `/crm/v3/objects/notes/${noteId}?properties=hs_note_body,hs_timestamp`,
          );
          if (!noteRes.ok) continue;
          const p = (noteRes.body as { properties?: Record<string, string | null> })?.properties || {};
          timeline.push({
            id: noteId,
            body: (p.hs_note_body || "").replace(/<[^>]+>/g, " ").trim().slice(0, 400),
            at: p.hs_timestamp || null,
          });
        }
        timeline.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

        // Deals associated with the contact.
        const dealAssoc = await hubspot(
          active.token,
          `/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=10`,
        );
        const dealIds = ((dealAssoc.body as { results?: Array<{ toObjectId?: string | number }> })
          ?.results || [])
          .map((r) => String(r.toObjectId ?? ""))
          .filter(Boolean)
          .slice(0, 10);
        const deals: Array<{
          id: string;
          name: string | null;
          stage: string | null;
          amount: string | null;
          closed: boolean;
        }> = [];
        for (const dealId of dealIds) {
          const dealRes = await hubspot(
            active.token,
            `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,hs_is_closed`,
          );
          if (!dealRes.ok) continue;
          const p = (dealRes.body as { properties?: Record<string, string | null> })?.properties || {};
          deals.push({
            id: dealId,
            name: p.dealname ?? null,
            stage: p.dealstage ?? null,
            amount: p.amount ?? null,
            closed: p.hs_is_closed === "true",
          });
        }

        return ok({
          linked: true,
          portal_id: row?.portal_id ?? null,
          contact_id: hit.id,
          email: props.email ?? email,
          name: [props.firstname, props.lastname].filter(Boolean).join(" ").trim() || null,
          lifecycle_stage: props.lifecyclestage ?? null,
          lead_status: props.hs_lead_status ?? null,
          rol_lifecycle: props[LIFECYCLE_PROPERTY] ?? null,
          trade_or_direct: props[TRADE_PROPERTY] ?? null,
          owner_name: ownerName,
          created_at: props.createdate ?? null,
          updated_at: props.lastmodifieddate ?? null,
          timeline,
          deals,
        });
      }

      case "get_sync_log": {
        const propertyIds = await ownerPropertyIds();
        const query = admin
          .from("integration_logs")
          .select("id, event, metadata, created_at, property_id")
          .eq("integration_type", SERVICE)
          .order("created_at", { ascending: false })
          .limit(body.limit ?? 25);
        if (propertyIds.length) query.or(`property_id.is.null,property_id.in.(${propertyIds.join(",")})`);
        const { data, error } = await query;
        if (error) return fail(`Could not read the sync log: ${error.message}`, 500);
        return ok({ entries: data || [] });
      }

      // ---- Optional, default-off message logging ----------------------------
      case "set_message_logging": {
        if (!body.message_logging) return fail("message_logging is required", 400);
        const current = (row?.config || {}) as Json;
        const list = Array.isArray(current.message_log_properties)
          ? (current.message_log_properties as string[])
          : [];
        const next = body.message_logging.enabled
          ? Array.from(new Set([...list, body.message_logging.property_id]))
          : list.filter((id) => id !== body.message_logging!.property_id);

        const { data: saved, error } = await admin
          .from("owner_integrations")
          .upsert(
            { owner_id: ownerId, service: SERVICE, config: { ...current, message_log_properties: next } },
            { onConflict: "owner_id,service" },
          )
          .select("*")
          .single();
        if (error) return fail(`Could not update message logging: ${error.message}`, 500);
        await logEvent("message_logging_changed", {
          property_id: body.message_logging.property_id,
          enabled: body.message_logging.enabled,
        }, body.message_logging.property_id);
        return ok({
          ...statusPayload(saved as typeof row),
          message_log_properties: next,
        });
      }

      case "log_message_event": {
        const active = await requireActive();
        if (active instanceof Response) return active;
        if (!body.message_event) return fail("message_event is required", 400);

        const ev = body.message_event;
        const allowed = Array.isArray((active.config as Json).message_log_properties)
          ? ((active.config as Json).message_log_properties as string[])
          : [];
        // Default OFF: the automatic path only runs for opted-in properties.
        // An explicit operator action (`force`) bypasses the per-property flag.
        if (!ev.force && !(ev.property_id && allowed.includes(ev.property_id))) {
          return ok({ skipped: true, reason: "logging_disabled" });
        }

        const contactId = await findContactId(active.token, ev.email);
        if (!contactId) {
          await logEvent("message_log_skipped", { email: ev.email, reason: "contact_not_found" }, ev.property_id);
          return ok({ skipped: true, reason: "contact_not_found" });
        }

        const heading = ev.subject || `ROL'OS message${ev.event ? ` · ${ev.event}` : ""}`;
        const res = await hubspot(active.token, "/crm/v3/objects/notes", {
          method: "POST",
          body: JSON.stringify({
            properties: {
              hs_timestamp: new Date().toISOString(),
              hs_note_body: [heading, ev.body].filter(Boolean).join("\n\n"),
            },
            associations: [
              {
                to: { id: contactId },
                types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
              },
            ],
          }),
        });
        if (!res.ok) {
          // Never fail the caller: native delivery already succeeded.
          await logEvent("message_log_failed", { email: ev.email, status: res.status }, ev.property_id);
          return ok({ skipped: true, reason: "hubspot_rejected", status: res.status });
        }
        await logEvent("message_logged", { email: ev.email, event: ev.event ?? null }, ev.property_id);
        return ok({ note_id: (res.body as { id?: string })?.id ?? null, contact_id: contactId });
      }


      case "sync_owner": {
        const active = await requireActive();
        if (active instanceof Response) return active;

        // Soft sync: verify the portal, then push the owner's properties as
        // companies and their reservations as contacts + deals. When `since`
        // is supplied only records changed after that moment are pushed, which
        // is what the scheduled delta sweep uses.
        const probe = await hubspot(active.token, "/crm/v3/objects/companies?limit=1");
        if (!probe.ok) {
          await markSync("error", `Sync failed (${probe.status})`);
          return fail("HubSpot sync failed", probe.status, { details: probe.body });
        }

        const since = body.since ?? null;
        const cap = body.limit ?? 50;

        const { data: links } = await admin
          .from("property_owners")
          .select("property_id")
          .eq("user_id", ownerId);
        const propertyIds = (links || []).map((l: { property_id: string }) => l.property_id);

        let companies = 0;
        let contacts = 0;
        let deals = 0;

        if (propertyIds.length) {
          const propQuery = admin
            .from("properties")
            .select("id, name, city, country, updated_at")
            .in("id", propertyIds)
            .eq("is_active", true);
          if (since) propQuery.gt("updated_at", since);
          const { data: props } = await propQuery;

          for (const p of (props || []) as Array<{
            id: string;
            name: string;
            city: string | null;
            country: string | null;
          }>) {
            const res = await upsertCompanyRemote(
              active.token,
              {
                name: p.name,
                ...(p.city ? { city: p.city } : {}),
                ...(p.country ? { country: p.country } : {}),
              },
              p.name,
            );
            if (res.ok) companies += 1;
          }

          const bookingQuery = admin
            .from("bookings")
            .select(
              "id, guest_name, guest_email, guest_phone, total_price, status, check_out_date, booking_reference, is_trade, updated_at",
            )
            .in("property_id", propertyIds)
            .order("updated_at", { ascending: false })
            .limit(cap);
          if (since) bookingQuery.gt("updated_at", since);
          const { data: bookings } = await bookingQuery;

          for (const b of (bookings || []) as Array<Record<string, unknown>>) {
            const segment: "trade" | "direct" = b.is_trade ? "trade" : "direct";
            const email = (b.guest_email as string | null)?.trim();
            const name = ((b.guest_name as string | null) || "").trim();
            const parts = name.split(/\s+/);

            if (email) {
              const contactProps = await withTrade(
                active.token,
                "contacts",
                {
                  email,
                  ...(parts[0] ? { firstname: parts[0] } : {}),
                  ...(parts.length > 1 ? { lastname: parts.slice(1).join(" ") } : {}),
                  ...(b.guest_phone ? { phone: b.guest_phone } : {}),
                },
                segment,
              );
              const res = await upsertContactRemote(active.token, contactProps, email);
              if (res.ok) contacts += 1;
            }

            const label = (b.booking_reference as string | null) || (b.id as string);
            const dealProps = await withTrade(
              active.token,
              "deals",
              {
                dealname: `${label}${name ? ` · ${name}` : ""}`,
                pipeline: (active.config.pipeline_id as string) || "default",
                dealstage: resolveStage(b.status as string | undefined, active.config),
                ...(b.total_price != null ? { amount: String(b.total_price) } : {}),
                ...(b.check_out_date
                  ? { closedate: new Date(b.check_out_date as string).toISOString() }
                  : {}),
              },
              segment,
            );
            const res = await upsertDealRemote(active.token, dealProps, label);
            if (res.ok) {
              deals += 1;
              if (res.id && email) await associateDealContact(active.token, res.id, email);
            }
          }
        }

        await markSync("ok");
        return ok({
          synced: true,
          delta_since: since,
          companies,
          contacts,
          deals,
          properties: propertyIds.length,
        });
      }


    }

    return fail(`Unknown action: ${body.action}`, 400);
  } catch (err) {
    console.error("[hubspot-api] Error:", err);
    return fail(err instanceof Error ? err.message : "Internal error", 500);
  }
});
