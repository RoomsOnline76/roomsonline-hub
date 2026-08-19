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
